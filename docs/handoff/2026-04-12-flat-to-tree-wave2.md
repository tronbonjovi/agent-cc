# Handoff — flat-to-tree Wave 2

**Date:** 2026-04-12
**Status:** Plan written and user-approved, execution deferred

## Context

Wave 1 of the flat-to-tree migration shipped via PR #4 on 2026-04-12 (server analytics/value/enricher + tree-aware ToolTimeline). Wave 2 finishes the client side — per-subagent breakdowns in `SessionOverview`, `TokenBreakdown`, and `FileImpact` so sessions with subagents visibly communicate which agent ran which turns, spent which tokens, and touched which files.

This session brainstormed the scope against `docs/superpowers/specs/2026-04-11-flat-to-tree-wave1-design.md` and `docs/audits/2026-04-13-flat-to-tree-audit.md`, then wrote the plan. No code changed.

## Plan location

`~/.claude/plans/mighty-pondering-flute.md`

## Key design calls already made

- **Shared module extracted first.** `PALETTE`, `colorClassForOwner`, `ToolOwner`, `resolveToolOwner` move out of `ToolTimeline.tsx` into `client/src/components/analytics/sessions/subagent-colors.ts`. A new `resolveAssistantTurnOwner` helper lands in the same module for `TokenBreakdown`'s row owner resolution. `ToolTimeline.tsx` re-exports the old names for backward compat so existing tests keep passing.
- **Graceful degradation everywhere.** Every migrated component takes `tree?: SerializedSessionTreeForClient | null`. When the tree is absent, output is byte-identical to today. Sessions without subagents never show any new UI.
- **SessionOverview** gains a tree-aware model walk (surfaces subagent-only model names) and a compact "Subagents" chip strip below Models.
- **TokenBreakdown** builds rows from `tree.nodesById` when present — row count matches `tree.totals.assistantTurns`, cumulative math becomes accurate, new "Agent" column tags each row with its owning subagent's palette color.
- **FileImpact** adds `ownerCounts` to `FileEntry` and renders up to 3 small owner dots per file row.
- **Same palette across all four components** so the same subagent gets the same color everywhere in the detail panel.

## Test strategy (important — Wave 1 hit this)

`vitest.config.ts` globs `tests/**/*.test.ts` and **explicitly excludes `client/`**. There is no jsdom / `@testing-library` setup. Wave 2 must use the same pattern Wave 1 landed on: extract every testable unit as a **pure helper function** from the component file, export it, and assert on the helper directly from a `.test.ts` file. No React rendering, no `.test.tsx`, no `render()`.

Helpers to export for testing:
- `computeModelBreakdownFromTree`, `computeSubagentChips` (from `SessionOverview.tsx`)
- `buildTokenRowsFromTree` (from `TokenBreakdown.tsx`)
- `groupByDirectoryWithOwners` (from `FileImpact.tsx`)

## Task decomposition

1. `task001` — Extract `subagent-colors.ts` + tests; no visual change
2. `task002` — SessionOverview tree wiring + chip strip
3. `task003` — TokenBreakdown tree wiring + Agent column
4. `task004` — FileImpact owner dot cluster
5. `task005` — SessionDetail prop forwarding + full verify + deploy + CHANGELOG + CLAUDE.md test count

Branch: `feature/flat-to-tree-wave2` (create before editing — repeat offender rule, memory `feedback_branch_before_work.md`).

## To resume next session

1. Read `~/.claude/plans/mighty-pondering-flute.md`
2. Read `docs/audits/2026-04-13-flat-to-tree-audit.md` rows for SessionOverview / TokenBreakdown / FileImpact for context
3. Read `docs/scanner-capabilities.md` sections "Data extraction — SessionTree" and "Node kinds" for the data shape
4. Check out `feature/flat-to-tree-wave2` from main and start on task001
5. Run `/work-task` once a roadmap milestone is scaffolded, or just execute the plan directly
