# Handoff — 2026-04-15 — M6 chat-workflows-tabs Phase 1+2 shipped, Phase 3 next

## What shipped today

4/8 M6 tasks on **local-only** branch `feature/chat-workflows-tabs` (branched from `main@a983695`, NOT pushed). Four single-commit tasks, each dispatched through `/work-task`, each reviewed via `feature-dev:code-reviewer`, each passed on the first review.

| Commit | Task | Summary |
|---|---|---|
| `891fce1` | task001 | Tab store with persistence — `DBData.chatUIState`, `/api/chat/tabs` GET/PUT, `useChatTabsStore` with optimistic-update + rollback, `load()` wired in `layout.tsx` |
| `c7bfabf` | task002 | Tab bar UI — `ChatTabBar` mounted above `ChatPanel` scroll area, `buildOrderedTabs`/`reorderIds` pure helpers, drag-reorder via `@dnd-kit/sortable` (already in deps), `!loaded` skeleton guard |
| `e736ded` | task003 | Slash command parser + client dispatcher — `parseSlashCommand` + `dispatchCommand` POSTing to `/api/chat/workflow`, `ChatPanel.handleSubmit` intercepts before AI POST, Archon source-text guardrail blocks subprocess imports |
| `0ad79d7` | task004 | Server workflow executor + dispatch endpoint — `chat-workflow-executor.ts` with `echo` only, `chat-workflows.ts` route with 400/404/202 semantics, `broadcastChatEvent` export added to `chat.ts`, `chat-panel.tsx` SSE handler teaches about `workflow_event` chunks (invalidate-only, no mid-stream render yet) |

Test suite: **6034/6034 passing across 181 files** (5906 → 6034, +128 this session). `npm run check` clean. Pre-commit safety hook green every commit.

Phase 1 (tab persistence foundation) and Phase 2 (command + executor) are both closed. The Archon security pattern is wired end-to-end: chat input is AI-only, slash commands route through a server-side allowlist, subprocess APIs are banned from the executor module by a source-text guardrail test.

## Outstanding work on the branch

**Phase 3 — Hooks + rich rendering (parallel-safe pair, sequential dispatch — task006 depends on task005's chunk shape):**
- `task005 chat-workflows-tabs-task005` — Hook event bridge. New `POST /api/chat/hook-event` endpoint that accepts hook payloads from `settings.json` hooks and broadcasts via the existing `broadcastChatEvent` helper as `{type: 'hook_event', event}` chunks. Event source is `'chat-hook'` (already in `InteractionSource` union from M4). `SystemContent.subtype` already has `'hook_fire'`. `chat-panel.tsx` SSE handler needs a new `else if` branch parallel to the `workflow_event` one that landed in task004.
- `task006 chat-workflows-tabs-task006` — Rich live rendering in chat panel. Replaces the current invalidate-only handling of `workflow_event` and `hook_event` chunks with direct rendering via `InteractionEventRenderer` (extracted in M4 unified-capture task007). Must de-dupe by `event.id` to avoid double rendering when revalidation pulls the same event back via React Query.

**Phase 4 — History threading (solo):**
- `task007 chat-workflows-tabs-task007` — Multi-turn history threading. **This is the task that retargets `ChatPanel` from the M3 single-conversation `useChatStore.conversationId` to `useChatTabsStore.activeTabId`.** Introduces per-tab conversation context. Currently the tab bar is visual-only — clicking a tab updates `activeTabId` + persists but does NOT change what the chat panel renders below. task007 fixes that. Also the natural home for the close-confirmation-on-dirty-tab feature deferred by task002 (`TODO(task007)` comment in `chat-tab-bar.tsx`) once per-tab draft state exists.

**Phase 5 — E2E (solo):**
- `task008 chat-workflows-tabs-task008` — Multi-tab E2E isolation test. Full integration run proving two tabs can hold independent conversations + slash commands + hook events without cross-contamination.

## How to resume

1. Start a fresh session in `/home/tron/dev/projects/agent-cc`. **You do NOT need to branch again** — `feature/chat-workflows-tabs` is already checked out and has the 4 M6 commits. Verify with `git branch --show-current && git log --oneline main..HEAD`.
2. **Before dispatching any task, read its contract and fix drift.** Every M6 task contract was drafted 2026-04-14 with at least one landmine (test file location, store method naming, dangerous `validate` spawn workflow, 404-vs-async-error bug). Expect task005–008 to need the same scrub. Common drift patterns to look for:
   - Test files under `client/**` (vitest excludes that directory — move to `tests/`)
   - Hardcoded workflow/command names that don't match what task003+task004 actually shipped
   - Direct `tabs.map` iteration (wrong — use `order` via `buildOrderedTabs` from task002)
   - Assumptions about `activeTabId` driving `ChatPanel` content (NOT TRUE until task007)
3. Dispatch via `/work-task chat-workflows-tabs-task005` (or whichever is next). The orchestrator pattern that worked all session: read contract → fix drift inline → cascade `pending → in_progress` in contract + TASK.md → dispatch subagent → cascade `→ review` on report → dispatch `feature-dev:code-reviewer` → cascade `→ completed` on PASS.
4. **Parallel dispatch cap is 2** per `feedback_parallel_dispatch_collisions`. task005/006 are listed as parallel-safe but task006 depends on task005's chunk shape, so sequential dispatch is safer. Don't try to parallelize them.

## Things to watch

- **`broadcastChatEvent` is the shared fan-out helper.** task005 does NOT need to extract `activeStreams` or build a new bus — just import `broadcastChatEvent` from `server/routes/chat.ts` the same way `chat-workflows.ts` does. One new chunk type (`hook_event`) + one new `else if` case in `chat-panel.tsx`.
- **`chat-panel.tsx` already has the `workflow_event` case** that task004 added. task005's hook-event branch sits right next to it; task006 replaces both with rich rendering. Don't regress the existing workflow_event handling.
- **Source-text guardrail in `tests/chat-workflow-executor.test.ts`** locks `chat-workflow-executor.ts` to "no subprocess APIs." If task006 or any future task needs to add spawn-based workflows, they MUST live in a different module (e.g., `server/chat-workflow-spawn-executor.ts`) and go through their own review gate.
- **`activeTabId` is still visual-only until task007.** Don't let task005/006 accidentally depend on it. The chat panel body still reads from M3 `useChatStore`.
- **Manual smoke before M6 merges** (per `feedback_e2e_mock_gap`): `/echo hello` in the chat panel → three workflow events appear after the revalidate cycle; `/nonexistent` → falls through to AI. Mocked tests prove handler logic, not the real SSE round-trip. Do this against `acc.devbox` after `scripts/deploy.sh` before opening the M6 PR.
- **Branch is local only.** Not pushed to origin. When M6 is done, push the feature branch first, open PR, then merge.

## Open questions (raise at brainstorm, not mid-dispatch)

- **Hook bridge filtering (task005):** should the hook endpoint filter by hook type or emit everything to the active tab? Archon pattern would filter — only emit hooks relevant to the conversation's context.
- **Rich rendering de-dupe (task006):** once task006 renders mid-stream, each workflow event will arrive twice — once via the SSE `workflow_event` chunk and once via the subsequent React Query revalidation. Key on `event.id` for de-dupe, but confirm the Zustand store vs React Query cache ordering.
- **`closeTab` promotion UX (task007 polish):** current store promotes `order[0]`, not "next after closed tab" (browser-style). Revisit as part of task007's per-tab context work if it feels wrong.
- **`load()` re-entry guard:** if `load()` is ever called more than once (reconnect path), it unconditionally replaces state, clobbering in-flight mutations. Currently impossible due to `!chatTabsLoaded` guard but worth an invariant check in task007 if per-tab draft state introduces new reload paths.

## Do NOT modify (boundary reminders)

- M5 scanner files (`server/scanner/backend.ts`, `backend-store.ts`, `interactions-repo.ts` — read/import only, never modify)
- task001 files (`server/db.ts`, `server/routes/chat-tabs.ts`, `shared/types.ts`, `client/src/stores/chat-tabs-store.ts`, `client/src/components/layout.tsx`) — stable, don't reach in unless there's a bug
- task002 files (`client/src/components/chat/chat-tab-bar.tsx`, `client/src/lib/chat-tab-order.ts`) — stable
- task003/task004 files — stable except `chat-panel.tsx` and `chat.ts` which will keep accumulating cases/exports as task005/006 land
