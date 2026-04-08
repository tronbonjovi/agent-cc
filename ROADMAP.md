# Agent CC — Roadmap

Updated: 2026-04-08

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

### Unreleased — Task Automation Pipeline (removed)
- Built and removed — pipeline manager orchestrating Claude CLI workers in git worktrees
- Superseded by human-first kanban board approach; automation to be revisited later

### Unreleased — Centralized Kanban Board
- Cross-project board aggregator at `/board`
- Dependency validation with flagging, move API, SSE events
- Roadmap ingest parser (markdown → milestones + tasks)
- Rich task cards, side panel, filter bar
- Legacy `/tasks` page removed (superseded by `/board`)
- 10 rounds of Codex adversarial review

### Unreleased — Board ↔ Session Integration
- Session enricher bridges task scanner to session analytics (cost, health, model, activity)
- Board cards redesigned as info radiators: status lights, model badges, agent activity, session stats
- Manual session linking from side panel (pick from recent sessions, unlink)
- Session detail section in side panel (model, health, messages, duration, tokens, cost)
- New API endpoints for session lookup and linking
- `sessionId` field on tasks for manual session linking

---

## Next Up (not prioritized yet)

### UI/UX Rework
Nav restructure (workspace/config/tools), session health indicators in Sessions & Agents, visual consistency pass (~30 files still have hardcoded green accents).


