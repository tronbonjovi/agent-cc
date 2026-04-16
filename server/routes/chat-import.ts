/**
 * POST /api/chat/import — clone a source conversation into a new chat-ai
 * conversation (task002 — chat-import-platforms milestone).
 *
 * Thin HTTP surface around `importConversationAsChat`:
 *   - 400 when the required `sourceConversationId` field is missing or not
 *     a non-empty string (client error — nothing to look up).
 *   - 404 when the source conversation has no events (valid request, empty
 *     result — matches the function's own throw signal).
 *   - 200 with `{ newConversationId, eventCount }` on success.
 *
 * Mounted under `/api/chat` in `server/routes/index.ts` alongside the other
 * chat routers (they all co-exist additively; Express merges the method
 * handlers so `/api/chat/import` doesn't collide with existing chat routes).
 */

import { Router, type Request, type Response } from 'express';
import { importConversationAsChat } from '../chat-import';

const router = Router();

router.post('/import', (req: Request, res: Response) => {
  const { sourceConversationId } = req.body ?? {};
  if (typeof sourceConversationId !== 'string' || sourceConversationId.length === 0) {
    return res.status(400).json({ error: 'sourceConversationId required' });
  }
  try {
    const result = importConversationAsChat(sourceConversationId);
    return res.json(result);
  } catch (err) {
    // `importConversationAsChat` only throws on an empty source conversation
    // today. Surface as 404 so the UI can distinguish this from a 400.
    const message = err instanceof Error ? err.message : String(err);
    return res.status(404).json({ error: message });
  }
});

export default router;
