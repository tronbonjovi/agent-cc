# Session Hierarchy — 2026-04-12 Handoff (Phase 1 complete)

## Status

`session-hierarchy` milestone: **2/6 tasks complete**. Phase 1 done, ready to resume at Phase 2 (task003 — the SessionTree builder).

| Task | Status | Phase |
|---|---|---|
| task001 — Types + `issuedByAssistantUuid` parser fix | **completed** | 1 |
| task002 — Subagent discovery module | **completed** | 1 |
| task003 — SessionTree builder | **pending** | 2 |
| task004 — Cache stores tree alongside parsed | pending | 3 |
| task005 — Scanner wiring + integration test (PII-scrubbed fixture) | pending | 4 |
| task006 — Route opt-in via `?include=tree` | pending | 5 |

## Where the work lives

All Phase 1 code is on branch **`feature/session-hierarchy`** in worktree **`.worktrees/session-hierarchy/`**. Three commits, not pushed, not merged:

- `0b781ed` — feat: add SessionTree types and issuedByAssistantUuid linkage (task001)
- `0484fdb` — feat: add subagent discovery module (task002)
- `b12a6d6` — fix: use node: prefix for built-in imports in subagent-discovery (review feedback)

`main` is unchanged from `398f47c` except for roadmap status updates and this handoff. Phase 1 has not deployed because the feature work hasn't merged.

## What was done this session

- **Worktree setup.** `.worktrees/session-hierarchy` created on branch `feature/session-hierarchy`, `npm install` complete, baseline `npm run check` clean.
- **Roadmap cleanup.** `nerve-center-redesign` was stuck `in_progress` in `MILESTONE.md` even though all 3 tasks were already completed on disk. Cascaded the milestone + task003 row to `completed`. Activated `session-hierarchy` milestone.
- **task001 (TDD).** Added all SessionTree types from spec sections "Data model" + "SubagentLinkage" verbatim to `shared/session-types.ts`. Marked `ConversationNode` and `ParsedSession.conversationTree` `@deprecated`. Threaded `assistantUuid` through `pendingToolCalls` map in `session-parser.ts` so every `ToolExecution` records `issuedByAssistantUuid`. 2 new parser tests (single-turn population, 1:1 two-turn mapping). Updated the smoke-test `ToolExecution` literal so the file typechecks.
- **task002 (TDD).** New file `server/scanner/subagent-discovery.ts` exports `DiscoveredSubagent` interface and `discoverSubagents()`. Side-effect-free, sorted by filename, graceful per-file degradation on missing/malformed `.meta.json`. 8 new tests covering all branches.
- **Read-only review pass** by `feature-dev:code-reviewer` subagent. Verdict: PASS-WITH-CONCERNS → PASS after fixing `node:` prefix on subagent-discovery imports. Reviewer also flagged a low-risk `|| ''` empty-string fallback at `session-parser.ts:152` — left in place because it matches the existing convention on line 172 (`uuid: record.uuid || ''`); changing one field would be inconsistent with the rest of the parser.

## Verification gates (last green run)

In the worktree:

- `npm run check` → exit 0
- `tests/session-parser.test.ts` → 45/45 (43 existing + 2 new)
- `tests/subagent-discovery.test.ts` → 8/8 (new file)
- `tests/new-user-safety.test.ts` → 2462/2462

## Known sandbox blocker for task003

Subagents spawned via the `Agent` tool **cannot write to the worktree subtree** in this environment, even though they can read it. Both task001 and task002 had to be implemented by the main agent directly. This will hit task003 the same way unless the sandbox config changes. **Plan for task003: skip subagent dispatch and implement in the main agent loop.** TDD discipline still applies; the work isn't more complex than what task002 already did, just longer.

## How to resume — task003 (SessionTree builder)

Start a fresh session (per the `fresh-sessions-for-execution` feedback memory) and run:

```
/work-task
```

The work-task skill will pick up `session-hierarchy` as the active milestone and present task003 as next. The worktree at `.worktrees/session-hierarchy` is already set up — no need to recreate it. Branch is `feature/session-hierarchy` and all Phase 1 commits are present.

**task003 is the complex core of the milestone.** It reads:

- `parent: ParsedSession` (from `parseSessionFile`)
- `subagents: Array<{ parsed: ParsedSession; meta: DiscoveredSubagent }>`

…and emits a `SessionTree` per the algorithm in spec section "Parser pipeline changes → New: server/scanner/session-tree-builder.ts" (8 numbered steps). Key invariants:

1. **Two-pass in-session tree build** for `parentUuid` resolution. Out-of-order messages may need a second pass; orphans after pass 2 attach to `session-root` with a warning.
2. **Tool calls hang off the assistant turn that issued them** via the new `issuedByAssistantUuid` field — no timestamp matching needed for this layer.
3. **Three-tier subagent linkage**, walked **strictly in order**, first match wins:
   - Tier 1 — `agentid-in-result`: subagent's `agentId` appears as substring in matching parent `tool_result` text. Look up tool_result via `callId` from parent's `userMessages`.
   - Tier 2 — `timestamp-match`: only if tier 1 found nothing. Min `Δ = |agentCall.ts − subagent.firstRecordTs|` ≤ 10 ms.
   - Tier 3 — `orphan`: only when tiers 1 and 2 both failed for every Agent call. Attach to `session-root`, emit `orphan-subagent` warning.
4. **Cost rollup** is post-order. `selfCost` is per-kind (assistant-turn only; everything else zero). Reuse the existing model pricing in `server/scanner/session-analytics.ts` — don't re-implement.
5. **Recursion into subagent trees** reuses steps 2–3 of the algorithm on the subagent's own `ParsedSession`. Skip discovery of nested subagents (Open Question 1 — emit `nested-subagent-skipped` warning if a subagent has tool_use blocks naming a `subagent_type`).
6. **`SessionTree.totals`** equals `root.rollupCost` plus flat counters (assistantTurns, userTurns, toolCalls, toolErrors, subagents).

**filesTouch:** `server/scanner/session-tree-builder.ts` (new), `tests/session-tree-builder.test.ts` (new). Standalone — no cross-file coordination once task001/task002 inputs exist.

**Tests** to write first (TDD): single session no subagents, agentid-in-result linkage, timestamp-match linkage, orphan subagent, malformed `.meta.json` (still attached, `meta: null`), tool-call attachment, orphan tool-call, orphan assistant-turn (broken parentUuid chain), 3-level cost rollup correctness, `totals` equals `root.rollupCost` + counts.

**Spec reference:** `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` — sections "Data model", "Linkage resolution — three-tier priority", "Parser pipeline changes → buildSessionTree", "Cost rollup semantics", "Edge cases".

After task003 lands, Phase 2 is done and task004 (cache integration) becomes unblocked.
