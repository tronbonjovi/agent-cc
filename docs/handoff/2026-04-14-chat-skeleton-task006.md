# Handoff — Chat skeleton Phase 4 (task006), fresh session

**Date:** 2026-04-14
**Branch:** `feature/chat-skeleton` (not yet pushed, not yet merged)
**Prior session:** landed Phases 1–3 (6/8 tasks) plus two task008 follow-up fixes. Everything is green, deployed to acc.devbox, manually smoke-tested in the browser.

## What's done

On `feature/chat-skeleton` since `23ba565` (main):

1. `259440c` — task002 Streaming runClaude variant (server)
2. `25bb9db` — task004 Chat store, ephemeral Zustand (client)
3. `f8e29d8` — task001 Layout shell refactor, 3-column grid (client + store)
4. `8ec44be` — task003 Chat SSE route POST `/api/chat/prompt` + GET `/api/chat/stream/:conversationId` (server)
5. `f9d36ef` — task005 Chat panel component (client, NOT yet mounted)
6. `67adeea` — task008 Panel library consolidation, allotment → react-resizable-panels
7. `8adf87a` — task008 follow-up, terminal collapse gap fix (partial, caused page-remount bug)
8. `daadefc` — task008 follow-up 2, always-mounted PanelGroup + imperative resize + CSS-hidden handle when collapsed (fixed the remount)

Test suite: **5670 tests across 160 files**, all green. `npm run check` clean. Pre-commit `new-user-safety.test.ts` hook green on every commit.

## Resume sequence

1. Start a fresh Claude Code session
2. Read this handoff note
3. `git checkout feature/chat-skeleton && git log --oneline -10` — confirm you're at `daadefc`
4. Read `.claude/roadmap/chat-skeleton/chat-skeleton-task006.md` — the contract
5. Read `.claude/roadmap/TASK.md` Phase 4 section — task006 deps are `task001, task005, task008` (all done)
6. Read `docs/handoff/2026-04-14-chat-skeleton-task006.md` — this file
7. Dispatch task006 via `/work-task` — the skill will pick up the task file and propose the dispatch

## Task006 scope (quick reference)

`chat-skeleton-task006` — Sidebar toggle and panel mount (solo, Phase 4):

- Mount `ChatPanel` from `client/src/components/chat/chat-panel.tsx` into the right-column slot in `client/src/components/layout.tsx` (currently renders the placeholder `<div data-testid="chat-panel-slot">Chat panel slot</div>`)
- Add a sidebar toggle button that calls `useLayoutStore.getState().toggleChatPanel()` to open/close the chat panel
- `dependsOn: task001, task005, task008` — all satisfied
- `filesTouch: client/src/components/layout.tsx` only
- Contract expects source-text guardrail tests; no RTL renders (see `reference_vitest_client_excluded` memory)

## Open concerns / ambiguities to watch

None known from manual testing. User verified in browser after `daadefc`:

- Click toolbar chevron → terminal collapses smoothly to toolbar, page content does NOT flash/reload
- Click again → expands back to persisted height
- Drag main↔terminal handle → height adjusts smoothly, never collapses via drag
- Reload → height and open/closed state both persist
- Drag chat panel divider → width adjusts, persists across reload

The chat panel slot itself still renders only the placeholder text. task006 swaps that for `<ChatPanel />` and adds the sidebar toggle — after that, task007 is the E2E smoke test that closes out the milestone.

## After task006 lands

- Phase 4 complete → dispatch task007 (E2E chat skeleton smoke test, solo)
- task007 lands → milestone `chat-skeleton` complete → open PR against main
- Delete this handoff file once task006 is merged to main
- Next milestone is `unified-capture` (SQLite `interactions.db`) per `.claude/roadmap/MILESTONE.md`
