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
 * Persistence: the CLI writes its own JSONL session files when
 * `--no-session-persistence` is absent (removed in task002). The scanner
 * picks those files up for analytics, cost, and session timeline — this
 * route no longer writes to any store directly.
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
 * No-op when no subscribers are attached.
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

router.post("/prompt", async (req: Request, res: Response) => {
  if (!(await isClaudeAvailable())) {
    return res.status(503).json({ error: "Claude CLI not installed" });
  }
  const { conversationId, text } = req.body ?? {};
  if (!conversationId || !text) {
    return res.status(400).json({ error: "conversationId and text required" });
  }

  res.json({ ok: true });

  // Look up a previously captured CLI session ID for this conversation so we
  // can resume it. When present, the CLI continues the existing JSONL session
  // (full prior context + same file); when absent (first message), the CLI
  // allocates a fresh session and we capture its ID from the init envelope
  // below. Fixes chat-ux-cleanup-task002 — without this, every turn spawned
  // a new session so prior messages were invisible and unreferenced by Claude.
  let existingSessionId: string | undefined;
  try {
    existingSessionId = getDB().chatSessions[conversationId]?.sessionId;
  } catch {
    // DB read failed — fall through with undefined (acts like first turn).
  }

  // Fire-and-forget streaming to every subscriber of this conversationId.
  // The CLI writes its own JSONL session file — no server-side persistence
  // needed. We just fan out raw chunks over SSE for the chat UI.
  (async () => {
    try {
      for await (const chunk of runClaudeStreaming({
        prompt: text,
        sessionId: existingSessionId,
      })) {
        // Capture session ID from CLI stream init envelope
        if (
          chunk &&
          typeof chunk === "object" &&
          (chunk as any).type === "system" &&
          (chunk as any).raw?.subtype === "init" &&
          (chunk as any).raw?.session_id
        ) {
          try {
            const db = getDB();
            const sid = (chunk as any).raw.session_id as string;
            db.chatSessions[conversationId] = {
              sessionId: sid,
              title: text.slice(0, 80),
              createdAt: new Date().toISOString(),
            };
            save();
          } catch (e) {
            console.warn("[chat] failed to store session ID:", e);
          }
        }
        const subs = activeStreams.get(conversationId) ?? [];
        for (const sub of subs) {
          sub.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
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

export default router;
