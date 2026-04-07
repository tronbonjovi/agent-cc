# Kanban Board — Continue Review & Merge

## Context

The human-first centralized kanban board is implemented on `feat/pipeline-kanban-ui`. 14 tasks completed via subagent-driven development, followed by 7 rounds of Codex adversarial review with 16 bugs caught and fixed.

## What's Done

- Full backend: types, aggregator, validator, event bus, API routes, ingest parser
- Full frontend: hooks, board page, filters, cards, side panel
- Integration: pipeline freeze guard, stage fallback, column name mapping
- 2406 tests passing, TypeScript clean, safety tests pass

## What's Open

- **Codex review round 7** was in progress when session ended — check results, fix any real bugs
- **PR not yet created** — branch is ready, push and create PR
- **Deploy** — after merge, run `scripts/deploy.sh`
- **Pre-existing issues flagged by Codex** (not blockers, but worth tracking):
  - `use-pipeline.ts` SSE has no reconnect (same pattern as board had, now fixed for board)
  - `pipeline-board.tsx` orphan tasks always render in backlog regardless of stage
  - Milestone approval gating ignores blocked tasks in unmapped row

## How to Resume

```
Read docs/handoff/2026-04-07-kanban-board-review.md — continue Codex review rounds on the kanban board branch, fix real bugs, then create PR and deploy.
```
