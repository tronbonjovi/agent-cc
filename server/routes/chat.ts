/**
 * Walking-skeleton chat pipe.
 *
 * POST /api/chat/prompt
 *   — Dispatches a user prompt to the Claude CLI via runClaudeStreaming().
 *     Replies 200 immediately; chunks are pushed out-of-band to any SSE
 *     subscribers listening on the same conversationId.
 *
 * GET  /api/chat/stream/:conversationId
 *   — Subscribes to SSE chunks for a conversation. No persistence — state
 *     lives in an in-memory map for the skeleton.
 *
 * Claude CLI availability is checked via isClaudeAvailable() before spawning
 * (returns 503 when not installed, per CLAUDE.md safety rule #4).
 */
import { Router, type Request, type Response } from "express";
import { runClaudeStreaming, isClaudeAvailable } from "../scanner/claude-runner";

// In-memory conversation → subscribed SSE responses.
// The skeleton makes no effort to persist, fan-out is best-effort.
const activeStreams = new Map<string, Response[]>();

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

  // Fire-and-forget streaming to every subscriber of this conversationId.
  (async () => {
    try {
      for await (const chunk of runClaudeStreaming({ prompt: text })) {
        const subs = activeStreams.get(conversationId) ?? [];
        for (const sub of subs) {
          sub.write(`data: ${JSON.stringify(chunk)}\n\n`);
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

export default router;
