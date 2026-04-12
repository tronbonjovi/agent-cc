# session-hierarchy fixture

## Provenance

This fixture is a synthetic replacement for a real 5-subagent session used
during session-hierarchy milestone development. **Nothing in this directory
came from a real session verbatim.** Every uuid, agentId, tool-call id,
timestamp, path, slug, and message body is a handwritten placeholder. The
fixture only preserves the **structural shape** of a Claude Code session
with subagents so the scanner -> builder -> cache pipeline can be exercised
end-to-end.

The fixture was written for `tests/session-tree-integration.test.ts`, the
integration test that proves the tree pipeline survives real-shaped data.

## Invariants the integration test depends on

1. **5 subagents**, each with `agent-<17-char-hex>.jsonl` +
   `agent-<17-char-hex>.meta.json`.
2. **Tier-1 linkage succeeds for every subagent.** Each parent user record
   carrying a tool_result for an Agent tool-call has a record-level
   `toolUseResult.agentId` field matching exactly one subagent filename.
3. **Subagent cost is non-zero** -- each subagent assistant message has
   non-zero input/output tokens on `claude-opus-4-6`, so
   `root.rollupCost.costUsd > root.selfCost.costUsd`.
4. **No nested Agent calls** inside subagent JSONLs, so the `nested-subagent-skipped`
   warning is NOT emitted.
5. **No orphaned records** -- every parent/subagent message has a resolvable
   parentUuid chain, so the `warnings` array stays empty on a clean build.
6. **Parent contains one non-Agent tool-call (Read)** for structural realism,
   so the tool-timeline pairing isn't exclusively Agent calls.

## PII surface

This fixture must pass `new-user-safety.test.ts`. No real paths, real names,
real project identifiers, phone numbers, emails, or encoded path keys should
ever appear here. The only "real" content is the `claude-opus-4-6` model
name (the pricing table keys off it) and the `Agent`, `Read`, and `Bash`
tool names.
