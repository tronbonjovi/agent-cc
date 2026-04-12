# Flat-to-Tree Migration — Wave 1 + ToolTimeline

**Date:** 2026-04-11
**Predecessor:** `2026-04-12-session-hierarchy-design.md` (producer side, shipped in PR #3)
**Audit:** `docs/audits/2026-04-13-flat-to-tree-audit.md`

## Context

The session-hierarchy milestone shipped `SessionTree` alongside the existing `ParsedSession` flat arrays. The producer side is complete: subagent JSONL files are discovered, parsed, and cached as a full tree with cost rollups and three-tier linkage. Every consumer, however, still reads flat arrays — meaning every session with subagents is currently undercounted for cost, and every tool call in the UI is displayed without the assistant-turn context that would make it legible.

This milestone migrates the first wave of consumers to the tree. Scope is chosen to land two things in one coherent release: (1) correct cost numbers across every analytics/board surface, and (2) the biggest single UX improvement the tree unlocks — parent-turn context for tool calls in `ToolTimeline`. Three other client components (`SessionOverview`, `TokenBreakdown`, `FileImpact`) and three analytics scanners (`token-anatomy`, `cache-efficiency`, `model-intelligence`) remain on flat arrays until a follow-up milestone. They are not wrong today, just incomplete — migration is a UX enhancement, not a correctness fix.

## Goals

- Fix cost undercounting on every session with subagents. Board cards, cost analytics, health scoring, and session-value rankings all read from the tree.
- Give `ToolTimeline` the ability to attribute every tool call to the assistant turn that issued it and the subagent (if any) that ran it.
- Keep all downstream output shapes stable. No API contract changes, no card schema changes, no existing-test rewrites.
- Preserve graceful degradation: sessions without subagents render identically to today; sessions where the tree build fails fall back to flat-array code paths.

## Non-Goals

- `SessionOverview`, `TokenBreakdown`, `FileImpact` per-subagent breakdowns (Wave 2 follow-up).
- `token-anatomy`, `cache-efficiency`, `model-intelligence` scanners (Wave 3 — no correctness bug, UX-only).
- `conversationTree` removal (deferred indefinitely per session-hierarchy spec).
- `LifecycleEvents` tree-linking (requires schema change, separate milestone).
- `graph.ts` subagent/tool-call graph nodes (separate milestone).
- Any new API endpoint or response-shape addition beyond the already-shipped `?include=tree` parameter.

## Architecture

Four production files change on the server, three on the client. No shared abstractions are introduced — each file reads tree data from the already-shipped cache accessors (`sessionParseCache.getTreeById`, `getTreeByPath`) and substitutes tree-derived numbers for flat-array-derived numbers. The tree is additive to the cache (`{ parsed, tree, fileSize }`), so every existing cache access keeps working; consumers opt in by calling tree accessors instead of flat accessors.

The overall data flow is:

```
session JSONL files (parent + subagents)
   │
   ▼
session-parser + session-tree-builder (producer, shipped)
   │
   ▼
sessionParseCache  ──►  ParsedSession (flat)      ──► existing consumers (unchanged for Wave 2+)
                   └►  SessionTree (hierarchy)    ──► Wave 1 consumers (this milestone)
                                                        ├─ session-analytics.ts
                                                        ├─ session-project-value.ts
                                                        ├─ session-enricher.ts
                                                        └─ /api/sessions/:id?include=tree
                                                                │
                                                                ▼
                                                        useSessionDetail ──► SessionDetail ──► ToolTimeline
```

## Server Migration

### `server/scanner/session-analytics.ts`

**Today:** Sums `assistantMessages[].usage` per session to compute `totalCost`, then breaks down by model. Feeds `computeHealthReasons()` with raw message counts and tool-error counts. Every session with subagents is undercounted because the flat array is parent-only.

**Change:** Fetch the tree via `sessionParseCache.getTreeById(session.meta.sessionId)`. Read `tree.totals.costUsd` for the session total and `tree.totals.inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheCreationTokens` for aggregate token numbers. Per-model breakdown walks `tree.nodesById` looking at `assistant-turn` nodes (they carry `selfCost` and `model`). Health inputs (tool-error count, total tool calls) also come from the tree — walk `tool-call` nodes.

**Fallback:** If `getTreeById()` returns `null`, fall back to the current flat-array path and emit `console.warn` with the session id. This branch should never fire for healthy cached sessions; logging is defensive.

**Output contract:** Unchanged. Every field `session-analytics.ts` exports keeps the same name, shape, and type. The values are just correct now.

### `server/scanner/session-project-value.ts`

**Today:** Computes efficiency as `totalTokens / turnCount` using only the parent session's `assistantMessages`. Both numerator and denominator are parent-only, so the ratio is meaningful in a self-consistent way but wildly wrong compared to reality for sessions that delegate heavy lifting to subagents.

**Change:** Numerator pulls from `tree.totals` (input+output+cache tokens summed via the existing `costUsd` or token-sum helper). Denominator is `tree.totals.assistantTurns`, which includes subagent turns. Efficiency ranking becomes a true cost-per-turn metric across the whole tree.

**Fallback:** Same null-tree fallback as above. Warn and keep computing on flat arrays.

**Output contract:** Unchanged.

### `server/board/session-enricher.ts`

**Today:** Reads `sessionParseCache.getAll()` and walks each `ParsedSession` to produce enrichment metadata for the kanban board — cost, health, turn count, tool call count, auto-task linkage. File header (lines 5–28) explicitly documents that subagent costs are not included.

**Change:** Replace the cost/tool-count derivation with `tree.totals`. Auto-task linkage logic is unchanged (it matches on other fields). Delete the file-header comment acknowledging the gap — it's no longer true.

**Fallback:** Null-tree fallback as above.

**Output contract:** Unchanged. Board card schema stays exactly the same; the numbers on every card just rise to include subagent spend.

## Client Migration

### `client/src/hooks/use-sessions.ts`

`useSessionDetail(id)` today fetches `/api/sessions/:id` without any query params. Add a `{ includeTree?: boolean }` options argument. When `includeTree: true`, the hook appends `?include=tree`. The response type extends to include an optional `tree: SessionTree | null` field, matching the three-state contract already documented in `scanner-capabilities.md` (absent | null | SessionTree). Other consumers of `useSessionDetail` are unchanged — they don't pass `includeTree`, they don't pay the cost, and the response has no `tree` field for them.

### `client/src/components/analytics/sessions/SessionDetail.tsx`

The orchestrator calls `useSessionDetail(id, { includeTree: true })`. When the response arrives, `tree` is passed as a prop to `ToolTimeline`. Other child components (`Overview`, `TokenBreakdown`, `FileImpact`, `Health`, `Lifecycle`) continue to receive only their existing `parsed` prop this milestone. No TypeScript errors from the new prop — it's an additive optional.

### `client/src/components/analytics/sessions/ToolTimeline.tsx`

**Today:** Receives `tools: ToolExecution[]`, renders a flat chronological list with filter-by-name, filter-by-error, and sort-by-timestamp. No way to attribute a tool to the turn that issued it. No way to tell parent tools from subagent tools.

**Change:** Accept an additional optional `tree?: SessionTree` prop. When `tree` is present:

1. For each `ToolExecution`, resolve `issuedByAssistantUuid` → `tree.nodesById.get("asst:" + uuid)` to get the assistant-turn node.
2. Walk up `parentId` from that turn until hitting either `session-root` (parent session) or `subagent-root` (one of the subagents). The ancestor's id becomes the tool call's "owner color key."
3. Render the tool list with a small left indent grouping tools under their assistant turn (a collapsible turn header or an inline turn label — pick whichever is lightest-weight in the existing layout).
4. Apply a color tag derived from the owner key. Parent session gets a neutral/no tag. Each subagent gets a distinct color from a deterministic palette (hash of `agentId` → palette index) so the same subagent keeps the same color across views.

When `tree` is `null` or `undefined`: render exactly as today. This covers sessions without subagents (where the tree adds nothing useful) and the defensive null case.

Filter/sort controls keep their current semantics — filtering is applied to the underlying tool list, indent and color are visual overlays on top of the filtered result.

## Data Flow

1. Server scan builds `ParsedSession` + `SessionTree` eagerly at startup (already shipped).
2. `session-analytics.ts` reads `sessionParseCache.getTreeById()` for every session when computing per-session metrics. Same for `session-project-value.ts` and `session-enricher.ts`.
3. Cost-analytics routes (`/api/analytics/costs/*`) that delegate to these scanners automatically return corrected numbers as a byproduct — no route changes needed.
4. Board route responses use the corrected enrichment automatically.
5. Client session detail page calls `useSessionDetail(id, { includeTree: true })`. Backend returns `{ ...sessionData, records, parsed, tree }`. `SessionDetail` forwards `tree` to `ToolTimeline`. `ToolTimeline` resolves parent-turn context via `tree.nodesById` and renders with indent + color.

## Error Handling

- **Server null-tree fallback:** All three migrated scanners check `getTreeById()` → if null, fall back to current flat-array code path and emit a one-line warning with the session id. This preserves the "graceful degradation" rule in `CLAUDE.md` — no scanner throws, no endpoint returns a 500 because of tree absence.
- **Client null-tree rendering:** `ToolTimeline` treats `tree === null` and `tree === undefined` identically: flat-list render. No UI degraded-state indicator is shown — the absence of indent/color is itself the fallback.
- **Tree with warnings:** `tree.warnings` being non-empty is informational. Scanners ignore it (the rollup cost is still correct). `ToolTimeline` ignores it. A future milestone may surface warnings in the session detail UI.

## Testing

Fixture: the existing `tests/fixtures/session-hierarchy/` directory (shipped with PR #3) contains a scrubbed real multi-subagent session suitable for integration testing.

- **`tests/session-analytics.test.ts`** — add an integration test that loads the hierarchy fixture, parses and caches it, then calls `computeSessionAnalytics()` and asserts the returned `totalCost` is strictly greater than the sum of the parent session's `assistantMessages[].usage` cost alone. This is the "subagents are counted" assertion.
- **`tests/session-project-value.test.ts`** — add an equivalent assertion: efficiency for the fixture session uses subagent turns in the denominator. Assert `assistantTurns` (or whatever the scanner exposes) matches `tree.totals.assistantTurns`.
- **`tests/session-enricher.test.ts`** — add an assertion that the enriched card cost field matches `tree.totals.costUsd` for the fixture session.
- **`tests/tool-timeline.test.tsx`** — new or extended component test. Build a synthetic `SessionTree` with two subagents, each issuing tool calls. Render `ToolTimeline` with the tree and assert: (1) tools are grouped under their assistant-turn parent, (2) each subagent's tool calls carry the subagent's color tag, (3) parent-session tool calls carry the neutral tag. Also assert that rendering without a tree prop produces the current flat list.
- **Existing regression coverage** stays green. `session-analytics.test.ts`, `cost-analytics` route tests, `session-enricher.test.ts`, board aggregator tests, session-detail rendering tests — all should pass without modification because output shapes don't change.

New-user-safety test (`tests/new-user-safety.test.ts`) runs as part of the suite; no changes to its expectations are anticipated since this milestone touches no paths, no PII, no UI copy.

## Rollout

Server migrations are independent and can land in any order. Each one is a single file change plus its test. The client changes form a single unit (hook → orchestrator → timeline) and should land together to avoid a half-wired tree prop.

Typical sequence for the implementation plan:

1. `session-analytics.ts` + test.
2. `session-project-value.ts` + test.
3. `session-enricher.ts` + test (delete file-header comment).
4. `useSessionDetail` hook signature extension.
5. `SessionDetail.tsx` prop forwarding.
6. `ToolTimeline.tsx` tree-aware rendering + test.
7. Full `npm run check && npm test` and deploy via `scripts/deploy.sh`.

Each step ships a working increment; none of them breaks the session detail page or the board mid-flight.

## Success Criteria

- Every session that contains subagents reports a cost in the board, in `/api/analytics/costs/*`, and in session-detail that is strictly greater than the pre-migration value. Sessions without subagents report identical values.
- `ToolTimeline` for a multi-subagent session shows tools visually grouped under their assistant turn, with a distinct color per subagent.
- All existing tests pass. New tests (three server integration, one client component) pass.
- `session-enricher.ts` no longer contains the lines 5–28 comment acknowledging the subagent-cost gap.
- No change to any API response shape; no change to any board card schema; no change to any existing test file beyond the additions described above.
