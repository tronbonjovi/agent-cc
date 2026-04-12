# Session Hierarchy — task006 Handoff (Phase 4 complete)

## Status

`session-hierarchy` milestone: **5/6 tasks complete**. Phases 1-4 done. Only task006 (Phase 5 — route opt-in via `?include=tree`) remains. After it lands, the milestone closes with a `scripts/deploy.sh` smoke test per the milestone's deploy gate.

| Task | Status | Phase |
|---|---|---|
| task001 — Types + `issuedByAssistantUuid` parser fix | **completed** | 1 |
| task002 — Subagent discovery module | **completed** | 1 |
| task003 — SessionTree builder | **completed** | 2 |
| task004 — Cache stores tree alongside parsed | **completed** | 3 |
| task005 — Scanner wiring + integration test + fixture | **completed** | 4 |
| task006 — Sessions route opt-in tree via `?include=tree` | pending | 5 |

## Where the work lives

All work is on branch **`feature/session-hierarchy`** in worktree **`.worktrees/session-hierarchy/`**. Commits ahead of `main` (not yet pushed at the time this note was written — check `git log` before assuming):

- `0b781ed` — feat: types + `issuedByAssistantUuid` parser fix (task001)
- `0484fdb` — feat: subagent discovery module (task002)
- `b12a6d6` — fix: `node:` prefix on built-in imports (review follow-up)
- `091c9b7` — feat: SessionTree builder with three-tier linkage (task003)
- `49c2312` — feat: cache stores tree alongside parsed (task004)
- `fec1849` — feat: scanner wiring + integration test + fixture (task005)
- `98112a7` — fix: parseSession comment + `subagent-parse-failed` integration case (task005 review follow-up)

Branch is 6 commits ahead of `main`. Phase 1-4 work has not deployed yet — **deploy gate is task006**, which the contract requires `scripts/deploy.sh` to run clean against.

## What task005 shipped (2026-04-12)

- **Scanner wiring.** `parseSessionAndBuildTree(parentFilePath, projectKey)` in `server/scanner/session-scanner.ts` is the single "teach the cache about a session" entry point. Parses parent → discovers subagents → parses each → builds `SessionTree` → atomic `cache.setEntry(parsed, tree)`. The existing per-file scanner worker now goes through this helper. A cache-hit fast path (via `getOrParse` + `getTreeByPath`) keeps repeat scans of unchanged sessions O(1).
- **Parser gap fix.** `ToolResult.agentId: string | null` is lifted from `record.toolUseResult.agentId`. The builder's tier-1 check is now an exact match on that field — it was previously a substring scan of `user.textPreview`, which is always empty for real-world tool_result-only user records. Real-data tier-1 linkage now works.
- **Builder tier-1 rename.** `findToolResultText` → `findToolResultAgentId`. Six existing builder unit tests migrated to stash agentId on the ToolResult instead of in `textPreview`.
- **`SubagentInput.parsed` widened to nullable** so a failed subagent parse flows through as `{ parsed: null, meta }` and surfaces `subagent-parse-failed` instead of silently vanishing.
- **Fixture.** `tests/fixtures/session-hierarchy/` — fully synthetic, hand-written from scratch. 16-record parent.jsonl + 5 subagent JSONLs × 4 records + 5 meta files + README. Nothing was copied from any real session. All tier-1 linkage clean, non-zero subagent cost.
- **Integration test.** `tests/session-tree-integration.test.ts` — 9 cases round-tripping the fixture through parser → discovery → builder → cache. Covers the happy path (5 subagents, tier-1 linkage, rollup > self-cost, `nodesById` completeness, empty warnings), the zero-subagent parity case, missing-parent-returns-null, and a `subagent-parse-failed` surfacing case.
- **Read-only review pass** via `feature-dev:code-reviewer`. Verdict: **PASS**. Two minor nits fixed in follow-up commit `98112a7`.

## Verification gates (last green run in the worktree)

- `npm run check` → exit 0
- `npm test` (full suite) → **126 files, 4388 / 4388** tests passing
- Per-file:
  - `tests/session-tree-integration.test.ts` → 9/9 (new)
  - `tests/session-parser.test.ts` → 47/47 (45 existing + 2 new `agentId` cases)
  - `tests/session-tree-builder.test.ts` → 16/16
  - `tests/session-cache.test.ts` → 11/11
  - `tests/subagent-discovery.test.ts` → 8/8
  - `tests/new-user-safety.test.ts` → 2470/2470

## Sandbox blocker — still relevant for task006

Subagents spawned via the `Agent` tool **cannot write to the worktree subtree**, but can read it fine for review passes. Task006 must be implemented in the main agent loop too — no dispatching implementation work to a subagent. Read-only review can still dispatch `feature-dev:code-reviewer` at the end.

## How to resume — task006 (route opt-in via `?include=tree`)

Start a fresh session in the worktree (`.worktrees/session-hierarchy/`) and run:

```
/work-task
```

`work-task` will pick up `session-hierarchy` as the active milestone and present task006 as next. Read the contract at `.claude/roadmap/session-hierarchy/session-hierarchy-task006.md` for the full instructions, tests, and acceptance criteria.

**Rough shape of task006 (verify against the contract before coding):**

- Add `?include=tree` query parameter support to the sessions route (likely `server/routes/sessions.ts` — check the contract for the exact endpoint).
- When the parameter is present, include the cached `SessionTree` in the response body alongside the existing session payload. When absent, return the existing shape unchanged — **this must be strictly additive, no breaking changes to existing consumers**.
- The tree lives in the cache already (task004/005). Fetch it via `sessionParseCache.getTreeById(sessionId)` or `getTreeByPath(filePath)`.
- `SessionTree.nodesById` and `subagentsByAgentId` are `Map` objects — you'll need to serialize them to plain objects or arrays for JSON transport. Pick whatever the contract asks for; if the contract is silent, arrays are usually the better wire format than object-keyed dicts.
- Tests: add route-level coverage proving `?include=tree` adds the tree, default response is unchanged, and tree serialization round-trips correctly.

## After task006

- Mark task006 completed in `.claude/roadmap/session-hierarchy/session-hierarchy-task006.md` + cascade to `TASK.md`.
- Milestone status derivation: all 6 tasks completed → milestone `review` → wrap-up skill will archive it to ARCHIVE.md.
- Run `scripts/deploy.sh` per the milestone's deploy gate. Verify the sessions route responds with the tree under the new query parameter.
- Push `feature/session-hierarchy`, open a PR against main.

## Spec reference

- **Spec:** `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` — the authoritative design doc. Section on "Route opt-in" covers task006's wire format.
- **Milestone:** `.claude/roadmap/session-hierarchy/MILESTONE.md` (in the main working tree, not the worktree — `.claude/` is gitignored).

## filesTouch (from task006 contract — verify before coding)

- `server/routes/sessions.ts`
- `tests/sessions-route-tree.test.ts` (or whatever the contract specifies)
- Possibly `shared/types.ts` if the wire response type needs extending.
