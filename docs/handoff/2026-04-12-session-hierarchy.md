# Session Hierarchy Spec — 2026-04-12 Handoff

## Context

Brainstormed session hierarchy modeling for the scanner. `ParsedSession` currently exposes session data as flat arrays (messages, tool calls, timeline) with no parent-child structure, and the scanner never parses subagent JSONL files at all. This session produced the design spec for fixing both.

## What was done

- **Investigated blast radius.** ~60 files consume `ParsedSession`, ~200 field reads, concentrated in `server/scanner/`, `server/routes/`, and `client/src/components/analytics/sessions/`. Load-bearing fields: `meta.*`, `assistantMessages[]`, `userMessages[]`, `toolTimeline[]`, `counts`. Dead code: `conversationTree` (5 fields per node, zero production consumers).
- **Ran the parser against a real session** (`d2570b3e-f3ce-41ee-a462-89f805bb2e9f`, 470 KB, 5 subagents). Confirmed: subagent JSONLs live at `<session>/subagents/agent-*.jsonl` with `.meta.json` siblings carrying `{agentType, description}`; each subagent record has `sessionId` back-reference to parent; parent ↔ subagent linkage aligns within 1–4 ms via timestamp and stronger via `agentId` substring in parent's tool_result text.
- **Chose Option B** (keep `ParsedSession` flat, add `SessionTree` alongside). Over Option A (evolve the existing arrays into a tree — 15+ consumer rewrites for no gain) and Option D (compute at read-time — reintroduces multi-parse).
- **Wrote and committed the spec** at `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` — commit `666da38`, 550 lines. Covers data model, subagent discovery, three-tier linkage priority, parser pipeline changes, cost rollup, edge cases, and testing strategy.

## What's open

- Spec is committed but **not yet scoped into tasks**. Next step: `/build-roadmap` against the spec file to break it into milestones/tasks.
- 4 open questions flagged in the spec (nested subagents, tool-call cost, eager vs. lazy parsing, duplicate agentIds). All have proposed answers; none block scoping.
- Implementation should happen in a fresh session per the `fresh-sessions-for-execution` feedback memory.

## How to resume

```
/build-roadmap docs/superpowers/specs/2026-04-12-session-hierarchy-design.md
```

No pre-work needed. The spec is self-contained and includes an investigation appendix with the real-session data that informed every design decision.
