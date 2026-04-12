# Handoff — messages-redesign continuation

**Date:** 2026-04-12
**Branch:** `feature/messages-redesign`
**Milestone status:** 3/6 tasks complete

## What just shipped

- **task001** — message timeline endpoint (`GET /api/sessions/:id/messages`) with 7 TimelineMessage variants + `?include=tree` enrichment (commit `147218a`)
- **task002** — SessionSidebar component (commit `ed0b6f3`)
- **task003 wave 1** — 5 bubbles: UserBubble, AssistantBlock, ThinkingBlock, ToolResultBlock, SystemEventBlock (commit `4562e28`)
- **task003 wave 2** — ToolCallBlock, tool renderer registry, dispatcher split, SidechainGroup (commit `bc51b88`)

Task003 frontmatter is `completed`. Code-reviewer ran and flagged one real bug (empty-string `agentId` in `TimelineSubagentContext` causing label/color mismatch in `SidechainGroup`); fix landed in the same commit.

## What's still open

Three tasks remain, must run sequentially (none are parallel-safe together):

1. **task004 — Conversation viewer with scroll management** *(complex, depends on task003)*
   - `ConversationViewer.tsx` — fetches `?include=tree`, orders messages, calls `renderMessage` per message, groups subagent runs into `SidechainGroup` by `subagentContext.agentId`
   - Scroll management (jump top/bottom, position indicator, preserve-on-filter-change), keyboard nav (arrows, Enter, Escape), empty state, tree-unavailable banner + fallback
   - Risk: 500+ message sessions may need `react-window`-style virtualization

2. **task005 — Filter pill bar + MessagesTab wiring** *(standard, depends on task004)*
   - `FilterBar.tsx` (6 toggle pills + 3 mode presets), `MessagesTab.tsx` container
   - Wire into `client/src/pages/stats.tsx` (currently still rendering `<MessagesPanel />` from `client/src/pages/message-history.tsx` — 617 lines of legacy)
   - URL param sync `?tab=messages&id=<sessionId>`
   - **Two deferred polish items** folded into Instructions step 6 (were previously a footnote):
     - `server/routes/sessions.ts`: update JSDoc on `GET /api/sessions/:id/messages` to state `totalMessages` is post-filter
     - `server/routes/sessions.ts`: add comment next to `TIMELINE_MESSAGE_TYPES` set saying "keep in sync with shared union"

3. **task006 — In-conversation search** *(standard, depends on task005)*
   - `ConversationSearch.tsx` (input, counter, prev/next, clear) + `ConversationViewer.tsx` integration
   - Match highlighting, auto-expand collapsed items with matches, temporarily surface filtered-out matches with "hidden by filter" indicator
   - `standard` complexity feels light for the auto-expand / cross-filter logic — plan for it to run longer

## Task file audit outcome

task004 and task006 are clean as-is. task005 was edited this session to fold the deferred polish items into Instructions (step 6) and extend `filesTouch` to include `stats.tsx` and `server/routes/sessions.ts`. No `/update-roadmap` run needed.

## How to resume

1. `git checkout feature/messages-redesign` (already the active branch)
2. Run `/work-task` — it should present task004 as next unblocked
3. Proper flow this time: assess → present → approve → **dispatch a subagent** (don't do it in-session like wave 2) → reviewer subagent → cascade status → completed

**Process note from this session:** the task status flow is `in_progress → review → (reviewer runs) → completed`. Do not flip status after the review completes — flip to `review` *before* dispatching the reviewer, then to `completed` on pass.

## Key files to know before starting task004

- `client/src/components/analytics/messages/bubbles/` — all 7 bubble components + dispatcher + tool renderer registry
- `client/src/components/analytics/messages/bubbles/dispatcher.ts` — `renderMessage(msg, opts)` is the main entry point task004's viewer will call
- `client/src/components/analytics/messages/bubbles/SidechainGroup.tsx` — takes `{ subagentContext, children[] }`; task004 provides the grouping logic
- `client/src/components/analytics/sessions/SessionSidebar.tsx` — already built; task005's MessagesTab will wrap it alongside task004's viewer
- `shared/session-types.ts` — `TimelineMessage`, `TimelineSubagentContext`, `MessageTimelineResponse`
- `server/routes/sessions.ts` — `GET /api/sessions/:id/messages` endpoint task004 will consume

## Test status at handoff

- `npm run check` — clean
- `npm test` — **5,501 passing across 150 files**
- `new-user-safety.test.ts` — 3,078 passing
