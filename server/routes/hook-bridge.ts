/**
 * POST /api/chat/hook-event — HTTP surface for the hook event bridge
 * (task005 — chat-workflows-tabs).
 *
 * The user configures their `~/.claude/settings.json` hooks to curl this
 * endpoint with a JSON payload describing the fire (hook name, tool, any
 * freeform extras). We validate the minimum shape, hand off to
 * `recordHookEvent`, and reply with `{ ok, id }` so the hook command can
 * optionally log the persisted row id.
 *
 * SECURITY: this endpoint has NO AUTH. It binds to the same host the main
 * server binds to (localhost by default) and is intended for single-user
 * devbox usage. MUST NOT be exposed to the public internet without adding
 * an auth layer — see the "Hook Event Bridge" section in CLAUDE.md.
 *
 * Shape choices mirror `server/routes/chat-workflows.ts` (task004) so the
 * two event-bridge routes stay parallel: synchronous validation, JSON
 * responses, no SSE channel of our own (we reuse the existing chat stream
 * via `broadcastChatEvent`).
 */
import { Router, type Request, type Response } from 'express';
import { recordHookEvent, type HookPayload } from '../hooks-bridge';

const router = Router();

router.post('/hook-event', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;

  // Minimum contract: body is a non-null object with a non-empty `hook`
  // string. Everything else is freeform and gets passed through to the
  // event's `content.data` by `recordHookEvent`.
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.hook !== 'string' ||
    body.hook.length === 0
  ) {
    return res
      .status(400)
      .json({ error: 'hook field required (non-empty string)' });
  }

  try {
    const event = recordHookEvent(body as HookPayload);
    return res.json({ ok: true, id: event.id });
  } catch (err) {
    console.error(
      '[hook-bridge] recordHookEvent failed:',
      (err as Error).message ?? err,
    );
    return res
      .status(500)
      .json({ error: (err as Error).message ?? String(err) });
  }
});

export default router;
