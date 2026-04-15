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
const activeStreams = new Map<string, Response[]>();

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

/** Defensive: reach into `raw.message.content` without crashing on junk. */
function getContentBlocks(raw: unknown): Array<Record<string, any>> | null {
  if (!raw || typeof raw !== "object") return null;
  const message = (raw as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  return content as Array<Record<string, any>>;
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
          sub.write(`data: ${JSON.stringify(chunk)}\n\n`);
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
      const subs = activeStreams.get(conversationId) ?? [];
      for (const sub of subs) {
        sub.write(
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

  const subs = activeStreams.get(conversationId) ?? [];
  subs.push(res);
  activeStreams.set(conversationId, subs);

  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepalive);
    const current = activeStreams.get(conversationId) ?? [];
    const remaining = current.filter((r) => r !== res);
    if (remaining.length === 0) {
      activeStreams.delete(conversationId);
    } else {
      activeStreams.set(conversationId, remaining);
    }
  });
});

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
