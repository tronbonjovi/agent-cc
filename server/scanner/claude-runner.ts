/**
 * Shared utility for running `claude -p` as a subprocess.
 * Used by: session-summarizer, nl-query, ai-suggest
 */
import { spawn } from "child_process";

/** Cached availability result so repeated calls don't re-spawn `claude --version`. */
let claudeAvailabilityCache: boolean | null = null;

/**
 * Returns true if the Claude CLI is installed and responsive.
 * Result is cached for the lifetime of the process — call `resetClaudeAvailabilityCache()` to force a recheck.
 */
export function isClaudeAvailable(): Promise<boolean> {
  if (claudeAvailabilityCache !== null) return Promise.resolve(claudeAvailabilityCache);
  return new Promise<boolean>((resolve) => {
    try {
      const env = buildClaudeEnv();
      const child = spawn("claude", ["--version"], {
        env,
        stdio: ["ignore", "ignore", "ignore"],
      });
      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        claudeAvailabilityCache = false;
        resolve(false);
      }, 5000);
      child.on("error", () => {
        clearTimeout(timeout);
        claudeAvailabilityCache = false;
        resolve(false);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const ok = code === 0;
        claudeAvailabilityCache = ok;
        resolve(ok);
      });
    } catch {
      claudeAvailabilityCache = false;
      resolve(false);
    }
  });
}

/** Reset the cached availability check — primarily for tests. */
export function resetClaudeAvailabilityCache(): void {
  claudeAvailabilityCache = null;
}

interface RunClaudeOpts {
  model?: string;
  timeoutMs?: number;
  maxTurns?: number;
  cwd?: string;
  onOutput?: (chunk: string) => void;
}

/** Build the argument array for claude CLI */
export function buildClaudeArgs(opts: Pick<RunClaudeOpts, "model" | "maxTurns">): string[] {
  const { model = "haiku", maxTurns = 1 } = opts;
  return ["-p", "--model", model, "--max-turns", String(maxTurns)];
}

/** Build a clean environment for claude subprocess */
export function buildClaudeEnv(): Record<string, string | undefined> {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.CLAUDECODE;
  return env;
}

/** Run claude -p with a prompt, return the stdout */
export function runClaude(prompt: string, opts: RunClaudeOpts = {}): Promise<string> {
  const { timeoutMs = 60000, cwd, onOutput } = opts;

  return new Promise((resolve, reject) => {
    const env = buildClaudeEnv();
    const args = buildClaudeArgs(opts);
    const child = spawn("claude", args, {
      env,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onOutput) onOutput(chunk);
    });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Options for the streaming variant of runClaude. */
export interface StreamingClaudeOptions {
  prompt: string;
  timeoutMs?: number; // default 60000
  signal?: AbortSignal;
  /**
   * Optional Claude CLI session UUID to resume. When provided, `--resume <id>`
   * is added to the CLI argv so the CLI continues an existing conversation
   * (appending turns to the same JSONL file) instead of spawning a fresh
   * session. Used by the chat route to preserve conversation context across
   * prompts on the same tab — see `chat-ux-cleanup-task002`.
   *
   * Omit for the first message of a conversation; the CLI will generate a new
   * session ID and emit it via the stream init envelope, which the caller then
   * stores for subsequent prompts.
   */
  sessionId?: string;
  /**
   * Optional Claude model ID to use for this turn (e.g. `claude-opus-4-6`,
   * `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). When provided, the
   * CLI receives `--model <id>` and uses that model; when omitted, the CLI
   * falls back to its configured default. Wired through from the composer
   * model dropdown — see `chat-composer-controls-task003`.
   */
  model?: string;
}

/** A single parsed chunk yielded by runClaudeStreaming. */
export interface StreamChunk {
  type: "text" | "tool_call" | "tool_result" | "thinking" | "system" | "done";
  raw: unknown; // parsed JSON line (or null for the final `done` chunk)
}

/**
 * Classify a parsed stream-json line into a StreamChunk type.
 * stream-json from `claude -p` is newline-delimited JSON with shapes like:
 *   { type: "system", subtype: "init", ... }
 *   { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 *   { type: "assistant", message: { content: [{ type: "tool_use", ... }] } }
 *   { type: "assistant", message: { content: [{ type: "thinking", ... }] } }
 *   { type: "user",      message: { content: [{ type: "tool_result", ... }] } }
 *   { type: "result", ... }
 */
function classifyStreamLine(line: unknown): StreamChunk["type"] {
  if (!line || typeof line !== "object") return "system";
  const obj = line as Record<string, unknown>;
  const top = obj.type;

  if (top === "system" || top === "result") return "system";

  const message = obj.message as Record<string, unknown> | undefined;
  const content = message?.content as Array<Record<string, unknown>> | undefined;
  const firstBlockType =
    Array.isArray(content) && content.length > 0
      ? (content[0]?.type as string | undefined)
      : undefined;

  if (top === "assistant") {
    if (firstBlockType === "tool_use") return "tool_call";
    if (firstBlockType === "thinking") return "thinking";
    if (firstBlockType === "text") return "text";
    return "text";
  }
  if (top === "user") {
    if (firstBlockType === "tool_result") return "tool_result";
    return "system";
  }
  return "system";
}

/**
 * Streaming variant of runClaude — spawns `claude -p --output-format stream-json`
 * and yields parsed JSON chunks as they arrive. Preserves all safety guarantees
 * of runClaude: no session persistence, CLAUDECODE stripped from env, timeout + abort.
 */
export async function* runClaudeStreaming(
  opts: StreamingClaudeOptions,
): AsyncGenerator<StreamChunk> {
  const { prompt, timeoutMs = 60000, signal, sessionId, model } = opts;

  const env = buildClaudeEnv();
  // `--verbose` is mandatory when combining `-p` (print mode) with
  // `--output-format stream-json`; the CLI exits 1 without it.
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  // When a sessionId is provided, ask the CLI to resume that conversation so
  // the model has full prior context and the new turn is appended to the same
  // JSONL file (which the scanner then reads back as history). Omit for the
  // first turn — the CLI will allocate a fresh session ID.
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  // When a model is provided, pin this turn to that model via `--model`. When
  // omitted, the CLI uses its configured default. Wired from the composer
  // model dropdown — see `chat-composer-controls-task003`.
  if (model) {
    args.push("--model", model);
  }

  const child = spawn("claude", args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Queue-based bridge between event callbacks and the async generator.
  type Event =
    | { kind: "chunk"; chunk: StreamChunk }
    | { kind: "error"; error: Error }
    | { kind: "end" };

  const queue: Event[] = [];
  let waiter: ((v: void) => void) | null = null;
  const wake = () => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };
  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      if (queue.length > 0) resolve();
      else waiter = resolve;
    });

  // Inactivity timeout — resets whenever we get data or a chunk.
  let timer: NodeJS.Timeout | null = null;
  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      queue.push({
        kind: "error",
        error: new Error(`Claude streaming timed out after ${timeoutMs / 1000}s`),
      });
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      wake();
    }, timeoutMs);
  };
  resetTimer();

  // External abort signal
  const onAbort = () => {
    queue.push({
      kind: "error",
      error: new Error("Claude streaming aborted"),
    });
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    wake();
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort);
  }

  // Newline-delimited JSON buffering
  let buffer = "";
  let stderr = "";

  child.stdout.on("data", (data: Buffer) => {
    resetTimer();
    buffer += data.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        queue.push({
          kind: "chunk",
          chunk: { type: classifyStreamLine(parsed), raw: parsed },
        });
        wake();
      } catch {
        // Skip lines that aren't valid JSON (stray output)
      }
    }
  });

  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("error", (err: Error) => {
    queue.push({ kind: "error", error: err });
    wake();
  });

  child.on("close", (code: number | null) => {
    if (code && code !== 0) {
      queue.push({
        kind: "error",
        error: new Error(
          `Claude exited with code ${code}: ${stderr.slice(0, 500)}`,
        ),
      });
    } else {
      queue.push({ kind: "end" });
    }
    wake();
  });

  try {
    while (true) {
      if (queue.length === 0) await waitForEvent();
      const ev = queue.shift();
      if (!ev) continue;
      if (ev.kind === "error") throw ev.error;
      if (ev.kind === "end") {
        yield { type: "done", raw: null };
        return;
      }
      yield ev.chunk;
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    // Ensure subprocess is not left dangling if the consumer stops early
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Parse JSON from Claude output (handles markdown fences) */
export function parseClaudeJson(raw: string): Record<string, unknown> | unknown[] | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence !== -1) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
