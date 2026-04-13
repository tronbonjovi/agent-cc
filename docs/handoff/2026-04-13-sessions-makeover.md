# Handoff — Sessions Makeover

**Date:** 2026-04-13
**Status:** Spec + plan + roadmap complete; execution starts next session.

## Context

User reviewed the Sessions tab and flagged broken Overview metrics (Cost / Cache Hit / Sidechains all 0/-), a clunky Tool Timeline, Token Breakdown bugs (`sA` role, model always Opus 4.6, no scroll constraint), and confusing/dead sections (File Impact, Health Details, Lifecycle Events). Goal: rebuild Sessions detail to mirror the Messages tab's granularity and structure.

## What was done this session

1. **Diagnosed the Overview metrics bug end-to-end.** Root cause is architectural: `SessionOverview` is a dumb prop-receiver waiting on an upstream enricher that was never built. `SessionsTab.tsx:42` hardcodes `costUsd: 0` and never sets cache fields. Sidechain count reads a flat counter that misses sidechain JSONL files. Fix: self-compute from `parsed` + `tree` (the data is already in scope).
2. **Wrote the design spec** at `docs/superpowers/specs/2026-04-13-sessions-makeover-design.md` (commit `05e8632`). Includes the full root-cause diagnosis with file:line refs.
3. **Wrote the implementation plan** at `docs/superpowers/plans/2026-04-13-sessions-makeover.md` (commit `0e8ecc5`). 4-PR build sequence, 16 TDD-style tasks with literal code (no placeholders).
4. **Built the workflow-framework roadmap** at `.claude/roadmap/sessions-makeover/`. Consolidated the plan's 16 tasks into 9 dispatch contracts across 4 phases (one phase per PR). MILESTONE.md, ROADMAP.md, TASK.md updated.

## Source-of-truth layout

- **Spec** — `docs/superpowers/specs/2026-04-13-sessions-makeover-design.md` (committed)
- **Plan** — `docs/superpowers/plans/2026-04-13-sessions-makeover.md` (committed) — has all the literal code, file:line edits, and TDD step ordering
- **Roadmap** — `.claude/roadmap/sessions-makeover/` (gitignored, local) — task contracts that point at the plan rather than duplicating code

## Phase plan

| Phase | PR branch | Tasks | Goal |
|---|---|---|---|
| 1 | `feature/sessions-makeover-pr1-bugfixes` | task001, task002, task003 | Fix Overview metrics + TokenBreakdown bugs (visible improvement first deploy) |
| 2 | `feature/sessions-makeover-pr2-layout` | task004, task005, task006 | SessionFilterBar + filter-pill-driven sections + clean SessionList |
| 3 | `feature/sessions-makeover-pr3-tool-timeline` | task007 | Replace bespoke ToolTimeline with Messages-registry wrapper |
| 4 | `feature/sessions-makeover-pr4-cleanup` | task008, task009 | Activity row salvage + delete dead section files |

## How to resume

1. Start a fresh session in `/home/tron/dev/projects/agent-cc`
2. Run `/work-task` — it will read the roadmap and recommend `sessions-makeover-task001` as the next dispatch
3. Branch first: `git checkout -b feature/sessions-makeover-pr1-bugfixes` before any task001 work (`feedback_branch_before_work` rule)
4. Each task contract points at the plan section with the literal code — subagents should follow the plan verbatim for steps and code blocks

## Open threads

None. Spec, plan, and roadmap are all complete and internally consistent. The only thing waiting is execution.

## Notes for execution

- **Review gates between phases** — stop after each PR for user confirmation. Do not chain phases (`feedback_honor_review_gates`).
- **Parallel dispatch cap** — max 2 concurrent subagents (`feedback_parallel_dispatch_collisions`).
- **Workflow cascade** — every task transition must update both the contract frontmatter AND TASK.md. The pre-existing `codebase-cleanup-*` tasks model the pattern.
- **PR1 bug fix verification** — after task002 lands, manually open `/analytics?tab=sessions` and pick a session that ran subagents. Cost / Cache Hit / Sidechains should all show real values, not 0/-. That's the first user-visible win.
