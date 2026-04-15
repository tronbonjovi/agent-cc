# Scanner-ingester mid-flight handoff (2026-04-15, end of day)

## Where we are

Milestone 5 (`scanner-ingester`) is **6/8 complete** on branch `feature/scanner-ingester`. Branch is NOT merged to `main`. Phase 3 (Cost + dashboard) closed this session.

```
f226d16 task001 — JSONL→InteractionEvent mapper
8b9f319 task001 — parentEventId two-pass fix (review)
4783580 task002 — ingester service (tail + upsert + sidechains)
d58b23d task002 — sweep: shared INSERT_EVENT_SQL + real EXTRA_PROJECT_DIRS test
b714c3b task003 — dual-path backend (IScannerBackend + SCANNER_BACKEND flag)
044fd7f task004 — backend-store implements analytics methods (parity)
096d6a4 task004 — sweep: bounded queries in getCostSummary + tighter parity test isolation
3f167e4 task005 — cost summary gains bySource dimension
d682723 task006 — countBySource + AI-vs-deterministic card
```

Tests: 5928 passing across 174 files. Typecheck clean. Pre-commit safety hook green.

## What's next

Phase 4 — Parity gate (**solo, non-negotiable**):
- **task007** — Scanner backend parity gate runner. Dependencies: task003 + task004 + task005 (all done). Runs a fixture-vs-fixture parity sweep across the full `IScannerBackend` surface comparing legacy vs store on the same source data. Six documented gaps must be explicitly skipped, not faked. Model on the existing `tests/scanner-backend-parity.test.ts` which already covers `getCostSummary` (including `bySource` + `countBySource` agreement) — task007 extends this pattern to every other backend method.

After Phase 4:
- Phase 5 — **task008** promote `SCANNER_BACKEND=store` to default + retire legacy code paths. Manual smoke required before deletion.

## How to resume next session

1. Open a fresh session in `~/dev/projects/agent-cc`
2. Confirm you're on `feature/scanner-ingester` (`git status`)
3. Run `/work-task scanner-ingester` — the orchestrator should present task007 as the next ready task
4. Read this handoff and the project memory (`project_scanner_ingester_progress.md`) before dispatching
5. Task007 is **solo** — no parallel dispatch. Honor the review gate after it completes before starting task008.

## Things to remember

- **Branch discipline:** stay on `feature/scanner-ingester`. Do not merge to main until task008.
- **Honor review gates:** stop after task007 for reviewer + user approval before dispatching task008 (the cutover).
- **Sweep pattern:** non-blocking review nits get fixed in a small sweep commit before moving on, same as task002 + task004 sweeps. No sweeps needed after task005 or task006.
- **Parity is non-negotiable:** task007 is the gate. Don't skip it. Don't loosen the assertions.
- **Six documented parity gaps** exist between legacy and store (see `backend-store.ts` module header + `tests/scanner-backend-parity.test.ts` header). They're tracked, not faked. Task007's runner should explicitly skip those fields, not assert equality on them.
- **Zero new parity gaps** were introduced by Phase 3 — task005 + task006 both passed strict parity review.
- **Task contract hygiene:** task006's original contract had four landmines (stale endpoint name, missing upstream field, vitest client exclusion ignored, assumed non-existent directory). Rewrote in-session before dispatch — documented in the task file's Notes section. Task007's contract should be validated against real file paths at dispatch time before spinning up a subagent.
- **Deploy pending:** this session's work needs `sudo systemctl restart agent-cc` to pick up the new dashboard card + backend changes on `acc.devbox`.

## Files most relevant to task007

- `tests/scanner-backend-parity.test.ts` — existing parity test pattern, now covers `getCostSummary` with `bySource` + `countBySource`. Task007's runner should extend this to every `IScannerBackend` method.
- `server/scanner/backend.ts` — `IScannerBackend` interface + `SCANNER_BACKEND_METHODS` array (the list task007 should iterate over)
- `server/scanner/backend-store.ts` — module header lists the six documented parity gaps
- `server/scanner/backend-legacy.ts` — pure delegation to legacy helpers
- `server/scanner/event-reductions.ts` — pure reducers backing the store; covered by reducer tests in `tests/cost-indexer.test.ts`
- `tests/fixtures/jsonl-samples/` — synthetic JSONL fixtures from task001; reuse these for the parity runner
