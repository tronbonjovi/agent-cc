---
date: 2026-04-13
topic: codebase-cleanup Phase 4 dispatch (final task)
milestone: codebase-cleanup
branch: feature/codebase-cleanup
phase: 4 of 4
---

# Handoff — codebase-cleanup Phase 4 (task008)

## Context

Milestone `codebase-cleanup` is 7/8 tasks done. Phase 1 (dead code, 3 tasks), Phase 2 (consolidation, 2 tasks), and Phase 3 (server/structural, 2 tasks) are all complete and committed on `feature/codebase-cleanup`. Branch is NOT pushed. Phase 4 is a single task — `task008` — config cleanup + test audit + strict TS flags. It's the last task in the milestone.

A fresh session should start here, dispatch task008, and wrap the milestone.

## What's done

Seven commits on `feature/codebase-cleanup` (most recent last):

Phase 1:
- `6bedbf8 refactor: delete dead pages and orphan imports — codebase-cleanup-task001`
- `01357fd refactor: split session-analytics-panel into live panels — codebase-cleanup-task002`
- `a742548 refactor: delete remaining dead files and dead code — codebase-cleanup-task003`

Phase 2:
- `13088d6 refactor: consolidate formatters into shared/format.ts — codebase-cleanup-task004`
- `e9f1f20 refactor: consolidate session health mapping into lib/session-health.ts — codebase-cleanup-task005`

Phase 3:
- `2fec969 refactor: structural and naming fixes — codebase-cleanup-task007`
- `b9da1ba refactor: standardize server error handling with handleRouteError — codebase-cleanup-task006`

Plus the Phase 3 wrap commit (not yet created — produced in this handoff session).

Test suite: **5,553 tests across 152 files**, `npm run check` clean, pre-commit safety hook passes.

## Phase 3 user-visible changes (smoke test surface — optional)

Phase 3 is mostly non-visual. The two concrete user-visible changes:

1. **Error responses now use `{error, detail?}` shape** across the entire API surface (400/403/404/409/500/502/503). The client's React Query hooks read `err.message` from the thrown Error, and `client/src/lib/queryClient.ts:12` dumps the raw response body into that message, so toasts will show `"<status>: {"error":"..."}"` instead of `"<status>: {"message":"..."}"`. Minor cosmetic shift in toast text on error paths.
2. **Board token counts** already had the `.0` suffix from Phase 2. No further visual change in Phase 3.

Smoke test is not strictly required before dispatching task008. If the user wants one, test routes: trigger a validation error (e.g., DELETE with invalid UUID), trigger a 404 (hit `/api/nonexistent`), confirm toast text uses `error:` instead of `message:`.

## Workflow-framework state

- **MILESTONE.md**: `status_override: in_progress` (still needed — task008 remains).
- **TASK.md**: task001–007 `completed`, task008 `pending`.
- **Task contract frontmatter**: task006/007 both `status: completed`. task008 still `pending` and **has NOT been pre-flighted**, but per `feedback_preflight_contracts` (rewritten this session) the correct approach is to trust the plan and dispatch — not run a pre-flight ritual. The audit doc (`docs/audit-2026-04-13.md`) was corrected for numeric errors during Phase 3 wrap, so task008's audit-derived content is now reconciled against the current tree for the items in its scope.

## Phase 4 — task008 single task

`.claude/roadmap/codebase-cleanup/codebase-cleanup-task008.md` is the full contract. Three threads bundled into one complex task:

### Part 1: Config cleanup (pure deletion — low risk)
- Delete `.github/workflows/release.yml` (triggers on v* tags, package.json is private)
- Delete `.github/workflows/scorecard.yml` (OSSF Scorecard is for public repos)
- Delete `scripts/load-test-tasks.sh` and `scripts/clear-test-tasks.sh` (reference removed pipeline feature, use stale `.claude/tasks/` path)
- Delete `.update-prefs.json` (orphan config from deleted auto-updater)
- Fix orphan `/api/tasks` cache key in `client/src/lib/queryClient.ts:4` (no backend match)

### Part 2: Test audit (requires judgment)
- Diff suspected duplicate pairs: `sessions-tab.test.ts` vs `sessions-tabs.test.ts`, `library-tab-migration.test.ts` vs `library-tabs-migration.test.ts`
- Audit `library-*.test.ts` (13 files from multiple iterations) for tests pinning deleted surfaces
- Audit `analytics-*.test.ts` similarly
- Evaluate `phase1-fixes.test.ts` — if it pins rewritten early-iteration behavior, delete; if it asserts meaningful invariants, keep
- Sweep for tests that reference dead files — `git grep -l "health-indicator\|board-filters\|session-analytics-panel" tests/` should be empty after Phase 1 deletions
- **Err on keeping tests when uncertain.** Report findings in task notes.

### Part 3: Strict TS flags (incremental)
- Run diagnostic pass: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | tee /tmp/strict-ts.log`
- If manageable (<100 diagnostics), fix directly. If large (>500), split: `noUnusedLocals` first, `noUnusedParameters` in a follow-up. Do NOT disable the flags to bypass failures.
- Prefix unused parameters required by interface/callback signatures with `_`, delete genuinely unused locals/imports
- No `// @ts-ignore` or `eslint-disable` escape hatches
- Enable both flags in `tsconfig.json` once clean
- Verify `npm run check` + `npm run build` pass

**Dependencies:** task008 `dependsOn` task006 + task007. Both complete. task008 runs last because strict flags can only pass after all dead-code/duplication work is done.

**Parallel:** `parallelSafe: false`. Single sequential subagent.

## Scope carve-outs for task008

Things the subagent should NOT delete, even though they look similar:
- `useScannerStatus` in `client/src/hooks/use-scanner.ts` — confirmed dead code during task007, but flagged as out of scope. task008 is allowed to delete it if the strict TS pass surfaces it naturally, OR can leave it for a follow-up.
- `.github/workflows/ci.yml`, `codeql.yml`, `dependency-review.yml` — keep these, they're actively used.
- Any test that fails the diff-duplicate-pair check but has meaningful unique assertions — keep.

## How to resume

Fresh session should:

1. `git checkout feature/codebase-cleanup` (already on it if same devbox)
2. Read this handoff note
3. Ask the user whether to smoke-test Phase 3 first (optional — the `{error}` shape change is cosmetic-only and well-tested)
4. Read `.claude/roadmap/codebase-cleanup/codebase-cleanup-task008.md` — the contract is complete as-written, no rewrites needed
5. Run `/work-task` → propose task008 dispatch
6. On approval: cascade `in_progress` status (task008 file + TASK.md), dispatch subagent
7. After subagent reports: spawn reviewer, on pass mark `completed`, cascade
8. **Milestone wrap:** clear `status_override: in_progress` back to `null` in MILESTONE.md, update CHANGELOG with task008 entry, update CLAUDE.md test count if changed, deploy via `scripts/deploy.sh`, push the whole branch, open a single PR for `feature/codebase-cleanup` (7 commits + 2 wrap commits, or split per-phase if review load is heavy).

## Housekeeping still pending

- **Untracked audit docs** — `docs/audit-2026-04-13.md`, `docs/codex-cold-audit-2026-04-13.md`, `docs/cold-audit-2026-04-13.md` will be committed in this Phase 3 wrap commit. No further action needed after that.
- **Old handoff notes** — this file (`2026-04-13-codebase-cleanup-phase4.md`) should be deleted in the milestone wrap commit after task008 ships.

Relevant memory context:
- `feedback_preflight_contracts.md` — **rewritten this session**. Trust the plan at dispatch, don't pre-flight per task as ritual.
- `feedback_workflow_cascade_rules.md` — workflow-framework cascade discipline
- `feedback_honor_review_gates.md` — stop at every review gate
- `project_workflow_framework_integration.md` — cross-project integration contract
