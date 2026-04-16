/**
 * POST /api/chat/workflow — server-side dispatch target for client slash
 * commands (task004, chat-workflows-tabs).
 *
 * Client contract (from task003's `dispatchCommand`):
 *
 *   Request body: { conversationId, workflow, args, raw }  — all strings.
 *
 *   Response codes:
 *     202 Accepted → handled; execution runs async over SSE.
 *     404 Not Found → workflow name not in registry; client falls through
 *                     and POSTs `raw` to /api/chat/prompt as an AI prompt.
 *     400 Bad Request → malformed body; client surfaces error banner.
 *     500 Internal Error → executor setup failure.
 *
 * The 404-vs-error-event distinction is load-bearing: task003's client
 * relies on a SYNCHRONOUS 404 to route typos to AI. A 200 + async error
 * event would silently swallow the prompt instead.
 *
 * Fire-and-forget async runner: we write 202 immediately, then iterate the
 * workflow generator and broadcast each yielded event over the existing chat
 * SSE stream. Errors are logged but do not re-throw — the HTTP response is
 * already closed.
 */
import { Router, type Request, type Response } from 'express';
import { runWorkflow, isKnownWorkflow } from '../chat-workflow-executor';
import { broadcastChatEvent } from './chat';

const router = Router();

router.post('/workflow', async (req: Request, res: Response) => {
  const { conversationId, workflow, args, raw } = (req.body ?? {}) as Record<
    string,
    unknown
  >;

  // Every field is required and must be a string. Reject BEFORE the
  // registry lookup so a malformed body never consumes a 404 slot.
  if (
    typeof conversationId !== 'string' ||
    conversationId.length === 0 ||
    typeof workflow !== 'string' ||
    workflow.length === 0 ||
    typeof args !== 'string' ||
    typeof raw !== 'string'
  ) {
    return res.status(400).json({
      error: 'conversationId, workflow, args, raw required (all strings)',
    });
  }

  // SYNCHRONOUS 404 — critical for task003's fall-through semantics.
  // Do NOT convert this into a 200 + async error event.
  if (!isKnownWorkflow(workflow)) {
    return res.status(404).json({ error: `unknown workflow: ${workflow}` });
  }

  // Accept the request immediately. Execution is async and streamed over
  // the existing chat SSE channel; the client clears the input on 2xx and
  // waits for `workflow_event` frames to arrive.
  res.status(202).json({ ok: true });

  // Fire-and-forget runner. Each iteration broadcasts over SSE.
  (async () => {
    try {
      for await (const event of runWorkflow(workflow, args, conversationId)) {
        broadcastChatEvent(conversationId, {
          type: 'workflow_event',
          event,
        });
      }
    } catch (err) {
      console.error(
        `[chat-workflow] ${workflow} failed for ${conversationId}:`,
        (err as Error).message ?? err,
      );
    }
  })();
});

export default router;
