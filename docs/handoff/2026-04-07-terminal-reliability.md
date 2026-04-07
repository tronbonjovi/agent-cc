# Terminal Reliability — Next Feature

## Context

The embedded terminal (xterm.js + node-pty + WebSocket) works but has critical reliability issues that prevent daily use. Fixing this is the top priority because working directly out of Agent CC is the fastest path to informed UX decisions.

## What Exists

- Backend: `server/terminal.ts` — node-pty spawning, WebSocket bridge at `/ws/terminal`
- Client panel: `client/src/components/terminal-panel.tsx` — tabbed panel, split view, drag resize
- Client instance: `client/src/components/terminal-instance.tsx` — xterm.js rendering
- Routes: `server/routes/terminal.ts` — panel state persistence API

## Critical Problems

1. **Page refresh kills terminals** — WebSocket close handler kills the PTY process. No reconnection path. Refresh = everything gone.
2. **No scrollback persistence** — PTY output goes straight to WebSocket with no server-side buffering. Refresh = all history lost.

## Medium Problems

3. **Stale closure in resize handling** — `terminal-panel.tsx` uses `useReducer` with `stateRef` workaround
4. **Visibility/fit race condition** — `fitAddon.fit()` after 0ms setTimeout races with WebSocket on tab switch
5. **No Claude CLI awareness** — terminals don't know if Claude is running inside them

## Adoption Path (from Aperant review)

**Phase 1 — Survive refresh (critical):**
- Server: ring buffer per terminal (50K lines), PTY stays alive on WS disconnect (60s grace), replay buffer on reconnect
- Client: send `attach` instead of always creating new, reconnection with backoff

**Phase 2 — State machine (medium):**
- Replace useReducer terminal state with proper state machine: creating → ready → connected → disconnected → reconnecting → dead

**Phase 3 — Claude CLI awareness (nice-to-have):**
- Watch terminal output for Claude invocations, rate limits, session IDs

## Reference

- Aperant terminal analysis: `~/dev/projects/aperant/REVIEW-REPORT.md` Section 3
- Current terminal code: `server/terminal.ts`, `client/src/components/terminal-panel.tsx`, `client/src/components/terminal-instance.tsx`
- ROADMAP.md has this as "Next Up"

## How to Resume

```
Read docs/handoff/2026-04-07-terminal-reliability.md — brainstorm and implement terminal reliability fixes
```
