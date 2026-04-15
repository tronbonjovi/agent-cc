# Scanner-ingester late-flight handoff (2026-04-15, end of day — task007 closed)

## Where we are

Milestone 5 (`scanner-ingester`) is **7/8 complete** on branch `feature/scanner-ingester`. Branch is NOT merged to `main` and NOT yet pushed to origin. Phase 4 (parity gate) closed this session.

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
733560a task007 — parity gate: listSessions + getStats + getSessionById + coverage guard
```

Tests: 5937 passing across 174 files. Parity test file grew from 10 → 19 cases. Typecheck clean. Pre-commit safety hook green.

## What's next

Phase 5 — **Cutover (solo, gated):**
- **task008** — Promote `SCANNER_BACKEND=store` to default and retire legacy. Dependencies: task007 (done). Flips the env-var default, deletes `server/scanner/backend-legacy.ts`, removes the factory's legacy branch, and cleans up any legacy-only helpers that become unreachable. **Manual smoke test required before legacy deletion** — exercise Sessions, Messages, Costs pages on `acc.devbox` against real user data before the legacy code paths go. The smoke test is not ceremony — it's the gate that the parity test can't fully cover (parity runs on synthetic fixtures, smoke runs on the user's real JSONL corpus).

After Phase 5:
- Merge `feature/scanner-ingester` → `main` via PR (10 commits)
- Deploy the cutover via `scripts/deploy.sh`
- Verify the store backend is serving real data on `acc.devbox`

## How to resume next session

1. Open a fresh session in `~/dev/projects/agent-cc`
2. Confirm you're on `feature/scanner-ingester` (`git status`). Branch should be 1 commit ahead of origin (`733560a` — task007) unless it's been pushed separately.
3. Run `/work-task scanner-ingester` — the orchestrator should present task008 as the only remaining ready task.
4. Read this handoff + the project memory (`project_scanner_ingester_progress.md`) before dispatching.
5. **Task008 contract validation:** same pattern as task006 and task007 — validate the contract against real file paths at dispatch time before spinning up a subagent. Two of the last three contracts in this milestone had landmines that needed in-session rewrites. Do the same pre-flight check on task008.
6. **Plan the smoke test checklist with the user before dispatching** — don't offer it as a suggestion, do it as the dispatch precondition. The checklist should cover each route that flips behavior: Sessions list, a specific session's messages tab, Costs tab overview, per-session cost drill-down, dashboard AI-vs-deterministic card. Smoke test runs on the user's real data, so it happens during or right after task008's subagent lands the cutover and before the legacy deletion lands.

## Things to remember

- **Branch discipline:** stay on `feature/scanner-ingester`. Do not merge to main until task008's smoke test passes.
- **Honor review gates:** stop after task008's cutover lands and before the legacy-deletion commit is made for the manual smoke. Don't let the subagent chain the flip + deletion without a pause.
- **Parity is closed, not perfect:** six documented gap groups are explicitly skipped by `pickComparable()` and the parity test header. Task008's smoke is how we catch anything those gaps actually matter for in production.
- **Task008 may surface a new gap:** if the real-data smoke test uncovers a field divergence the synthetic fixtures didn't catch, STOP, close the gap in the store backend OR document it as a new skip, and re-run the parity test before proceeding. Don't let the cutover ship with a known regression.
- **Deploy pending:** previous session's task005 + task006 changes (`3f167e4` + `d682723`) plus this session's task007 test-only change all still need `sudo systemctl restart agent-cc` on `acc.devbox`. Task007 alone doesn't require a deploy (it's test-only), but task005/006 backend/UI changes do. Task008's smoke test is the natural moment to deploy everything since it runs against the restarted service.
- **Task contract hygiene:** task006 had four landmines, task007 had four landmines — both rewritten in-session before dispatch. Assume task008's original contract has drift too, especially around "delete these files" lists (files get renamed mid-milestone).

## Files most relevant to task008

- `server/scanner/backend.ts` — `getScannerBackend()` factory, change the default from `legacy` to `store`
- `server/scanner/backend-legacy.ts` — full file deletion after smoke passes
- `server/scanner/backend-store.ts` — remove the "default stays legacy until task008" language in the module header, tighten any gap notes
- `CLAUDE.md` — `SCANNER_BACKEND` env var table row — update the default
- `tests/scanner-backend.test.ts` — update the "default selection" test from `legacy` → `store`
- `tests/scanner-backend-parity.test.ts` — parity test stays; six documented gaps stay; coverage guard stays. Any new gap surfaced by smoke should land a new skip + header entry here.
- `scripts/deploy.sh` — the deploy mechanism. Smoke test happens against the restarted service.
- `.claude/roadmap/scanner-ingester/scanner-ingester-task008.md` — the contract to validate and possibly rewrite at dispatch time.
