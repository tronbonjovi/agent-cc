---
date: 2026-04-13
topic: codebase-cleanup Phase 3 pre-flight + dispatch
milestone: codebase-cleanup
branch: feature/codebase-cleanup
phase: 3 of 4
---

# Handoff — codebase-cleanup Phase 3

## Context

Milestone `codebase-cleanup` is 5/8 tasks done. Phase 1 (dead code, 3 tasks) and Phase 2 (consolidation, 2 tasks) are complete and committed on `feature/codebase-cleanup`. Branch is NOT pushed. Phase 3 has task006 (server error handling) and task007 (structural/naming), both still `pending`, both still need pre-flight against the original audit docs.

A fresh session should start here to pre-flight and dispatch Phase 3.

## What's done

Five commits on `feature/codebase-cleanup`:

Phase 1:
- `6bedbf8 refactor: delete dead pages and orphan imports — codebase-cleanup-task001`
- `01357fd refactor: split session-analytics-panel into live panels — codebase-cleanup-task002`
- `a742548 refactor: delete remaining dead files and dead code — codebase-cleanup-task003`

Phase 2:
- `13088d6 refactor: consolidate formatters into shared/format.ts — codebase-cleanup-task004`
- `e9f1f20 refactor: consolidate session health mapping into lib/session-health.ts — codebase-cleanup-task005`

Test suite: **5,521 tests across 151 files**, `npm run check` clean, pre-commit safety hook passes.

## Phase 2 user-visible changes (smoke test surface)

Before dispatching Phase 3, the user may want to smoke-test Phase 2's display deltas in the browser. None of the subagents launched a dev server, so no automated UI verification happened. Expected changes:

1. **Board token counts** render with trailing `.0` on round-thousand values (e.g. `50000 → "50.0K"`, not `"50k"`). Canonical `formatTokens` uses `.toFixed(1)` across all tiers for consistency. If visually undesirable, one-line tweak in `shared/format.ts`.
2. **"good" session health dots** go from green-500 → emerald-500 (slightly cooler green). Test-pinned.
3. **Null + active session dots** go from green-500 → muted-foreground/30. Null now means "unknown" everywhere, not "assumed good." Real semantic shift — if user wants active+null to stay green, special-case in `session-indicators.tsx`.
4. **"fair" session tooltip** reads `"Active — some issues"` instead of `"Active — moderate issues"`.

Smoke test routes: `/projects` (board), `/analytics?tab=costs` (costs tab with all 5 sections), `/analytics?tab=charts` (all 5 chart sections), `/analytics?tab=sessions` (session list + detail with HealthDetails / SessionOverview / SessionDetail).

## Workflow-framework state

- **MILESTONE.md**: `status_override: in_progress` (still needed — 3/8 tasks remain).
- **TASK.md**: task001-005 `completed`, task006-008 `pending`.
- **Task contract frontmatter**: task004 and task005 both `status: completed`. task006/007/008 still `pending` with original audit-derived content — NOT pre-flighted.

## Phase 3 tasks — need pre-flight before dispatch

Same pattern as Phase 2: the original Phase 3 contracts were written from three audit docs (`docs/audit-2026-04-13.md`, `docs/codex-cold-audit-2026-04-13.md`, `docs/cold-audit-2026-04-13.md` — still untracked in the working tree). Before dispatching, verify each contract against the actual codebase state, which has shifted significantly after Phase 1+2:

- **task006 — server error handling with `handleRouteError` helper** — audit claimed N routes had divergent error handling. Verify the actual count, the actual divergent patterns, and whether `handleRouteError` should live in `server/lib/` or elsewhere. Check which routes are on new paths after Phase 1 deletions. Check whether any Phase 2 consolidation work (shared/format.ts) affects the helper's dependencies.

- **task007 — structural and naming fixes** — audit listed specific file renames, misplaced modules, and inconsistent naming. Many of these files were deleted in Phase 1 or moved in Phase 2. Expect significant drift. Likely needs contract rewrite in place (same as task004/005 got).

Both tasks are `parallelSafe: true` in TASK.md and touch different files (server/ vs. client/ and shared/). If pre-flight confirms no file overlap, they can run in parallel. If there IS overlap after Phase 1+2 drift, dispatch sequentially per `feedback_parallel_dispatch_collisions`.

## Phase 4 (task008) — still out in front

- **task008 — config cleanup, test audit, and strict TS flags** — dependsOn task006 + task007. Must run last because `noUnusedLocals` / `noUnusedParameters` can only pass after all prior dead-code and duplication tasks are done. Do NOT dispatch until Phase 3 review gate is cleared.

## Housekeeping still pending

- **Untracked audit docs** — `docs/audit-2026-04-13.md`, `docs/codex-cold-audit-2026-04-13.md`, `docs/cold-audit-2026-04-13.md` still in working tree, not committed. Decision on whether to commit them or leave untracked can wait until milestone wrap-up.
- **Old handoff note** — `docs/handoff/2026-04-13-codebase-cleanup-phase2.md` is now resolved (Phase 2 shipped) and should be deleted in the same commit that creates this Phase 3 handoff.
- **Milestone wrap-up** — when all 8 tasks are done: clear `status_override` in MILESTONE.md back to `null`, single PR for the whole `feature/codebase-cleanup` branch (or per-phase PRs if review load is heavy), deploy + push.

## How to resume

Fresh session should:

1. `git checkout feature/codebase-cleanup` (already on it if same devbox)
2. Read this handoff note
3. Ask the user whether to smoke-test Phase 2 first (see user-visible changes above) or go straight to Phase 3 pre-flight
4. Read task006 and task007 contracts at `.claude/roadmap/codebase-cleanup/`
5. Pre-flight each contract: grep/verify every file in `filesTouch` exists, check that the "current state" descriptions in the contract still match the codebase, check for file overlap between task006 and task007
6. If drift is significant, rewrite the affected contract in place (same pattern as task004/005)
7. Run `/work-task` → propose dispatch plan (parallel vs sequential) based on pre-flight findings
8. On approval: mark both `in_progress`, cascade to TASK.md, bump `updated:` fields, dispatch
9. Stop at the Phase 3 → Phase 4 review gate per `feedback_honor_review_gates`

Relevant memory context:
- `feedback_preflight_contracts.md` — pre-flight audit-derived contracts before dispatching
- `feedback_workflow_cascade_rules.md` — workflow-framework cascade discipline
- `feedback_parallel_dispatch_collisions.md` — cap at 2, watch for file overlap
- `feedback_honor_review_gates.md` — stop between phases
- `project_workflow_framework_integration.md` — cross-project integration contract
