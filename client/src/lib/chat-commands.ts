// client/src/lib/chat-commands.ts
//
// Client-side slash command parser and dispatcher shipped in
// chat-workflows-tabs-task003.
//
// Archon pattern — read before touching this file:
//
//   The chat input is AI-only. Deterministic operations only reach the
//   system through explicit workflow names routed via a server-side
//   executor at POST /api/chat/workflow. The client does NOT hold a
//   static registry of workflow names (no COMMAND_REGISTRY constant) —
//   the server is the source of truth and returns 404 when a workflow
//   name is unknown, which is the caller's signal to fall through to the
//   normal AI prompt path.
//
//   The client NEVER shells out. It posts structured JSON and lets the
//   server decide what to run. That closes the entire shell-injection
//   attack surface. A source-text guardrail in
//   tests/chat-commands-source.test.ts pins this invariant — if you find
//   yourself wanting to import `child_process`, `exec`, `spawn`, or
//   `shell` in this file, STOP: you are in the wrong layer.
//
// Server side (POST /api/chat/workflow) is task004's deliverable. Until
// that lands, every dispatch will 404 (the route doesn't exist) and fall
// through to AI — which is the correct behaviour for an unrecognised
// command.

export interface ParsedCommand {
  name: string;
  args: string;
  raw: string;
}

/**
 * Parse a chat input into a slash command descriptor, or return `null`
 * if the input is not a slash command and should be sent to AI as a
 * normal prompt.
 *
 * Rules:
 *   - Leading whitespace is trimmed before the slash check, so `"  /cmd"`
 *     still parses as a command. The `raw` field on the returned object
 *     is the trimmed form (what the server actually receives), not the
 *     original input.
 *   - A lone `/` or `/` followed only by whitespace is NOT a command —
 *     there's no name to dispatch, so we return null and let the caller
 *     treat it as a normal (empty-ish) prompt.
 *   - Interior whitespace is collapsed: `"/cmd   a   b"` becomes
 *     `{ name: "cmd", args: "a b" }`. We use `.filter(Boolean)` on the
 *     split to drop the empty strings that `split(/\s+/)` produces for
 *     runs of whitespace.
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trimStart().trimEnd();
  if (!trimmed.startsWith('/')) return null;
  const rest = trimmed.slice(1);
  const [name, ...argWords] = rest.split(/\s+/).filter(Boolean);
  if (!name) return null;
  return {
    name,
    args: argWords.join(' '),
    raw: trimmed,
  };
}

export interface DispatchResult {
  /**
   * `true`  → the server accepted the command (2xx). The caller must NOT
   *           also POST to the AI prompt endpoint — the server will emit
   *           the command's output over the existing SSE stream.
   * `false` → the server returned 404 (unknown workflow). The caller
   *           should fall through and POST the raw input to AI as a
   *           normal prompt.
   *
   * Any other non-OK response (5xx, network failure) is thrown, NOT
   * returned as `{ handled: false }` — falling through on a real error
   * would double-execute on transient backend hiccups.
   */
  handled: boolean;
}

/**
 * POST a parsed slash command to the server-side workflow executor.
 *
 * Contract with task004's server endpoint:
 *   - URL:      POST /api/chat/workflow
 *   - Body:     { conversationId, workflow, args, raw }  (JSON)
 *   - 2xx:      { handled: true }  — server accepted, will stream result
 *               over the existing SSE stream for `conversationId`
 *   - 404:      { handled: false } — unknown workflow, fall through to AI
 *   - other:    throw — caller's try/catch surfaces the error and aborts
 *               the send (does NOT fall through)
 */
export async function dispatchCommand(
  parsed: ParsedCommand,
  conversationId: string,
): Promise<DispatchResult> {
  const res = await fetch('/api/chat/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      workflow: parsed.name,
      args: parsed.args,
      raw: parsed.raw,
    }),
  });
  if (res.status === 404) return { handled: false };
  if (!res.ok) {
    throw new Error(
      `Workflow dispatch failed: ${res.status} ${res.statusText}`,
    );
  }
  return { handled: true };
}
