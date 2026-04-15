# Scanner-ingester mid-flight handoff (2026-04-15)

## Where we are

Milestone 5 (`scanner-ingester`) is **4/8 complete** on branch `feature/scanner-ingester`. Branch is NOT merged to `main`.

```
f226d16 task001 — JSONL→InteractionEvent mapper
8b9f319 task001 — parentEventId two-pass fix (review)
4783580 task002 — ingester service (tail + upsert + sidechains)
d58b23d task002 — sweep: shared INSERT_EVENT_SQL + real EXTRA_PROJECT_DIRS test
b714c3b task003 — dual-path backend (IScannerBackend + SCANNER_BACKEND flag)
044fd7f task004 — backend-store implements analytics methods (parity)
096d6a4 task004 — sweep: bounded queries in getCostSummary + tighter parity test isolation
```

Tests: 5895 passing across 173 files. Typecheck clean. Pre-commit safety hook green.

## What's next

Phase 3 — Cost + dashboard:
- **task005** — Cost indexer gains `bySource` dimension (standard, files: `server/scanner/cost-indexer.ts`)
- **task006** — AI vs deterministic cost card (standard, frontend dashboard component, depends on task005's API shape)

TASK.md flags these as "stagger or run sequentially" — task006 depends on task005's API surface. Same pattern as Phase 2 (task003 → task004).

After Phase 3:
- Phase 4 — **task007** parity gate runner (non-negotiable before promotion). Should grep for `backend-store: parity gap` markers — currently zero stubs remain after task004, so the runner becomes a fixture-vs-fixture parity sweep over the full `IScannerBackend` surface, modeled on `tests/scanner-backend-parity.test.ts`.
- Phase 5 — **task008** promote `SCANNER_BACKEND=store` to default + retire legacy code paths. Manual smoke required before deletion.

## How to resume next session

1. Open a fresh session in `~/dev/projects/agent-cc`
2. Confirm you're on `feature/scanner-ingester` (`git status`)
3. Run `/work-task scanner-ingester` — the orchestrator should present task005 as the next ready task
4. Read this handoff and the project memory (`project_scanner_ingester_progress.md`) before dispatching
5. Sequential dispatch: task005 first, then task006 after review

## Things to remember

- **Branch discipline:** stay on `feature/scanner-ingester`. Do not merge to main until task008.
- **Honor review gates:** stop after each task for reviewer + user approval before dispatching the next.
- **Sweep pattern:** non-blocking review nits get fixed in a small sweep commit before moving on, same as task002 + task004 sweeps.
- **Parity is non-negotiable:** task007 is the gate before task008. Don't skip it.
- **Six documented parity gaps** exist between legacy and store (see `backend-store.ts` module header + `tests/scanner-backend-parity.test.ts` header). They're tracked, not faked. Task007's runner should explicitly skip those fields, not assert equality on them.
- **Deploy still pending from prior session:** `sudo systemctl restart agent-cc` was needed to pick up the optimistic-echo change from `5526705` (2026-04-15 wrap-up). If this wrap-up's deploy runs, that gets picked up too.

## Files most relevant to task005/006

- `server/scanner/cost-indexer.ts` — legacy cost indexer (the one task005 adds `bySource` to)
- `server/scanner/event-reductions.ts` — pure reducers from task004; task005 likely extends `reduceCostSummary` / `reduceSessionCost` with source dimension
- `shared/types.ts` — `CostSummary`, `SessionCostData` types (will need new `bySource` field)
- `client/src/components/dashboard/` — task006's dashboard card lives here
- `tests/scanner-backend-parity.test.ts` — parity test pattern to extend for new methods
