/**
 * Walking-skeleton chat pipe.
 *
 * POST /api/chat/prompt
 *   — Dispatches a user prompt to the Claude CLI via runClaudeStreaming().
 *     Replies 200 immediately; chunks are pushed out-of-band to any SSE
 *     subscribers listening on the same conversationId.
 *
 * GET  /api/chat/stream/:conversationId
 *   — Subscribes to SSE chunks for a conversation. No persistence of stream
 *     *subscriptions* — state lives in an in-memory map for the skeleton.
 *
 * Event persistence (task004 — unified-capture):
 *   Every user prompt and every stream chunk is also persisted as an
 *   `InteractionEvent` via `interactions-repo.insertEvent`. Text chunks are
 *   coalesced into one assistant event at stream end; tool calls, tool
 *   results, and thinking blocks are inserted as separate events as they
 *   arrive. Persistence is a side effect of the SSE flow — if `insertEvent`
 *   throws, we log and keep streaming so a database hiccup never breaks the
 *   user's chat.
 *
 * Claude CLI availability is checked via isClaudeAvailable() before spawning
 * (returns 503 when not installed, per CLAUDE.md safety rule #4).
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { runClaudeStreaming, isClaudeAvailable } from "../scanner/claude-runner";
import {
  insertEvent,
  listConversations,
  getEventsByConversation,
} from "../interactions-repo";
import type {
  InteractionEvent,
  InteractionContent,
  InteractionCost,
  InteractionRole,
  InteractionSource,
} from "../../shared/types";
import { getContentBlocks } from "../../shared/chat-chunk";

/**
 * Sources that represent "chat" conversations for the task005 load API.
 * Scanner-imported conversations (source `scanner-jsonl`) surface elsewhere
 * in the app, so we exclude them from the chat history list.
 */
const CHAT_SOURCES: ReadonlySet<InteractionSource> = new Set<InteractionSource>([
  "chat-ai",
  "chat-slash",
  "chat-hook",
  "chat-workflow",
]);

// In-memory conversation → subscribed SSE responses.
// The skeleton makes no effort to persist, fan-out is best-effort.
//
// Each subscriber owns a 15s keepalive interval created at subscribe time
// and cleared on natural disconnect. We track the handle alongside the
// response so `shutdownChatStreams()` can walk every active subscriber,
// clear the interval (otherwise the node event loop stays alive), and end
// the HTTP response — without that, `systemctl stop agent-cc` sat in
// `deactivating (stop-sigterm)` for 90s on every deploy because the open
// SSE sockets + intervals kept the process "working" until SIGKILL.
interface ActiveSub {
  res: Response;
  keepalive: NodeJS.Timeout;
}
const activeStreams = new Map<string, ActiveSub[]>();

/**
 * Fan an SSE chunk out to every active subscriber on a conversation.
 *
 * Added for task004 (chat-workflows-tabs) so `server/routes/chat-workflows.ts`
 * can push `{ type: 'workflow_event', event }` frames without opening its
 * own SSE channel — workflows reuse the existing `/api/chat/stream/:id`
 * connection that the chat panel already holds open.
 *
 * No-op when no subscribers are attached (the workflow still persists the
 * event via `insertEvent`, so the next history revalidation hydrates it).
 * `try/catch` on each write tolerates half-closed sockets: fan-out prunes
 * dead subscribers on the next tick via the `req.on('close')` handler
 * installed in the `/stream/:id` route.
 */
export function broadcastChatEvent(
  conversationId: string,
  chunk: unknown,
): void {
  const subs = activeStreams.get(conversationId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(chunk)}\n\n`;
  for (const sub of subs) {
    try {
      sub.res.write(payload);
    } catch {
      // subscriber closed — fan-out loop will prune on next tick
    }
  }
}

const router = Router();

/**
 * Build a fresh `InteractionEvent` for the chat-ai source.
 * Keeps id/timestamp/source boilerplate out of the per-chunk call sites.
 */
function buildEvent(
  conversationId: string,
  role: InteractionRole,
  content: InteractionContent,
  cost: InteractionCost | null = null,
): InteractionEvent {
  return {
    id: randomUUID(),
    conversationId,
    parentEventId: null,
    timestamp: new Date().toISOString(),
    source: "chat-ai",
    role,
    content,
    cost,
  };
}

/**
 * Persist an event, swallowing failures so a DB hiccup never kills the
 * streaming pipe. The user sees their chat finish even if the sink breaks;
 * we just log for operator diagnosis.
 */
function safePersist(event: InteractionEvent): void {
  try {
    insertEvent(event);
  } catch (err) {
    console.error("[chat] insertEvent failed:", (err as Error).message ?? err);
  }
}

/**
 * Extract text from a stream-json "text" chunk. The CLI emits:
 *   { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 * We concatenate every text block on the line in case the CLI ever batches
 * multiple into one envelope. Returns "" on malformed shapes.
 */
function extractText(raw: unknown): string {
  const content = getContentBlocks(raw);
  if (!content) return "";
  let out = "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      out += block.text;
    }
  }
  return out;
}

/** Pull the first `tool_use` block out of an assistant envelope, if any. */
function extractToolUse(raw: unknown): {
  id: string;
  name: string;
  input: unknown;
} | null {
  const content = getContentBlocks(raw);
  if (!content) return null;
  for (const block of content) {
    if (block?.type === "tool_use") {
      return {
        id: String(block.id ?? ""),
        name: String(block.name ?? ""),
        input: block.input,
      };
    }
  }
  return null;
}

/** Pull the first `tool_result` block out of a user envelope, if any. */
function extractToolResult(raw: unknown): {
  toolUseId: string;
  output: unknown;
  isError?: boolean;
} | null {
  const content = getContentBlocks(raw);
  if (!content) return null;
  for (const block of content) {
    if (block?.type === "tool_result") {
      return {
        toolUseId: String(block.tool_use_id ?? ""),
        output: block.content,
        isError: block.is_error === true ? true : undefined,
      };
    }
  }
  return null;
}

/** Pull the first `thinking` block out of an assistant envelope, if any. */
function extractThinking(raw: unknown): string | null {
  const content = getContentBlocks(raw);
  if (!content) return null;
  for (const block of content) {
    if (block?.type === "thinking") {
      // Claude stream-json uses `thinking` as the text field; fall back to
      // `text` defensively in case the shape drifts.
      if (typeof block.thinking === "string") return block.thinking;
      if (typeof block.text === "string") return block.text;
    }
  }
  return null;
}

/**
 * Extract cost info from a stream-json `result` line. Fields are best-effort:
 * whatever the CLI emits we pass through, zero-filling the required numeric
 * fields so downstream consumers don't have to guard for NaN. Returns null
 * when the payload doesn't look like a result envelope so we can skip the
 * cost attribution entirely.
 */
function extractCost(raw: unknown): InteractionCost | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, any>;
  if (obj.type !== "result") return null;
  const usage = (obj.usage as Record<string, any> | undefined) ?? {};
  const usd =
    typeof obj.total_cost_usd === "number"
      ? obj.total_cost_usd
      : typeof obj.cost_usd === "number"
        ? obj.cost_usd
        : 0;
  return {
    usd,
    tokensIn: Number(usage.input_tokens ?? 0),
    tokensOut: Number(usage.output_tokens ?? 0),
    cacheReadTokens:
      usage.cache_read_input_tokens !== undefined
        ? Number(usage.cache_read_input_tokens)
        : undefined,
    cacheCreationTokens:
      usage.cache_creation_input_tokens !== undefined
        ? Number(usage.cache_creation_input_tokens)
        : undefined,
    durationMs: Number(obj.duration_ms ?? 0),
    model: typeof obj.model === "string" ? obj.model : undefined,
  };
}

router.post("/prompt", async (req: Request, res: Response) => {
  if (!(await isClaudeAvailable())) {
    return res.status(503).json({ error: "Claude CLI not installed" });
  }
  const { conversationId, text } = req.body ?? {};
  if (!conversationId || !text) {
    return res.status(400).json({ error: "conversationId and text required" });
  }

  // Persist the user event BEFORE dispatching so it's durable even if the
  // CLI fails to start. This is the first row written for the conversation.
  safePersist(
    buildEvent(conversationId, "user", { type: "text", text }),
  );

  res.json({ ok: true });

  // Fire-and-forget streaming to every subscriber of this conversationId.
  (async () => {
    // Coalesce assistant text across the whole turn — we emit one assistant
    // event at `done` rather than one per chunk. Tool calls / results /
    // thinking are persisted eagerly with their own ids.
    let assistantTextBuffer = "";
    let capturedCost: InteractionCost | null = null;

    try {
      for await (const chunk of runClaudeStreaming({ prompt: text })) {
        // Fan out to SSE subscribers first so persistence latency never
        // delays user-visible output.
        const subs = activeStreams.get(conversationId) ?? [];
        for (const sub of subs) {
          sub.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        switch (chunk.type) {
          case "text": {
            assistantTextBuffer += extractText(chunk.raw);
            break;
          }
          case "tool_call": {
            const tu = extractToolUse(chunk.raw);
            if (tu) {
              safePersist(
                buildEvent(conversationId, "assistant", {
                  type: "tool_call",
                  toolName: tu.name,
                  input: tu.input,
                  toolUseId: tu.id,
                }),
              );
            }
            break;
          }
          case "tool_result": {
            const tr = extractToolResult(chunk.raw);
            if (tr) {
              safePersist(
                buildEvent(conversationId, "tool", {
                  type: "tool_result",
                  toolUseId: tr.toolUseId,
                  output: tr.output,
                  isError: tr.isError,
                }),
              );
            }
            break;
          }
          case "thinking": {
            const thinkingText = extractThinking(chunk.raw);
            if (thinkingText !== null) {
              safePersist(
                buildEvent(conversationId, "assistant", {
                  type: "thinking",
                  text: thinkingText,
                }),
              );
            }
            break;
          }
          case "system": {
            // `result` envelopes carry cost; stash it so we can attach the
            // number to the assistant event we emit on `done`. We don't
            // persist the system envelope itself in M1 — it's CLI framing.
            const maybeCost = extractCost(chunk.raw);
            if (maybeCost) capturedCost = maybeCost;
            break;
          }
          case "done": {
            // Flush the coalesced assistant text. Empty turns (e.g. a pure
            // tool-call turn with no narrative text) don't get an empty
            // assistant row.
            if (assistantTextBuffer.length > 0) {
              safePersist(
                buildEvent(
                  conversationId,
                  "assistant",
                  { type: "text", text: assistantTextBuffer },
                  capturedCost,
                ),
              );
            }
            break;
          }
        }
      }
    } catch (err) {
      // Log before fan-out so a failure is visible in server logs even when
      // no SSE subscribers are attached. Bug C shipped because this branch
      // only notified subscribers, and the failing CLI invocation left the
      // assistant-event write path silently empty.
      console.error(
        "[chat] stream failed for",
        conversationId,
        "—",
        (err as Error).message ?? err,
      );
      const subs = activeStreams.get(conversationId) ?? [];
      for (const sub of subs) {
        sub.res.write(
          `data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`,
        );
      }
    }
  })();
});

router.get("/stream/:conversationId", (req: Request, res: Response) => {
  const rawId = req.params.conversationId;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  const sub: ActiveSub = { res, keepalive };
  const subs = activeStreams.get(conversationId) ?? [];
  subs.push(sub);
  activeStreams.set(conversationId, subs);

  req.on("close", () => {
    clearInterval(keepalive);
    const current = activeStreams.get(conversationId) ?? [];
    const remaining = current.filter((s) => s.res !== res);
    if (remaining.length === 0) {
      activeStreams.delete(conversationId);
    } else {
      activeStreams.set(conversationId, remaining);
    }
  });
});

/**
 * Tear down every active SSE subscriber so the node event loop can drain
 * and the process can exit cleanly on SIGTERM / SIGINT. Called from the
 * top-level signal handler in `server/index.ts`. Idempotent: calling it on
 * an empty map is a no-op.
 *
 * Order of operations per subscriber:
 *   1. Clear the 15s keepalive interval (otherwise the loop stays alive).
 *   2. Write a terminal `{ type: "close", reason: "shutdown" }` SSE frame
 *      so any attached client can distinguish "server going away" from a
 *      transient disconnect without retry.
 *   3. End the HTTP response so the socket closes.
 *
 * Writes are wrapped in try/catch because by the time we get here the
 * underlying socket may already be half-closed; we want to continue
 * tearing down the rest of the map regardless.
 */
export function shutdownChatStreams(): void {
  // Snapshot the values up front so iteration is stable even if something
  // else mutates the map during teardown.
  const allSubs = Array.from(activeStreams.values());
  for (const subs of allSubs) {
    for (const sub of subs) {
      clearInterval(sub.keepalive);
      try {
        sub.res.write(
          `data: ${JSON.stringify({ type: "close", reason: "shutdown" })}\n\n`,
        );
      } catch {
        // Socket already dead — drop the frame and keep tearing down.
      }
      try {
        sub.res.end();
      } catch {
        // res.end on an already-ended response is harmless but noisy.
      }
    }
  }
  activeStreams.clear();
}

// ---------------------------------------------------------------------------
// task005 — chat load API
//
// These endpoints back the frontend chat store's history load on mount.
// Scanner-imported conversations are intentionally excluded from the list
// endpoint because they surface via the library/scanner UI, not the chat UI.
// No pagination for this milestone — chat histories are small and the
// frontend can always ask for one conversation's events at a time.
// ---------------------------------------------------------------------------

/**
 * GET /api/chat/conversations
 * Returns every chat-sourced conversation, freshest first (ordering comes
 * from `listConversations`, which sorts by `lastEvent` DESC). Empty DB →
 * `{ conversations: [] }` with a 200.
 */
router.get("/conversations", (_req: Request, res: Response) => {
  const all = listConversations();
  const conversations = all.filter((c) => CHAT_SOURCES.has(c.source));
  res.json({ conversations });
});

/**
 * GET /api/chat/conversations/all
 * Returns EVERY conversation across every source — no chat-source filter.
 * Added for chat-import-platforms task004 (unified conversation sidebar):
 * the sidebar groups conversations by source so a user can see scanner-jsonl
 * imports alongside native chat conversations and click through to open or
 * import. Planned external sources (github-issue, telegram, …) aren't wired
 * for ingestion yet, so their groups will render empty by design.
 *
 * Ordering: whatever `listConversations` returns (lastEvent DESC). Empty DB
 * → `{ conversations: [] }` with a 200. The client still needs to render
 * metadata-driven empty sections for planned sources; we don't pre-pad here.
 */
router.get("/conversations/all", (_req: Request, res: Response) => {
  const conversations = listConversations();
  res.json({ conversations });
});

/**
 * GET /api/chat/conversations/:id/events
 * Returns every event for the given conversation in timestamp-ASC order.
 * Unknown id → `{ events: [] }` with a 200 (no 404 — the frontend treats an
 * empty result as "new conversation" rather than a failure).
 */
router.get("/conversations/:id/events", (req: Request, res: Response) => {
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  const events = getEventsByConversation(conversationId);
  res.json({ events });
});

export default router;
