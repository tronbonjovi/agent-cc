# Handoff — 2026-04-15 — M5 scanner-ingester shipped, M6 chat-workflows-tabs is next

## What shipped today

**Milestone 5 (`scanner-ingester`) is complete and merged to main.** All 8 tasks done, branch fast-forwarded into `main` (15 commits), pushed to origin, feature branch deleted locally and on origin.

- Store backend is the only scanner backend. `SCANNER_BACKEND` env var is gone. `backend-legacy.ts` is gone. `getScannerBackend()` is a one-line factory returning `storeBackend`.
- Scanner data-read (Sessions, Messages, Costs, Dashboard, live chat) now reads exclusively from `interactions.db` via `backend-store.ts` → `interactions-repo.ts`.
- Parity test (`tests/scanner-backend-parity.test.ts`) deleted — it was by definition a two-backend comparison and is meaningless with one backend. Method completeness enforcement lives in `tests/scanner-backend.test.ts` via the `SCANNER_BACKEND_METHODS` loop.
- `tests/sessions-route.test.ts` was reworked to mock `../server/scanner/backend` with a fake `IScannerBackend` that delegates `getSessionMessages` to the real `parseSessionMessages` on an on-disk JSONL fixture. HTTP route tests are now decoupled from backend-implementation choice.
- CHANGELOG Unreleased has a `### Changed` entry documenting the migration.

Test suite: **5906/5906 passing across 173 files.** `npm run check` clean. Pre-commit safety hook green.

## What's next — M6 `chat-workflows-tabs`

M6 in the integrated-chat roadmap. Directory: `.claude/roadmap/chat-workflows-tabs/`, 8 tasks drafted 2026-04-14.

**Goal:** Multi-tab chat with persisted tab state, client-intercepted slash commands routed to a server-side workflow executor (chat input stays AI-only — deterministic operations only reach the system through explicit workflow names, closes the shell-injection attack surface), hook event bridge from `settings.json` hooks to the chat panel, rich live rendering via the shared `InteractionEventRenderer`, and multi-turn history threading via prompt stuffing.

**Task list (pending review for drift before dispatch):**
1. `task001` — Tab store with persistence (`DBData.chatUIState`)
2. `task002` — Tab bar UI
3. `task003` — Slash command parser and router
4. `task004` — Workflow executor wiring for chat commands (Archon pattern)
5. `task005` — Hook event bridge (`/api/chat/hook-event` → active tab)
6. `task006` — Rich live rendering in chat panel (`InteractionEventRenderer`)
7. `task007` — Multi-turn history threading
8. `task008` — Multi-tab E2E isolation test

## How to resume

1. Start a fresh session in `/home/tron/dev/projects/agent-cc` on branch `main` (feature/scanner-ingester is gone).
2. **Before dispatching any task**, read its contract and fix drift. M5 tasks 006, 007, and 008 all had contract landmines (stale endpoint names, wrong test-file locations, contradicting acceptance criteria). Expect the same on M6 — contracts were all drafted 2026-04-14 before the M5 work landed, so some may assume shapes that no longer exist.
3. Create a new branch `feature/chat-workflows-tabs` before touching code — never edit main.
4. Dispatch via `/work-task chat-workflows-tabs-task001` (or whichever is next).
5. Sequential within the milestone — task002 depends on task001's store shape, task004 depends on task003's parser, etc. Parallel opportunities will surface as tasks complete.

## Things to watch

- **Contract drift on task003 (slash command parser).** The parser needs to recognize every slash command the user has registered through the workflow system; check `workflow-framework` for the current schema before the subagent writes the parser.
- **Hook bridge (task005) touches settings.json surface area.** Coordinate with the `update-config` skill's conventions — hooks are a load-bearing part of the harness, not a chat toy.
- **Rich rendering (task006) needs `InteractionEventRenderer`** to already expose a prop for the chat-panel mounting context. Check `unified-capture-task007` commit for the extracted renderer shape.
- **`chat-hook` and `chat-workflow` event sources** are already defined in `shared/types.ts` from M4; M6 consumes them, doesn't add them.
- **Don't regress the scanner cutover.** M6 shouldn't touch `backend.ts` / `backend-store.ts` / `interactions-repo.ts` except additively. If a task contract asks to modify those files, that's a signal to rewrite the contract.

## Open questions (if any come up, raise them at brainstorm, not mid-dispatch)

- Should tabs persist per-project or globally? (contract default: globally via `DBData.chatUIState`, but worth confirming)
- What's the scrollback behavior when switching tabs mid-stream? Keep streaming in background, cancel, or block the switch?
- Hook bridge — should it filter by hook type or emit everything to the active tab? (Archon pattern would filter.)

These don't need to be resolved before task001 — they shape task005 and task007.
