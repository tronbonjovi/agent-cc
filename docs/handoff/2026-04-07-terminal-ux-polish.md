# Terminal UX Polish — Next Session

## Context

Terminal reliability is done and deployed (survives refresh, auto-reconnect, state indicators). These are small UX improvements that came up during testing.

## What to Build

1. **Dynamic tab titles from shell** — Most shells emit escape sequences that set the terminal title (current dir, running command). xterm.js has `onTitleChange` event. Wire it to update the tab name automatically. ~30 min.

2. **Flash tab on background activity** — When output arrives in a non-active tab, pulse/flash the tab briefly. Track "has unread output" per tab, clear on focus. CSS animation. ~30 min.

3. **Tab number reset** — Currently the tab counter only goes up. Consider whether to reuse gaps or reset when appropriate. Minor UX decision.

## Reference

- Terminal panel: `client/src/components/terminal-panel.tsx`
- Terminal instance: `client/src/components/terminal-instance.tsx`
- The `onConnectionStateChange` callback pattern can be extended for activity tracking

## How to Resume

```
Read docs/handoff/2026-04-07-terminal-ux-polish.md — brainstorm and implement terminal UX improvements
```
