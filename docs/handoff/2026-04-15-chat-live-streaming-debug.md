# Bug C — chat live streaming produces no assistant events

**Captured:** 2026-04-15, during the unified-capture hotfix session
**Branch:** main (at `cb50838` after the Bug A fix)
**Service state:** systemd agent-cc active, Bug A + Bug B fixes applied

## Symptom

On acc.devbox, submitting a chat message via the chat panel now succeeds at
the HTTP layer — POST `/api/chat/prompt` returns `200 {"ok":true}` in 9–118ms,
the user event is persisted to `~/.agent-cc/interactions.db`, and React Query
revalidation picks it up so the user's message eventually appears in the
panel. But no assistant event is ever persisted. The assistant never
responds. No error is shown anywhere.

```
2:34:01 [express] POST /api/chat/prompt 200 in 118ms :: {"ok":true}
2:34:07 [express] POST /api/chat/prompt 200 in 9ms :: {"ok":true}
(no assistant events in DB, no /api/chat/stream/default hits in logs,
 no error lines from [chat] safePersist)
```

The `default` conversation ends up with 2 user events and 0 assistant events
after two `"test"` submits. The prod behavior is consistent — both submits
fail the same way.

## What we know

- `isClaudeAvailable()` returns true (otherwise POST would 503). Bug B
  (devbox PATH missing `/home/tron/.local/bin`) was fixed via a drop-in
  systemd override at `/etc/systemd/system/agent-cc.service.d/override.conf`
  and the service was restarted after the fix.
- The user event is persisted synchronously before dispatch — that part of
  task004's write path works.
- 9ms POST response for the second submit means the POST handler returns
  **before** `runClaudeStreaming` finishes (fire-and-forget async). The
  server responds 200 as soon as the user event is inserted and the async
  work is dispatched.
- No `GET /api/chat/stream/default` hits appeared in the logs between
  02:29:55 (service start) and 02:35:00 — even though the chat panel was
  open in the browser during the submits. This is suspicious: the chat
  panel's `useEffect` opens an EventSource on mount. Either the component
  didn't mount, the connection was made and is being filtered out of the
  logs, or the EventSource errored out silently.
- No `[chat] safePersist` error lines in the logs. That means either no
  `insertEvent` calls were attempted for assistant events, or the server
  simply isn't reaching the point where chunks arrive.
- The unified-capture E2E test (`tests/unified-capture-e2e.test.ts`) is
  green — but it **mocks `runClaudeStreaming`**. It proves persistence works
  given canned chunks; it does not exercise the real CLI spawn path. That's
  the test-coverage gap this bug is escaping through.

## Hypotheses (ranked)

1. **Fire-and-forget async block is swallowing an error.** The POST handler
   in `server/routes/chat.ts` likely does something like
   `res.json({ok:true}); (async () => { for await (const chunk of runClaudeStreaming(...)) {...} })()` —
   any error in that IIFE becomes an unhandled promise rejection. Check if
   the handler has a `.catch()` on the async block, and whether that catch
   logs anything. The 118ms timing on the first POST (vs 9ms on the second)
   also suggests the first POST's handler was awaiting *something* — maybe
   the first call to `isClaudeAvailable()` which spawns `claude --version`.
2. **`runClaudeStreaming` is spawning but producing zero output.** The
   devbox `claude` binary may need different flags when invoked non-
   interactively via systemd-spawned node. `--no-session-persistence` and
   the env stripping of `CLAUDECODE` may be interacting with the devbox
   environment in a way the dev-mode tests don't see. Try spawning manually:
   `sudo -u tron env -i PATH=/home/tron/.local/bin:/usr/bin claude -p "hi" --output-format stream-json --no-session-persistence` and see what comes out.
3. **The browser's EventSource is not connecting.** ChatPanel's `useEffect`
   opens `new EventSource('/api/chat/stream/' + conversationId)` on mount.
   If the `conversationId` ever becomes `undefined` during render, or the
   component doesn't mount, the subscriber is never registered. With no
   subscribers registered, the server still processes chunks and persists
   them (persistence is in the outer stream loop, not the fan-out inner
   loop), so this doesn't fully explain the missing assistant events — but
   it's worth verifying via browser devtools Network tab.
4. **Server crash mid-stream.** systemd would restart it. PID 166058 has
   been stable since 02:29:55, so this is unlikely — but check for any
   restart spikes around the submit times.

## How to reproduce and investigate

1. Switch to dev mode locally: `npm run dev` starts on `localhost:5100`.
   Your login shell's PATH already has `/home/tron/.local/bin` so the Bug B
   PATH issue does not apply — this isolates the investigation to the
   streaming path only.
2. Open browser devtools, Network tab filtered to `/api/chat/*`.
3. Submit a chat message. Observe:
   - POST `/api/chat/prompt` — status + timing
   - GET `/api/chat/stream/default` — whether it connects, what chunks
     arrive over the SSE wire
   - Any errors in the Console tab
4. In a separate terminal, tail the dev server's stdout for any `[chat]`
   lines or stderr from the claude subprocess.
5. Read `server/routes/chat.ts` end-to-end — specifically the POST handler
   structure around `runClaudeStreaming`. Find the try/catch boundary on
   the async block. Add an explicit `.catch(err => console.error('[chat]
   stream failed:', err))` if one is missing. This is defensive-logging,
   not a fix — it's the fastest way to reveal what's actually breaking.
6. If the dev-mode reproduction reveals the root cause, file a real task
   in a proper milestone (this is feature-level work, not a hotfix) and
   write a proper failing test that exercises the real spawn path — the
   manual-smoke gap that let this land needs a test-level answer, not just
   a procedural one.

## Related follow-ups captured this session

- `.claude/roadmap/drafts/2026-04-15-agent-cc-sigterm-handler.md` — service
  hangs in deactivating (stop-sigterm) for ~90s because SSE keepalive
  intervals + open subscriber connections keep the event loop alive. Not
  related to Bug C directly, but relevant to the same chat.ts file.

## Files likely involved

- `server/routes/chat.ts` — POST handler, stream processing loop, SSE fan-
  out, persistence calls
- `server/scanner/claude-runner.ts` — `runClaudeStreaming()`,
  `isClaudeAvailable()`, `buildClaudeEnv()`
- `client/src/components/chat/chat-panel.tsx` — EventSource wiring, onmessage
  handler

## Do NOT

- Debug in prod via systemd (the reason this session went sideways). Use
  `npm run dev` locally first.
- Touch `shared/types.ts`, the interactions-db/repo, or the
  InteractionEventRenderer — those all tested green and aren't the bug.
- File as a chat-workflows-tabs task. That milestone is for **richer** live
  chunk handling once the basic text-only path works. This bug is about the
  basic path itself.
