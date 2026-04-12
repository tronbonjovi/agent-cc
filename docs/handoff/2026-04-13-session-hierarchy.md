# Session Hierarchy — 2026-04-13 Handoff (Phases 1–3 complete)

## Status

`session-hierarchy` milestone: **4/6 tasks complete**. Phases 1, 2, and 3 done. Resume at task005 (Phase 4 — scanner wiring + end-to-end integration test).

| Task | Status | Phase |
|---|---|---|
| task001 — Types + `issuedByAssistantUuid` parser fix | **completed** | 1 |
| task002 — Subagent discovery module | **completed** | 1 |
| task003 — SessionTree builder | **completed** | 2 |
| task004 — Cache stores tree alongside parsed | **completed** | 3 |
| task005 — Scanner wiring + integration test (PII-scrubbed fixture) | **pending** | 4 |
| task006 — Route opt-in via `?include=tree` | pending | 5 |

## Where the work lives

All work is on branch **`feature/session-hierarchy`** in worktree **`.worktrees/session-hierarchy/`**. Commits ahead of `main` (pushed to origin):

- `0b781ed` — feat: SessionTree types and `issuedByAssistantUuid` linkage (task001)
- `0484fdb` — feat: subagent discovery module (task002)
- `b12a6d6` — fix: `node:` prefix on built-in imports (review)
- `091c9b7` — feat: SessionTree builder with three-tier subagent linkage (task003)
- `49c2312` — feat: cache stores SessionTree alongside ParsedSession (task004)

`main` is unchanged from `b03d0e1` except for changelog/handoff docs in this session. Phases 1–3 have not deployed because the feature work hasn't merged. **Deploy gate is task006**, which the contract requires `scripts/deploy.sh` to run clean against.

## What was done this session (2026-04-13)

- **task003 (TDD).** New file `server/scanner/session-tree-builder.ts` exports `buildSessionTree(parent, subagents): SessionTree`. Two-pass parent-tree handles out-of-order `parentUuid`; tool calls hang off the issuing assistant turn via `issuedByAssistantUuid`; strict three-tier subagent linkage (`agentid-in-result` → `timestamp-match` ≤10ms → `orphan`) with first-match-wins precedence; post-order rollup using `pricing.ts` (no duplicated tables); recursive in-tree build for each subagent's own messages and tool calls. Nested subagent discovery is intentionally skipped — emits `nested-subagent-skipped` warning. `orphan-user-turn` added to the `SessionTreeWarning` union to match the spec. 16 new tests covering all spec cases.
- **task004 (TDD).** Extended `SessionParseCache` with combined `{ parsed, tree }` entries. New `setEntry(filePath, parsed, tree)` for atomic population by the scanner, plus `getByPath`, `getTreeById`, `getTreeByPath` read accessors. Existing public API (`getOrParse`, `getById`, `getAll`, `invalidate*`, `size`) is byte-identical. Cache does not import `session-tree-builder.ts` — pure storage layer. 6 new cache tests; 5 existing unchanged.
- **Read-only review passes** by `feature-dev:code-reviewer` subagent on both tasks. Both verdicts: **PASS**, no fixes required. Reviewer verified strict tier precedence (task003) and atomic cache population (task004).

## Verification gates (last green run)

In the worktree:

- `npm run check` → exit 0
- `npm test` (full suite) → **125 files, 4377 / 4377** tests passing
- Per-file:
  - `tests/session-tree-builder.test.ts` → 16/16 (new)
  - `tests/session-cache.test.ts` → 11/11 (5 existing + 6 new)
  - `tests/session-parser.test.ts` → 45/45
  - `tests/subagent-discovery.test.ts` → 8/8
  - `tests/new-user-safety.test.ts` → 2462/2462

## Known sandbox blocker — relevant for task005

Subagents spawned via the `Agent` tool **cannot write to the worktree subtree** in this environment, even though they can read it fine for review passes. Tasks 001–004 were all implemented by the main agent directly. **task005 must be implemented in the main agent loop too.** TDD discipline still applies.

## How to resume — task005 (scanner wiring + integration test)

Start a fresh session and run:

```
/work-task
```

The work-task skill will pick up `session-hierarchy` as the active milestone and present task005 as next. The worktree at `.worktrees/session-hierarchy/` is already set up — do not recreate it. Branch `feature/session-hierarchy` is pushed and tracks origin.

**task005 is the largest task in the milestone.** The scanner wiring itself is small (~40 LOC in `server/scanner/session-scanner.ts`): after parsing each parent JSONL, call `discoverSubagents` → `parseSessionFile` per subagent → `buildSessionTree(parent, subagents)` → `cache.setEntry(filePath, parsed, tree)`. Sessions with no subagents flow through the same path (empty subagents array). Failed subagent parses become `{ parsed: null, meta: sub }` stubs and the builder emits `subagent-parse-failed`.

**The slow part is the fixture.** task005 requires anonymizing the real 5-subagent reference session (`d2570b3e-f3ce-41ee-a462-89f805bb2e9f`) into `tests/fixtures/session-hierarchy/`:

- `parent.jsonl` — 15–25 records: 2+ assistant turns with tool_use, 2+ user turns with tool_result, 5 `Agent` tool-calls
- `parent/subagents/agent-<id>.jsonl` × 5 — 3–8 records each, agentIds matching parent tool_result text so tier 1 succeeds
- `parent/subagents/agent-<id>.meta.json` × 5 — generic agentType + description
- `tests/fixtures/session-hierarchy/README.md` — provenance + invariants

**Every fixture edit must be followed by a `new-user-safety.test.ts` run.** The safety test is the PII guard. If it fails, fix the fixture — do not weaken the test. Watch for: real paths, real project names, real message content, encoded path keys (`C--Users-...`), phone/email patterns. Replace with `home/user/projects/demo`, `demo-project`, bland placeholder text. Keep structural fields (uuid, parentUuid, timestamp, role, usage, tool_use names, tool_result.callId) intact.

**Then write `tests/session-tree-integration.test.ts`** that creates a temp dir mirroring `.claude/projects/` layout, copies the fixture in, invokes the scanner entry point, retrieves the tree via `getTreeByPath`, and asserts: 1 root, 5 subagent-roots, all linkage `agentid-in-result`, `root.rollupCost.costUsd > root.selfCost.costUsd`, `nodesById` complete, `warnings` empty.

**Spec reference:** `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` — sections "Parser pipeline changes → scanner wiring", "Edge cases", "Testing strategy".

**filesTouch:** `server/scanner/session-scanner.ts`, `tests/session-tree-integration.test.ts`, `tests/fixtures/session-hierarchy/*`.

After task005 lands, only task006 (route opt-in) remains and the milestone closes with a `scripts/deploy.sh` smoke test.
