# Sessions Tab Makeover — Design Spec

**Date:** 2026-04-13
**Status:** Draft, awaiting user review
**Template:** Messages tab (`client/src/components/analytics/messages/`)

## Goal

Rebuild the Sessions tab detail view to mirror the granularity and structure of the Messages tab. The Messages redesign succeeded by being tree-aware, having a clear filter bar, and grouping subagent activity with consistent owner colors. Sessions should follow the same template at the session level: clean picker on the left, structured detail on the right, controlled by a top filter bar that toggles what aspects of the session render.

The current Sessions detail has too many sections, several of them broken, and a left-side filter strip that filters by health (the wrong dimension). This spec replaces it.

## Out of scope

- Backend route changes. `/api/sessions/:id?include=tree` already returns everything we need.
- New shared infrastructure. Subagent colors, tree-turn-walker, and Messages tool renderers exist already.
- Session list endpoint enrichment. The fix path runs through SessionOverview self-computing from `parsed` + `tree`, not through adding fields to the list endpoint (see Bug Diagnosis).

## Bug diagnosis: Overview metrics (Cost / Cache Hit / Sidechains report 0 or "-")

Traced end-to-end. The root cause is **architectural, not extraction**: the data exists, but the prop-drilling chain that's supposed to deliver it never wires the props.

### Cost

- `client/src/components/analytics/sessions/SessionsTab.tsx:42` builds an `EnrichedSession` with `costUsd: 0` hardcoded. The comment at line 36–37 explicitly notes this: *"full enrichment (health, cost, model) would come from a dedicated endpoint. For now we use basic data from the sessions list endpoint."*
- That zero flows: `SessionsTab.tsx:83` → `SessionDetail` `costUsd` prop → `SessionDetail.tsx:169` → `SessionOverview` `costUsd` prop.
- `SessionOverview.tsx:220` then renders `formatMetric(costUsd, "cost")` → `"$0.0000"`.
- Meanwhile, the **real cost data is sitting unused** in the same component scope: `parsed.assistantMessages[].usage` has per-message cost, and (when present) `tree.root.rollupCost.costUsd` has the post-order rollup that already includes subagent spend. SessionOverview never reads either.

### Cache Hit

- Identical pattern. `SessionsTab.tsx:38–51` builds `EnrichedSession` without setting `cacheReadTokens` or `cacheCreationTokens` at all, so they arrive as `undefined`.
- `SessionOverview.tsx:193–196`: `cacheRead = cacheReadTokens ?? 0`, `cacheCreate = cacheCreationTokens ?? 0`, `cacheTotal = 0`, `cacheHitRate = null` → renders `"-"`.
- The real data lives in `parsed.assistantMessages[].usage.cacheReadTokens` / `.cacheCreationTokens`. `tree.root.rollupCost` also carries cache totals when the tree is built.

### Sidechains

- Subtler: `SessionOverview.tsx:235` reads `counts.sidechainMessages` from `parsed.counts`. This field does exist on the parser output, but for sessions with subagents it consistently reports 0 in practice.
- The likely cause: sidechain JSONL records live in **separate files** from the parent session and the parser's `userMessages` / `assistantMessages` arrays don't include them, so any counter scanning those arrays misses every sidechain message. Sidechain records do get pulled into the **tree** via `tree.subagentsByAgentId` (which is why the Subagents chip strip works correctly when present), but the flat counter doesn't share that source.
- The fix path is the same as Cost / Cache: derive the sidechain count from `tree.subagentsByAgentId` size when the tree is available, and only fall back to `counts.sidechainMessages` (with a warning) when it isn't. This matches the flat-to-tree wave 1–3 pattern already used by other components.

### Unified root cause

SessionOverview is structured as a **dumb prop-receiver**, expecting an upstream enricher to compute and pass cost/cache/sidechain data via props. That enricher was never built — `SessionsTab.tsx:36–37` documents this as a known shortcut. The prop chain delivers zeros and undefineds.

The cleaner architecture is the one already in use for Models and Subagents in the same component: **SessionOverview self-computes from `parsed` + `tree`**, exactly like `computeModelBreakdownFromTree` and `computeSubagentChips` do today. No upstream enrichment, no list-endpoint changes — just three new pure helpers that consume the data that's already in scope.

### Fix

Add three pure helpers to `SessionOverview.tsx`, mirroring the existing tree-aware helpers:

```ts
computeCostFromTree(tree, parsed): { costUsd, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
computeSidechainCount(tree, parsed): number
computeCacheHitRate(cacheReadTokens, cacheCreationTokens): number | null
```

Each helper prefers `tree.root.rollupCost` and `tree.subagentsByAgentId.size` when the tree is present, falls back to summing `parsed.assistantMessages[].usage` when it isn't, and emits a single one-shot `console.warn` in the flat-fallback path (matching the wave 3 pattern). The four cost/cache/token props on `SessionOverview` and the corresponding chain through `SessionDetail` and `SessionsTab` are deleted as dead.

The sidechain count helper specifically keys off `tree.subagentsByAgentId.size` first; this is the same source the working Subagents chip strip reads, so the two displays will always agree.

## Layout (the makeover)

### Left pane — clean session picker

Replace the current health-pill filter strip with picker-only controls:

- **Search** input (filters by display name + project + id)
- **Sort dropdown:** newest, oldest, most-messages, highest-cost, longest
- **Project dropdown** (from existing unique-projects extraction)
- **Model dropdown** (new — populated from session list metadata)
- **Date range** (optional, simple "last 24h / 7d / 30d / all")

Drop entirely:
- Health pills (good / fair / poor) — wrong filter dimension; health doesn't predict whether the session is what the user is looking for
- Status pills (active / inactive / stale / empty) — low-signal
- `hasErrors` toggle — folds into the right-pane Errors-only mode instead

Each row keeps: title, project, recency, cost badge, owner-color dot if subagents present.

### Right pane — session detail with FilterBar at top

A new `SessionFilterBar` component, modeled on `client/src/components/analytics/messages/FilterBar.tsx`, sits at the top of the detail panel.

**Pills** (independent toggles, control which sections render below):
- Overview
- Tools
- Tokens
- Linked Task
- Errors-only (cross-cutting modifier — when on, Tools section filters to error-only entries)

**Mode presets** (shortcuts that set pill state, not black boxes):
- **Default** — Overview + Tools + Tokens + Linked Task (errors-only off)
- **Deep-dive** — all pills on, errors-only off
- **Errors** — Overview + Tools, errors-only on

**Critical preset behavior:** picking a preset must **visually activate the individual pills it contains**. If the user picks Deep-dive, every pill lights up as "active" in the UI; the user can then click an individual pill to toggle it off without leaving the preset visually selected (or the preset indicator can clear on manual edit — see implementation note below). Presets are shortcuts for common combinations, not opaque modes.

Implementation note: track preset state separately from pill state. When a preset is clicked, set the pill state to match the preset's pill set. When a pill is clicked individually after a preset, the pill state diverges; the preset indicator should clear (no preset is "active") but the pills retain whatever combination the user landed on. This mirrors how the Messages FilterBar's `applyPreset` / `togglePillGroup` / `isPillActive` helpers compose, which is the canonical pattern.

## Sections (post-makeover)

### 1. Overview

The fixed metric grid, plus the "Activity" salvage from Lifecycle Events folded in.

**Metric grid** — same eight cells as today, but Cost / Cache Hit / Sidechains are now wired correctly via the three new helpers. All metrics computed from `parsed` + `tree`, no upstream props.

**Models row** — unchanged (already tree-aware via `computeModelBreakdownFromTree`).

**Subagents chip strip** — unchanged (already tree-aware via `computeSubagentChips`).

**Activity row (new — folded in from Lifecycle Events):**
A single compact line summarizing meaningful lifecycle facts: `Active 8m · Switched to Sonnet at 14:32 · First error at 14:41`. Click to expand for the full lifecycle event list as a tooltip / popover. The standalone Lifecycle Events section is deleted.

The exact set of facts surfaced: active duration (from `parsed.meta.firstTs` / `lastTs`), model switches (from walking `parsed.assistantMessages` for adjacent records with different `model` values), and first error timestamp (from `parsed.lifecycle` filtering for error events). All three are derivable from data the component already has access to.

**Health badge (folded in from Health Details):**
A single inline badge below the metric grid, showing the health score with reason chips. Tooltip on hover shows the full reason list. The standalone Health Details section is deleted.

### 2. Tool Timeline

**Rebuilt by reusing the Messages tool renderer registry directly.** Per user direction, this is **option A** — import directly from `client/src/components/analytics/messages/tools/`, no extraction to `shared/`. If a third consumer ever appears, refactor then.

Replace the current `ToolTimeline.tsx` (~860 LOC of bespoke rendering) with a thin wrapper:

```tsx
<SessionToolTimeline
  tools={parsed.toolTimeline}
  tree={session.tree}
  errorsOnly={filterState.errorsOnly}
/>
```

Internally, the wrapper:
1. Walks `parsed.toolTimeline` chronologically
2. For each tool, looks up the issuing assistant turn and resolves the owner via `resolveToolOwner(tree, tool)` (already in `subagent-colors.ts`)
3. Groups consecutive tools by owner using the same `SidechainGroup`-style grouping as `ConversationViewer`
4. Renders each tool by dispatching to the Messages tool renderer registry — every tool gets its proper Summary module, with a fallback for unknown tools
5. Each row has the owner color dot on the left, tool icon, name, args summary, status, duration
6. When `errorsOnly` is true, filters to tools with non-success status before grouping

The bespoke `client/src/components/analytics/sessions/ToolTimeline.tsx` is deleted along with its test file. Tests for the wrapper cover: chronological ordering, owner grouping, errors-only filter, fallback rendering for unknown tools, and tree-null degradation (flat list with no owner colors).

### 3. Token Growth (renamed from Token Breakdown)

Keep the line-by-line cumulative table the user explicitly likes. Fix the regressions and add a viewport constraint.

**Bug fixes:**
- **Role display bug** ("sA" string truncation): trace the `Role` column source in `TokenBreakdown.tsx` — likely a `.slice(0, 2)` or a substring operation. Replace with proper labels: `User`, `Assistant`, `Subagent: <agentType>`.
- **Model bug** (always "Opus 4.6"): the per-row model is being read from a session-root field instead of the per-turn assistant record. Walk the tree node corresponding to each row's assistant turn and read its `model` field. Use `resolveAssistantTurnOwner` to also populate the Agent column correctly.
- **Agent column population**: confirm the Agent column already wired in flat-to-tree wave 2 still renders the right owner color and label for subagent rows. If not, fix per the same `resolveAssistantTurnOwner` walk.

**Viewport constraint:**
- Wrap the table in a container with `max-h-[60vh] overflow-auto`
- Header row: `sticky top-0` with a **solid background color** (e.g., `bg-background` or `bg-card`) — never transparent, otherwise content bleeds through on scroll. This is a hard requirement, not a polish item.
- The cumulative growth visual (the line per row showing cache + cumulative + tokens) stays exactly as today — that's the part the user values.

### 4. Linked Task

Unchanged. Renders only when `linkedTaskId` is present.

## Removed sections

- **File Impact** — dropped. Read/write counts on heavily-touched files are noise; the user's framing was correct.
- **Health Details** — dropped as a standalone section. Folded into Overview as inline badge + tooltip.
- **Lifecycle Events** — dropped as a standalone section. Salvaged as the "Activity" row in Overview.

## Data flow

```
SessionsTab
  ├── SessionList (left pane, clean picker)
  └── SessionDetail (right pane)
      ├── SessionFilterBar (new — pills + presets, top of right pane)
      └── Section grid, controlled by filter state:
          ├── SessionOverview (self-computes cost/cache/sidechains from parsed + tree)
          ├── SessionToolTimeline (new wrapper, imports from messages/tools/)
          ├── TokenBreakdown (bug-fixed, sticky header, scroll, tree-aware model resolution)
          └── LinkedTask (when present)
```

The `useSessionDetail(sessionId, { includeTree: true })` call in `SessionDetail.tsx:52` already fetches the tree. No backend changes.

## Components to create

| Path | Purpose |
|---|---|
| `client/src/components/analytics/sessions/SessionFilterBar.tsx` | Pills + presets, mirroring `messages/FilterBar.tsx` |
| `client/src/components/analytics/sessions/SessionToolTimeline.tsx` | Thin wrapper around Messages tool renderers, with owner grouping |

## Components to modify

| Path | Change |
|---|---|
| `client/src/components/analytics/sessions/SessionsTab.tsx` | Drop the broken `costUsd: 0` enrichment; pass only what SessionDetail still needs |
| `client/src/components/analytics/sessions/SessionDetail.tsx` | Wire `SessionFilterBar`; switch sections from collapsibles to filter-pill-driven; delete dead props for cost/cache/health/lifecycle props that are no longer needed |
| `client/src/components/analytics/sessions/SessionOverview.tsx` | Add three self-compute helpers; remove cost/cache/token props from the interface; add Activity row; fold in inline Health badge |
| `client/src/components/analytics/sessions/SessionList.tsx` | Strip health pills + status pills + hasErrors toggle; keep search/sort/project; add model dropdown |
| `client/src/components/analytics/sessions/TokenBreakdown.tsx` | Fix Role display, fix Model resolution via tree walk, add max-height + sticky header with solid bg |

## Components to delete

| Path | Why |
|---|---|
| `client/src/components/analytics/sessions/ToolTimeline.tsx` | Replaced by `SessionToolTimeline` wrapping Messages renderers |
| `client/src/components/analytics/sessions/FileImpact.tsx` | Section dropped |
| `client/src/components/analytics/sessions/HealthDetails.tsx` | Section dropped, folded into Overview |
| `client/src/components/analytics/sessions/LifecycleEvents.tsx` | Section dropped, salvaged into Overview Activity row |
| Corresponding test files for the four deletions | |

## Testing

All tests use Vitest with the existing scrubbed session fixture pattern.

**New tests:**
- `SessionFilterBar`: pill toggle, preset application, preset visually activates contained pills, preset clears when pill manually toggled, errors-only state propagates
- `SessionOverview` self-compute helpers:
  - `computeCostFromTree` with tree present (uses `tree.root.rollupCost`, includes subagent spend)
  - `computeCostFromTree` with tree null (sums `parsed.assistantMessages[].usage`, emits one-shot warn)
  - `computeSidechainCount` with tree present (returns `subagentsByAgentId.size`)
  - `computeSidechainCount` with tree null (falls back to `parsed.counts.sidechainMessages`)
  - `computeCacheHitRate` with zero cache total (returns null, not 0)
- `SessionOverview` Activity row: model switch detection from adjacent assistant records with different models; first-error extraction from lifecycle
- `SessionToolTimeline`: chronological order, owner grouping, errors-only filter, fallback for unknown tool kind, tree-null degradation
- `TokenBreakdown` regression coverage: Role label is `User` / `Assistant` / `Subagent: <type>` not `sA`; Model column reflects per-turn assistant model not session-root model; Agent column populated for subagent rows

**Modified tests:**
- `SessionList` filter tests: drop health/status pill expectations, add model dropdown expectations
- `SessionDetail` rendering tests: switch from collapsible-section assertions to filter-pill-driven section visibility
- `new-user-safety.test.ts`: confirm no PII / hardcoded paths introduced (already enforced by pre-commit hook)

**Test count delta:** roughly +20 / -10 net positive.

## Build sequence

1. **Bug-fix isolation pass** — add the three SessionOverview self-compute helpers and tests, fix TokenBreakdown Role / Model / sticky-header. Ship as one PR. Verifiable improvement immediately, no layout changes yet.
2. **Layout pass** — add SessionFilterBar, rewire SessionDetail to filter-pill-driven sections, strip SessionList of health/status pills. Ship as PR 2.
3. **Tool Timeline replacement** — add SessionToolTimeline wrapper, delete bespoke ToolTimeline. Ship as PR 3.
4. **Cleanup pass** — delete FileImpact, HealthDetails, LifecycleEvents components and tests; fold Activity row + Health badge into Overview. Ship as PR 4.

This sequencing means the user sees Overview metrics fix in the first deploy, even before the layout reshuffle lands.

## Open questions

None at spec-writing time. All design decisions captured.
