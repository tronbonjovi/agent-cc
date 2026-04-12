# Flat-to-Tree Audit — ParsedSession Consumers

**Date:** 2026-04-13
**Context:** The session-hierarchy milestone (merged to main in PR #3) introduces `SessionTree` alongside the existing `ParsedSession` flat arrays. This audit surveys every consumer of `ParsedSession` in the codebase and ranks the migration opportunity for each — where the tree would fix wrong data, where it would clean up manual reconstruction, and where flat arrays are already the right shape.

See `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` for the tree design.

## Summary

| Priority | Count | Impact |
|---|---|---|
| **HIGH** | 4 | Currently shows wrong or missing data — subagents invisible, costs undercounted, tool-to-turn linkage impossible |
| **MEDIUM** | 10 | Works today but tree would eliminate manual aggregation, enable per-subagent breakdowns, simplify consumer code |
| **LOW** | 6 | Flat arrays are sufficient; tree adds nothing for this consumer |

**Key findings:**

- **Subagent blindness is systemic.** Every analytics scanner and every session-detail UI component is currently blind to subagent activity. The session-hierarchy merge fixed the producer side — subagent JSONL files are now discovered, parsed, and cached as `SessionTree`. Each consumer still needs a follow-up migration to actually read the new tree data; flat-array consumers continue seeing the pre-tree view.
- **`conversationTree` fossil confirmed.** Zero production consumers. Five test references (session-parser, cache-efficiency, model-intelligence, token-anatomy, session-project-value — all mock it as `[]`). The parser still produces it. Safe to keep as-is per the design spec; migrate tests later.
- **Top migration targets:** `session-analytics.ts` (fixes undercounted cost), `session-enricher.ts` (already has a code comment acknowledging the gap), `ToolTimeline.tsx` (enables the assistant-turn → tool-call parent relationship that's impossible today).

## Top 3 migration priorities

1. **`server/scanner/session-analytics.ts`** — cost computation. Swap flat `assistantMessages` iteration for tree traversal of `assistant-turn` nodes; use `root.rollupCost` so subagent tokens are counted. Every session with subagents is currently undercounted. This is a correctness fix, not a nice-to-have.

2. **`server/board/session-enricher.ts`** — auto-linking and enrichment. There is already a comment (lines 5–28) documenting that subagent costs are missing. Replace with `tree.totals.costUsd` and optionally tag enrichment with subagent IDs so board cards can show "this task was worked on by subagent X."

3. **`client/src/components/analytics/sessions/ToolTimeline.tsx`** — tool visibility. Currently displays a flat list with no way to answer "which assistant turn called this tool?" Tree provides `tool-call.parentId` pointing at the issuing assistant-turn, enabling indented display and per-subagent tool grouping.

## Consumer audit

| File | What it does today | What tree data would change | Priority |
|---|---|---|---|
| `server/scanner/session-analytics.ts` | Computes cost by summing `assistantMessages[].usage` per session. Breaks down by model. Calls `computeHealthReasons()` over raw counts. | Use `root.rollupCost` so subagent costs are included. Every session with subagents is currently undercounted. Health scoring improves as subagent tool errors become visible. | **HIGH** |
| `server/board/session-enricher.ts` | Reads `sessionParseCache.getAll()` to auto-link tasks to sessions. Returns enrichment with cost, health, turnCount, totalToolCalls — session-level only. File header comment explicitly documents that subagent costs are not included. | `tree.totals` gives correct rollup cost and tool counts. Enrichment can tag which subagent handled a task. The documented gap closes. | **HIGH** |
| `server/scanner/session-project-value.ts` | Sums tokens/cost from `assistantMessages[]` to score each session's efficiency (tokens / turn count) and health. | Efficiency metric is wrong because denominator (turn count) excludes subagent turns while numerator is also parent-only. Tree rollup makes both accurate and enables per-subagent cost-efficiency ranking. | **HIGH** |
| `client/src/components/analytics/sessions/ToolTimeline.tsx` | Receives `tools: ToolExecution[]` flat. Filter-by-name, filter-by-error, sort by timestamp. No way to attribute tools to the assistant turn that issued them. | Tree provides `tool-call.parentId` → `assistant-turn`. Indent by parent. Group Agent tool calls with the subagent they spawned. Subagent tool calls become visible for the first time. | **HIGH** |
| `server/scanner/token-anatomy.ts` | Iterates `assistantMessages[]` by message index; estimates system prompt from the first-message token spike and categorizes output tokens by tool-call / thinking presence. | Tree walk of assistant-turn nodes enables per-subagent anatomy (currently merges parent + all subagents). Recursive tree walk replaces ~30 lines of index-based iteration. | MEDIUM |
| `server/scanner/cache-efficiency.ts` | Iterates `assistantMessages[]` per session by index. Computes cache hit rate, first-message vs steady-state averages. | Walk assistant-turn nodes per subagent-root to build per-agent cache curves ("which subagent has the best cache hit rate?") — impossible today. Output shape stays same; source becomes tree. | MEDIUM |
| `server/scanner/model-intelligence.ts` | Iterates `assistantMessages[]`, groups by `msg.model`. Reports sessions per model and cache savings. | Enables "parent model vs subagent model" breakdown. Currently subagent models are entirely invisible in the global report. | MEDIUM |
| `server/routes/cost-analytics.ts` | Calls `sessionParseCache.getAll()` and hands sessions to `computeTokenAnatomy()` / `computeModelIntelligence()` / `computeCacheEfficiency()`. Glue code only. | No direct change; downstream scanners adopt tree and this route's output changes as a byproduct (all four cost endpoints return corrected numbers). | MEDIUM |
| `server/routes/sessions.ts` | `GET /api/sessions/:id` returns `{ ...session, records, parsed }`. The session-hierarchy branch adds `?include=tree` returning a `tree` field. | Already wired for tree on the feature branch. Route itself is unblocked; the remaining work is client adoption. | MEDIUM |
| `client/src/components/analytics/sessions/SessionDetail.tsx` | Orchestrator. Fetches `useSessionDetail()` → `ParsedSession`. Passes `parsed` to child components (Overview, ToolTimeline, TokenBreakdown, FileImpact, Health, Lifecycle). | Accept optional `tree` from API and forward to children. Enables top-level "subagent list" view. Additive; no existing behavior breaks. | MEDIUM |
| `client/src/components/analytics/sessions/SessionOverview.tsx` | Reads `assistantMessages[]` to compute model breakdown, extract system events, show message counts. Summary of key metrics. | Shows merged parent+subagent models today (actually just parent — subagents are invisible). Tree makes subagent models visible as a distinct breakdown. | MEDIUM |
| `client/src/components/analytics/sessions/TokenBreakdown.tsx` | Reads `assistantMessages[]` and `userMessages[]`, interleaves by timestamp, builds cumulative token table. | Enables per-subagent token breakdowns instead of a single flattened view. Cumulative math becomes accurate once subagent turns are included. | MEDIUM |
| `client/src/components/analytics/sessions/FileImpact.tsx` | Receives `tools: ToolExecution[]` flat. Groups by directory, counts reads/writes/edits per file. | Tree provides parent assistant-turn for each tool. Can color by subagent ("this file was edited in subagent-2") instead of flat "edited." Grouping logic (~25 lines) becomes simpler. | MEDIUM |
| `server/scanner/session-cache.ts` | Caches one `ParsedSession` per session file keyed by path; invalidates on file size change. | Already extended on feature branch to store `{ parsed, tree }`. Consumers opting into `getTreeById()` / `getTreeByPath()` get O(1) access. Existing `getOrParse()` / `getById()` / `getAll()` unchanged. | MEDIUM |
| `server/scanner/session-scanner.ts` | Main scan orchestrator. Walks project JSONL files, calls `parseSessionFile()` per session, stores in cache. Does not read `ParsedSession` fields. | Already extended on feature branch to call `discoverSubagents()` + parse each subagent + `buildSessionTree()` eagerly at scan time. Not a consumer migration — this is the producer side. | LOW (producer) |
| `server/scanner/session-parser.ts` | Iterates JSONL, produces flat arrays. One additive change on the feature branch: `ToolExecution.issuedByAssistantUuid` for tree linkage. | Producer; contract unchanged. Additive field only. | LOW (producer) |
| `server/routes/graph.ts` | Uses `sessionParseCache` for weight calculation only (how many sessions exist). Does not read `assistantMessages` / `toolTimeline`. | Graph rendering treats sessions as leaf nodes. A future milestone could surface subagents and tool calls as graph nodes, but the current use case is unaffected. | LOW |
| `client/src/components/analytics/sessions/LifecycleEvents.tsx` | Receives `events: LifecycleEvent[]` flat, formats by time offset. | `LifecycleEvent` has no tree-linkable parent today. Would require schema change to nest events under the subagent that produced them. Defer. | LOW |
| `client/src/components/analytics/sessions/HealthDetails.tsx` | Displays precomputed health score and reasons. Does not read `ParsedSession` directly. | No direct change; upstream enricher adopts tree and this component receives improved scores as a byproduct. | LOW |
| `client/src/hooks/use-sessions.ts` | React Query hooks — HTTP glue only. | Add optional `?include=tree` query param. Pure transport. | LOW |

## `conversationTree` fossil — confirmation

The session-hierarchy spec claims `conversationTree` has 5 test references and 0 production consumers. Verified:

| Location | Role | Count | Notes |
|---|---|---|---|
| `server/scanner/session-parser.ts` | Producer | 1 | Parser writes it into every `ParsedSession`. |
| `shared/session-types.ts` | Type definition | 1 | `ConversationNode` interface. Marked `@deprecated` in JSDoc per spec. |
| `tests/session-parser.test.ts` | Test mock / assertion | 2 | Asserts shape of the output. |
| `tests/cache-efficiency.test.ts` | Test mock | 1 | Set to `[]` as placeholder. |
| `tests/model-intelligence.test.ts` | Test mock | 1 | Set to `[]` as placeholder. |
| `tests/token-anatomy.test.ts` | Test mock | 1 | Set to `[]` as placeholder. |
| Production consumers | Reader | **0** | Nothing outside tests ever reads the field. |

**Conclusion:** Keep as-is. The spec explicitly defers removal to a later cleanup milestone to avoid churning the 5 tests for no functional gain. Do not remove.

## Migration recommendations

Producer side is done — the session-hierarchy merge shipped `buildSessionTree`, `discoverSubagents`, cache storage, scanner wiring, and the `?include=tree` route parameter. The remaining work is consumer migration, in waves:

1. **First wave — cost correctness.** Migrate `session-analytics.ts`, `session-project-value.ts`, and `session-enricher.ts` to read `tree.totals` and `root.rollupCost`. Fixes the undercounting bug across every cost route and board session card. Needs integration tests against a real multi-subagent fixture (the `session-hierarchy` fixture under `tests/fixtures/` works).

2. **Second wave — client UX.** Add `?include=tree` to `useSessionDetail()`. Migrate `ToolTimeline.tsx` first (biggest UX win: parent turn context for every tool call). Then `SessionOverview.tsx`, `TokenBreakdown.tsx`, `FileImpact.tsx` to show per-subagent breakdowns.

3. **Third wave — analytics scanners.** `token-anatomy.ts`, `cache-efficiency.ts`, `model-intelligence.ts` all benefit from per-subagent breakdown but none are currently wrong — migrate when the UX is ready to display the extra dimension.

4. **Defer indefinitely.** `conversationTree` removal (keeps existing tests stable). `LifecycleEvents` tree-linking (needs schema change to carry a parent reference). `graph.ts` subagent nodes (belongs in its own milestone).
