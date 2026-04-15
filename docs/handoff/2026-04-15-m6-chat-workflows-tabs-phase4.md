# Handoff — 2026-04-15 (evening) — M6 chat-workflows-tabs Phase 3 closed, Phase 4 next (BRAINSTORM FIRST)

## What shipped this session

6/8 M6 tasks now on **local-only** branch `feature/chat-workflows-tabs`. Added 2 commits tonight after the Phase 3 handoff note from earlier today.

| Commit | Task | Summary |
|---|---|---|
| `6cbce08` | task005 | Hook event bridge — `server/hooks-bridge.ts`, `server/routes/hook-bridge.ts`, `POST /api/chat/hook-event`, routes to `chatUIState.activeTabId` with `hook-background` fallback, broadcasts `{type: 'hook_event', event}` symmetric with task004's `workflow_event`, 12 tests, Archon subprocess guardrail |
| `c39ab8a` | task006 | Rich live rendering — `client/src/lib/chat-event-merge.ts` pure dedup helper, `chat-panel.tsx` `workflow_event`/`hook_event` branches now `appendLiveEvent` + `invalidateQueries` (flipped from invalidate-only), `useChatStore.appendLiveEvent` id-collision idempotent, 9 merge tests + 6 chat-panel guardrails/pure-logic tests, triple-locked regression guard against task007 retarget leakage |

Test suite: **6089/6089 passing across 183 files** (6034 → 6062 → 6089, +55 tonight). `npm run check` clean. Pre-commit safety hook green both commits.

Phase 3 is closed. Hook event bridge is wired end-to-end; workflow steps and hook fires both render live via `InteractionEventRenderer` now. The dedup helper and store idempotence mean revalidation no longer double-renders events.

## What's open on the branch

Phase 4 and Phase 5. Two tasks left: task007 and task008.

### task007 — Per-tab conversation retarget (FRESH TITLE, CONTRACT REWRITTEN)

**Do not just dispatch this one.** The 2026-04-14 contract draft was completely wrong — it described a server-side "multi-turn history threading" feature that doesn't fit this codebase at all (Claude CLI already handles multi-turn session state via `--session-id`, so text-prefix stuffing would duplicate history and burn tokens). The scrubbed contract at `.claude/roadmap/chat-workflows-tabs/chat-workflows-tabs-task007.md` now describes the real work per the earlier Phase 3 handoff note and the explicit `TODO(task007)` markers in the code:

1. Retarget `ChatPanel` from `useChatStore.conversationId` (hardcoded to `'default'` at `client/src/stores/chat-store.ts:53`) to `useChatTabsStore.activeTabId` — so clicking a tab actually changes the conversation the chat panel renders below
2. Per-tab draft state — so switching tabs preserves the unsent input in each tab instead of blowing it away
3. Close-confirmation on dirty tab — the `TODO(task007)` markers at `chat-tab-bar.tsx:106, 163`, via shadcn `AlertDialog`
4. First-mount auto-create — spawn a "Main" tab if `openTabs.length === 0` on load, so `ChatPanel`'s content-source contract is always non-nullable
5. Deprecate or remove `useChatStore.conversationId` entirely once the retarget lands

The scrubbed contract **lists 6 open design questions** that must be brainstormed with the user before code is written. They are NOT trivial — the answers shape the store schema and the component seam:

1. **How should `ChatPanel` read the active conversation id?** Direct `useChatTabsStore` subscribe, sync-effect mirror into `useChatStore`, or extract a `useActiveConversationId()` hook? The contract's recommendation is the hook (Option C) but the user should weigh in.
2. **Per-tab `liveEvents` — scope flat buffer or keyed Record?** Today `useChatStore.liveEvents` is a single flat array — two tabs streaming simultaneously would cross-contaminate. Contract recommends keying by conversationId (Option B), but it's a non-trivial refactor that touches every reader/writer of `liveEvents` including task006's idempotence fix.
3. **Where do per-tab drafts live — persisted via `DBData.chatUIState` or in-memory only?** Contract recommends in-memory only for v1 (persisting drags the JSON store schema into scope).
4. **Close-confirm dialog — shadcn `AlertDialog` or blocking `window.confirm`?** Contract recommends `AlertDialog` for testability.
5. **Empty state on fresh install** (no tabs, no `activeTabId`) — auto-create "Main" tab or render an empty-state placeholder?
6. **SSE subscription lifecycle on tab switch** — verify the existing `req.on('close')` pruning on the server handles tab-switch-driven reconnects cleanly.

The contract bumped the complexity from `standard` to `complex`, expanded `filesTouch` from 3 server files to 9 client+server+test files, and raised the context budget to 200k (right at the memory-enforced ceiling per `feedback_context_budget_discipline`). Status is still `pending` — this one needs a design brainstorm before any subagent gets dispatched.

**Highest-risk failure modes for task007 when you do start coding:**
- Accidentally breaking task006's triple-locked regression guardrail against `useChatTabsStore` in `chat-panel.tsx` — the guardrail will need to be UPDATED, not removed. `chat-panel.tsx` should consume the hook (`useActiveConversationId`), not `useChatTabsStore` directly, so the lock can be narrowed rather than deleted.
- React 18 strict mode double-invoking the auto-create-"Main"-tab effect and creating two tabs on mount. Use the existing `!chatTabsLoaded` guard from task001's `load()` path.
- Expanding scope into a per-tab `liveEvents` refactor mid-implementation. That refactor touches `appendLiveEvent`, `removeLiveEvent`, `coalesceAssistantText`, `clearLive` — if it starts feeling like its own task, STOP and split it out. 200k context ceiling.

### task008 — Multi-tab E2E isolation test (solo)

Full integration run proving two tabs can hold independent conversations + slash commands + hook events without cross-contamination. Should exercise the real SSE round-trip, not mocked. Per `feedback_e2e_mock_gap`, this is load-bearing — mocked tests in task005/006/007 prove handler logic, not CLI subprocess + SSE fan-out integration. Expect the 2026-04-14 contract to need the usual drift scrub before dispatch.

## How to resume next session

1. Start a fresh session in `/home/tron/dev/projects/agent-cc`. The branch `feature/chat-workflows-tabs` is already checked out with 6 commits ahead of main. Verify with `git branch --show-current && git log --oneline main..HEAD`. Branch is still local-only — **do not push** until the milestone is complete and manually smoke-tested.
2. **Read `.claude/roadmap/chat-workflows-tabs/chat-workflows-tabs-task007.md`**. The entire "Design questions to resolve first (BRAINSTORM BEFORE CODE)" section is load-bearing. Do not skip to Instructions.
3. **Brainstorm the 6 design questions with the user**. Present the contract's recommendations as defaults, not decisions. The user may redirect any of them — especially #2 (liveEvents scoping) and #3 (draft persistence) because those have downstream cost implications.
4. **Update the contract in-session** once decisions are locked. Replace the "Design questions to resolve first" section with a "Decisions locked (DATE)" summary. Then proceed per the Instructions section.
5. Dispatch via `/work-task chat-workflows-tabs-task007`. The orchestrator pattern that worked all of today: read contract → scrub any remaining drift inline → cascade `pending → in_progress` in contract + TASK.md → dispatch subagent → cascade `→ review` on report → dispatch `feature-dev:code-reviewer` → cascade `→ completed` on PASS.
6. After task007 lands, task008 is solo and the last task in the milestone. After it lands, do the manual smoke test on `acc.devbox`, THEN push the branch and open the M6 PR.

## Things to watch

- **`useChatStore.conversationId` is still hardcoded to `'default'`** at `client/src/stores/chat-store.ts:53`. Until task007 retargets, all chat activity hits the `'default'` conversation regardless of which tab is "active." Clicking tabs changes `activeTabId` + persists but does NOT change the chat panel content. This is the big user-visible gap that task007 closes.
- **The triple-locked regression guardrail in `tests/chat-panel.test.ts`** (no `useChatTabsStore` import, no `useChatTabsStore(` invocation, source-text lock) will BLOCK task007's code unless the guardrail is updated. The right fix is to narrow the lock to "no direct `useChatTabsStore` in chat-panel.tsx — must go through the `useActiveConversationId` hook seam." Don't just delete the lock, or the next session's task008 E2E might accidentally retarget before task007's design decisions have propagated.
- **`mergeChatEvents` dedup key is `event.id`**. If task007 introduces new event-construction paths, make sure they generate stable ids — if the same logical event ends up with two different ids across a refetch, dedup fails and the event renders twice.
- **`chat-panel.tsx:149-150` has a comment block explaining the current `useChatStore` trust boundary and why task003/004 intentionally did NOT retarget to `useChatTabsStore`.** Update that comment when task007 lands, or the comment becomes a lie.
- **Source-text guardrails from task005 lock `server/hooks-bridge.ts` against subprocess APIs.** If task007 or task008 needs to add spawn-based workflows (unlikely), they MUST live in a different module.

## Do NOT modify (boundary reminders)

- M5 scanner files (`server/scanner/backend.ts`, `backend-store.ts`, `interactions-repo.ts` — read/import only)
- task001–006 files (including the just-landed task005/006 work) — stable, don't reach in unless there's a bug
- `interaction-event-renderer.tsx` — already handles every content type and every `SystemContent.subtype` generically via `SystemNote`. There is no renderer work left in M6.
- The `chat-panel.tsx` `workflow_event` and `hook_event` SSE branches just landed in task006 — don't regress the append-then-invalidate ordering or the dedup helper import when task007 edits the same file
