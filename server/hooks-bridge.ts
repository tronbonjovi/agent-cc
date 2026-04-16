/**
 * Hook event bridge (task005 — chat-workflows-tabs).
 *
 * Adapts Claude Code `settings.json` hook fires into `chat-hook` source
 * `InteractionEvent`s. The hook-command itself (configured in the user's
 * `~/.claude/settings.json`) POSTs a JSON payload to
 * `POST /api/chat/hook-event`; this module turns that payload into a
 * persisted + broadcast event on whichever chat tab is currently active.
 *
 * Routing rule: events always go to `chatUIState.activeTabId` when one is
 * set, and fall back to the synthetic `hook-background` conversation when
 * no tab is active. The `hook-background` id is NOT a real tab — it just
 * lets us keep a coherent history for hooks that fire outside any UI
 * session (e.g. from a CLI session running in parallel).
 *
 * ARCHON HYGIENE: this module must NEVER start a subprocess or evaluate
 * user-supplied strings as code. It's a pure event-adapter. A source-text
 * guardrail in `tests/hooks-bridge.test.ts` pins that invariant so a future
 * refactor can't accidentally widen the attack surface.
 */
import { randomUUID } from 'node:crypto';
import type {
  InteractionEvent,
  SystemContent,
} from '../shared/types';
import { insertEvent } from './interactions-repo';
import { broadcastChatEvent } from './routes/chat';
import { getDB } from './db';

/**
 * Minimum shape the bridge expects from a hook-command JSON payload. `hook`
 * is required (the Claude Code lifecycle event name — e.g. `PostToolUse`,
 * `SessionStart`). Everything else is freeform and lands in `content.data`
 * verbatim so users can stuff whatever context their hook command knows
 * about (tool name, matched pattern, exit code, etc.).
 */
export interface HookPayload {
  hook: string;
  tool?: string;
  [key: string]: unknown;
}

/**
 * Build, persist, and broadcast a single `chat-hook` event from a hook
 * payload. Returns the event so the HTTP route can surface its id back to
 * the caller (useful when hook commands want to correlate their fire with a
 * specific persisted row).
 *
 * Three side effects in this order:
 *   1. Resolve the target conversation id from `chatUIState.activeTabId`,
 *      falling back to `hook-background` when no tab is active.
 *   2. `insertEvent` — persist to the interactions store so the history
 *      query picks it up on the next revalidation.
 *   3. `broadcastChatEvent` — fan out a `{ type: 'hook_event', event }`
 *      chunk over the existing SSE channel, parallel to task004's
 *      `workflow_event` frame. Clients use this as a revalidation trigger
 *      (rich mid-stream rendering is deferred to task006).
 */
export function recordHookEvent(payload: HookPayload): InteractionEvent {
  const db = getDB();
  const conversationId = db.chatUIState?.activeTabId ?? 'hook-background';

  // Human-readable one-liner for the event header — "<HookName> — <tool>"
  // when a tool is provided, otherwise just the hook name. The full payload
  // is still preserved in `content.data` for anyone who wants to drill in.
  const headline = payload.tool
    ? `${payload.hook} — ${payload.tool}`
    : payload.hook;

  const content: SystemContent = {
    type: 'system',
    subtype: 'hook_fire',
    text: headline,
    data: payload,
  };

  const event: InteractionEvent = {
    id: randomUUID(),
    conversationId,
    parentEventId: null,
    timestamp: new Date().toISOString(),
    source: 'chat-hook',
    role: 'system',
    content,
    cost: null,
  };

  insertEvent(event);
  broadcastChatEvent(conversationId, { type: 'hook_event', event });

  return event;
}
