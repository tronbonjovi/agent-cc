---
date: 2026-04-13
topic: codebase-cleanup Phase 2 dispatch
milestone: codebase-cleanup
branch: feature/codebase-cleanup
phase: 2 of 4
---

# Handoff — codebase-cleanup Phase 2

## Context

Milestone `codebase-cleanup` is 3/8 tasks done. Phase 1 (dead code removal) landed cleanly across three commits on `feature/codebase-cleanup`. Phase 2 (consolidation) is fully queued — both contracts were rewritten during pre-flight when significant drift from the original audit docs surfaced.

The branch has NOT been pushed. A fresh session should start here to dispatch Phase 2.

## What's done

Three commits on `feature/codebase-cleanup`:

- `01357fd refactor: split session-analytics-panel into live panels — codebase-cleanup-task002` — extracted `BashKnowledgePanel` → `client/src/components/library/bash-knowledge-panel.tsx`, `WorkflowConfigPanel` → `client/src/components/settings/workflow-config-panel.tsx`, deleted `session-analytics-panel.tsx` (739 LOC) and `session-health-panel.tsx` (164 LOC).
- `6bedbf8 refactor: delete dead pages and orphan imports — codebase-cleanup-task001` — deleted `pages/sessions.tsx` (~1,068 LOC), `pages/activity.tsx`, `pages/prompts.tsx`, `pages/projects.tsx`, duplicate prompt hooks in `use-sessions.ts`, `Projects` lazy import in `App.tsx`. `/board`, `/sessions`, `/activity` redirect routes preserved. Subagent correctly refused to delete `pages/board.tsx` — the audit claim was wrong, that file is the live `BoardPage` at `/projects`.
- `a742548 refactor: delete remaining dead files and dead code — codebase-cleanup-task003` — deleted `health-indicator.tsx`, `stat-card.tsx`, `use-count-up.ts`, `use-debounce.ts`, `board/board-filters.tsx`, `onboarding-wizard.tsx`. Removed `UsageTab`/`ActivityTab` + 12 helpers from `pages/stats.tsx` (421 → 52 LOC). Removed `HistoryTab`/`ExecutionCard`/`StatsTab` from `library/agents-tab.tsx` (773 → 461 LOC). Removed commented-out `OnboardingWizard` references from `App.tsx`.

Test suite green: **5,475 tests across 150 files** (down from 5,682/155 — delta is pinned-dead-export test blocks removed with their source files, not coverage loss). `npm run check` clean.

## Workflow-framework state

All artifacts are in sync per the discipline established this session. The kanban should render correctly:

- **MILESTONE.md**: `status_override: in_progress` (forces milestone to render as active even when no task is currently in_progress); task list titles match contract titles.
- **TASK.md**: task001/002/003 status `completed`, task004–008 status `pending`. Phase metadata untouched.
- **Task contract frontmatter**: all 8 tasks have valid required fields (id, title, status, created, updated, milestone, dependsOn, complexity, parallelSafe, phase, filesTouch). task004 and task005 contracts were **rewritten in place** (title, filesTouch, full body) — see next section.

## Phase 2 contracts — rewritten during pre-flight

### Why the rewrite was needed

The original task004/task005 contracts were derived from three audit docs (`docs/audit-2026-04-13.md`, `docs/codex-cold-audit-2026-04-13.md`, `docs/cold-audit-2026-04-13.md` — all untracked, left in working tree). Pre-flight verification against the actual codebase revealed:

**task004 drift:**
- 3 moved-file paths wrong: `components/graph/GraphSidebar` (actual: `components/analytics/entity-graph/GraphSidebar`), `charts/token-economics/ActivityTimeline` (actual: `charts/file-activity/ActivityTimeline`), `charts/token-economics/SidechainUsage` (actual: `charts/file-activity/SidechainUsage`).
- 2 files listed with no formatters to consolidate: `pages/stats.tsx` (task003 stripped everything; now 52 LOC) and `components/board/project-card.tsx` (never had formatters).
- 6 files missed that have local `formatTokens`/`formatUsd`/`formatDate`: `charts/token-economics/CacheEfficiencyOverTime`, `TokenDestinationBreakdown`, `TokenUsageOverTime`, `ModelDistribution`, plus `components/board/board-task-card.tsx` and `board-side-panel.tsx` (both import `shortenModel` which also needs migration).
- Original contract put canonical in `client/src/lib/format.ts`, but `server/cli/report.ts` also has local formatter copies — `shared/format.ts` is the right home, with `client/src/lib/format.ts` as a re-export shim.
- `tests/board-session-card.test.ts:45-48` pins `shortenModel(...)` assertions that need migration to `shortModel` (already canonically tested in `tests/short-model.test.ts`).

**task005 drift:**
- Contract guessed server emits `ok|warning|error|unknown`. Actual: `server/scanner/session-analytics.ts:247` emits `good|fair|poor` for session health.
- Contract conflated THREE different health vocabularies that exist in the codebase and mean different things:
  1. `good|fair|poor` — session error rate (session-indicators, SessionRow, HealthDetails, SessionOverview, SessionDetail)
  2. `ok|warning|error|unknown` — service operational state (plugins-tab, mcps-tab, project-detail, force-graph)
  3. `healthy|warning|critical|unknown` — project-card aggregate (`project-card.tsx`)
  Only #1 is in scope. `project-card.tsx` must NOT be touched (it was in the original contract — incorrectly).
- Contract suggested `text-green-500/text-amber-500/text-red-500` colors. Existing test at `tests/session-list.test.ts:35-38` pins `bg-emerald-500/bg-amber-500/bg-red-500/bg-muted-foreground/30` — canonical must match.
- Contract missed that `HealthDetails.tsx`, `SessionOverview.tsx`, and `SessionDetail.tsx` use shadcn Badge variants (`default|secondary|destructive`), not Tailwind classes — need a third helper `sessionHealthBadgeVariant` in addition to `sessionHealthColor` and `sessionHealthLabel`.
- Module should be named `lib/session-health.ts` (not `lib/health.ts`) to prevent future contributors from dumping service-health or project-aggregate logic there.

### What the rewritten contracts say

- **task004 (`shared/format.ts`)**: 26 files in `filesTouch`, TDD-gated (`tests/format.test.ts` written red first), acceptance greps to catch regressions, `formatCostLabel` preserved in `session-indicators.tsx` (not part of canonical set), `shortenModel → shortModel` migration with `tests/board-session-card.test.ts` assertion cleanup.
- **task005 (`lib/session-health.ts`)**: 8 files in `filesTouch`, explicit pre-flight table documenting the 3 vocabularies and why 2 are out of scope, TDD-gated (`tests/session-health.test.ts` written red first), canonical colors pinned to `bg-emerald-500/bg-amber-500/bg-red-500/bg-muted-foreground/30` to match `tests/session-list.test.ts`, three helpers (`sessionHealthColor`, `sessionHealthLabel`, `sessionHealthBadgeVariant`), acceptance grep that explicitly verifies `project-card.tsx` was NOT modified.

Both contracts are `status: pending` and ready for `/work-task` to dispatch.

## What's still open

1. **User smoke test of Phase 1** — the user was smoke-testing affected routes (`/board`, `/sessions`, `/activity` redirects, `/projects` board, `/library?tab=agents`, `/analytics` with all 5 tabs) at session end. None of the three subagents could launch a dev server, so no automated UI verification happened. If any regression is found in Phase 1, fix before dispatching Phase 2.

2. **Phase 2 dispatch** — task004 and task005 are `parallelSafe: true`, touch different files, and can run concurrently under the 2-subagent cap. Dispatch plan:
   - Mark both `in_progress` in contract + TASK.md, bump `updated:` field
   - Dispatch task004 and task005 subagents in a single message (parallel)
   - Each has a TDD gate — test file written RED first, then implementation
   - Review gate between Phase 2 and Phase 3 per `feedback_honor_review_gates`

3. **Phase 3** (task006 server error handling, task007 structural/naming) — dependsOn Phase 2. Not yet pre-flighted. When Phase 2 wraps, repeat the pre-flight pattern against the original contracts before dispatching Phase 3.

4. **Phase 4** (task008 config + strict TS flags) — dependsOn Phase 3. Must run last because `noUnusedLocals`/`noUnusedParameters` can only pass after all dead code and duplication tasks are complete.

5. **Untracked audit docs** — `docs/audit-2026-04-13.md`, `docs/codex-cold-audit-2026-04-13.md`, `docs/cold-audit-2026-04-13.md` are in the working tree but not committed. They're the source material Phase 1–4 contracts were derived from. Decision on whether to commit them or leave untracked can wait until milestone wrap-up.

6. **Milestone wrap-up** — when all 8 tasks are done:
   - Clear `status_override` in MILESTONE.md back to `null` so computed "done" takes over
   - Single PR for the whole `feature/codebase-cleanup` branch (or per-phase PRs if review load is heavy)
   - Deploy + push

## How to resume

Fresh session should:

1. `git checkout feature/codebase-cleanup` (already on it if resuming same devbox)
2. Read this handoff note
3. Read the two rewritten contracts: `.claude/roadmap/codebase-cleanup/codebase-cleanup-task004.md` and `codebase-cleanup-task005.md`
4. Confirm with user that Phase 1 smoke test was clean (or handle any regressions found)
5. Run `/work-task` → orchestrator will see Phase 2 pending with task004+task005 parallel-safe and propose parallel dispatch
6. On approval: mark both `in_progress`, cascade to TASK.md, bump `updated:` fields, dispatch both subagents in one message

Relevant memory context for the next session:
- `feedback_preflight_contracts.md` — pre-flight audit-derived contracts before dispatching
- `feedback_workflow_cascade_rules.md` — workflow-framework cascade discipline
- `feedback_parallel_dispatch_collisions.md` — cap at 2, watch for file overlap in `filesTouch`
- `feedback_honor_review_gates.md` — stop between phases, don't chain without approval
- `project_workflow_framework_integration.md` — cross-project integration contract
