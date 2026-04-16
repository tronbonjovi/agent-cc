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
 * DELETE /api/chat/stream/:conversationId
 *   — Tears down an SSE stream subscription.
 *
 * Session persistence: `--no-session-persistence` has been removed so the
 * Claude CLI now writes its own JSONL session file. We capture the session
 * ID from the CLI's `system/init` envelope and store a chatSession mapping
 * in the JSON config so the scanner can correlate the JSONL back to the
 * originating chat tab.
 *
 * Claude CLI availability is checked via isClaudeAvailable() before spawning
 * (returns 503 when not installed, per CLAUDE.md safety rule #4).
 */
import { Router, type Request, type Response } from "express";
import { runClaudeStreaming, isClaudeAvailable } from "../scanner/claude-runner";
import { getDB, save } from "../db";

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
 * No-op when no subscribers are attached. `try/catch` on each write
 * tolerates half-closed sockets: fan-out prunes dead subscribers on the
 * next tick via the `req.on('close')` handler installed in the
 * `/stream/:id` route.
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
 * Extract the session ID from a CLI `system/init` envelope. Shape:
 *   { type: "system", subtype: "init", session_id: "..." }
 * Returns null when the envelope doesn't match.
 */
function extractSessionId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type === "system" && obj.subtype === "init" && typeof obj.session_id === "string") {
    return obj.session_id;
  }
  return null;
}

router.post("/prompt", async (req: Request, res: Response) => {
  if (!(await isClaudeAvailable())) {
    return res.status(503).json({ error: "Claude CLI not installed" });
  }
  const { conversationId, text } = req.body ?? {};
  if (!conversationId || !text) {
    return res.status(400).json({ error: "conversationId and text required" });
  }

  res.json({ ok: true });

  // Fire-and-forget streaming to every subscriber of this conversationId.
  (async () => {
    try {
      for await (const chunk of runClaudeStreaming({ prompt: text })) {
        // Fan out to SSE subscribers.
        const subs = activeStreams.get(conversationId) ?? [];
        for (const sub of subs) {
          sub.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        if (chunk.type === "system") {
            // Capture session ID from the CLI's init envelope and store
            // the chat-to-session mapping so the scanner can correlate
            // the JSONL file back to this chat tab.
            const sessionId = extractSessionId(chunk.raw);
            if (sessionId) {
              try {
                const db = getDB();
                db.chatSessions[sessionId] = {
                  tabId: conversationId,
                  startedAt: new Date().toISOString(),
                };
                save();
              } catch (err) {
                console.warn(
                  "[chat] failed to persist chatSession mapping:",
                  (err as Error).message ?? err,
                );
              }
            }
        }
      }
    } catch (err) {
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
 */
export function shutdownChatStreams(): void {
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

export default router;
