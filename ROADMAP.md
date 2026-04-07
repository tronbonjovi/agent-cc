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

### Unreleased — Terminal Reliability & Groups
- Terminal survives refreshes and disconnects (5min grace period, ring buffer, auto-reconnect)
- VS Code-style terminal groups with split panes, explorer sidebar, instance manager
- Zustand store for group state, allotment for resizable panes
- 4 + 2 rounds of Codex adversarial review

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
- Legacy `/tasks` page removed (superseded by `/board`)
- 10 rounds of Codex adversarial review

---

## Next Up (not prioritized yet)

### Board ↔ Session Integration
Connect board cards to real Claude session data — live activity, cost rollup, session linking. The plumbing exists on both sides (`sessionId` on BoardTask, session scanner) but isn't wired together.

### UI/UX Rework
Nav restructure (workspace/config/tools), session health indicators in Sessions & Agents, visual consistency pass (~30 files still have hardcoded green accents).

### Workflow System
Markdown-based ROADMAP.md → milestones → tasks with YAML frontmatter, tags, status lifecycle. Spec complete, not yet implemented.
