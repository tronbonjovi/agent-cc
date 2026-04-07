# Terminal Group Redesign — Next Session

## Context

The terminal panel is being redesigned from a flat tab model to VS Code-style terminal groups. Spec and implementation plan are complete. The current code still has the old flat-tab model deployed (with UX polish fixes from this session).

## What Was Done

- Fixed split terminal bugs (phantom PTY sessions, title cross-talk, invalid split state)
- Added dynamic tab titles and background activity flash (will be superseded by group redesign)
- Brainstormed and designed the group-based architecture with visual companion
- Wrote full spec: `docs/superpowers/specs/2026-04-07-terminal-group-redesign.md`
- Wrote implementation plan: `docs/superpowers/plans/2026-04-07-terminal-group-redesign.md`

## What's Next

Execute the 13-task implementation plan using subagent-driven development:

1. Install zustand + allotment
2. Update shared types (flat tabs → groups)
3. Server: add shellType to created message, update validation schema
4. Create TerminalInstanceManager singleton (xterm.js + WebSocket lifecycle)
5. Create zustand store (group CRUD, persistence, unread tracking)
6. Rewrite TerminalInstance (320 lines → 20-line mount point)
7. Create TerminalGroupView (allotment split panes)
8. Create TerminalToolbar (split, new, collapse)
9. Create TerminalExplorer (right sidebar, tree connectors, context menu)
10. Rewrite TerminalPanel (compose all new components)
11. Run full tests + safety check
12. Clean up old tailwind animation
13. Deploy and verify

## Key Decisions

- **Zustand** over useReducer (app-scoped state, external updates from WebSocket)
- **Allotment** for resizable split panes within groups
- **TerminalInstanceManager** singleton owns xterm.js + WebSocket independent of React (survives group switches without reconnect)
- **Explorer sidebar on the right** (matches VS Code)
- **Shell type as default name** (not dynamic shell titles) — rename via right-click context menu

## How to Resume

```
Read docs/handoff/2026-04-07-terminal-group-redesign.md
```

Then invoke the superpowers:subagent-driven-development skill with the plan at `docs/superpowers/plans/2026-04-07-terminal-group-redesign.md`.
