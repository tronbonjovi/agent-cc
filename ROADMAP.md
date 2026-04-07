# Agent CC — Roadmap

Updated: 2026-04-07

## Completed

### v2.0.0 — Project Rebirth
- Renamed from Claude Command Center to Agent CC
- Private repo, clean break from fork

### v2.1.0 — Task Management
- Markdown-based task files with YAML frontmatter
- Kanban board with drag-and-drop
- Full CRUD API with optimistic concurrency

### Unreleased — Observability & Polish
- Cost indexer with per-model pricing, subagent attribution
- Session rename, health thresholds, smart polling
- UI consolidation (15 → 11 nav items)
- Anthropic Dark theme, terminal color theming
- Embedded terminal panel (xterm.js + node-pty + WebSocket)

### Unreleased — Task Automation Pipeline
- Pipeline manager orchestrating Claude CLI workers in git worktrees
- Milestone scheduling, dependency resolution, budget/circuit-breaker guardrails
- Retry escalation (self-fix → codex-rescue → blocked)
- SSE streaming, cooperative pause, integration gate
- 9 rounds of Codex adversarial review

### Unreleased — Centralized Kanban Board
- Cross-project board aggregator at `/board`
- Dependency validation with flagging, move API, SSE events
- Roadmap ingest parser (markdown → milestones + tasks)
- Rich task cards, side panel, filter bar
- Pipeline freeze guard on board moves
- 10 rounds of Codex adversarial review

---

## Next Up

### Terminal Reliability (NEXT)
Make the terminal survive real usage — refreshes, navigation, reconnection. This unblocks working directly out of Agent CC, which informs every UX decision after it.

**Critical:**
- Decouple PTY lifecycle from WebSocket (PTY survives disconnect with grace period)
- Server-side ring buffer per terminal (replay scrollback on reconnect)
- Client reconnection to existing terminals (attach instead of always create)

**Medium:**
- State machine for terminal lifecycle (creating → ready → connected → disconnected → reconnecting → dead)
- Fix visibility/fit race condition on tab switch
- Fix stale closure in resize handling

**Nice-to-have:**
- Claude CLI awareness (detect sessions running inside terminals)

Reference: `~/dev/projects/aperant/REVIEW-REPORT.md` Section 3

---

## Future (not prioritized yet)

### Board ↔ Session Integration
Connect board cards to real Claude session data — live activity, cost rollup, session linking. The plumbing exists on both sides (`sessionId` on BoardTask, session scanner) but isn't wired together.

### Tasks Page Cleanup
Remove `/tasks` page (superseded by `/board`). Clear test data scripts.

### UI/UX Rework
Nav restructure (workspace/config/tools), session health indicators in Sessions & Agents, visual consistency pass. See memory: `project_ui_rework_vision.md`.

### Workflow System
Markdown-based ROADMAP.md → milestones → tasks with YAML frontmatter, tags, status lifecycle. Spec complete, not yet implemented.
