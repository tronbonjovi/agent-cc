# v1.1.0

## Highlights

### Stats Page
New analytics page at `/stats` with sessions-per-day chart, top projects by usage, agent type distribution, and model distribution.

### Graph Configuration
Extend the auto-discovered graph with custom nodes via `graph-config.yaml`, Docker Compose auto-discovery, database URL extraction from MCP env vars, and AI-assisted suggestions.

### Export/Import
One-click backup via `GET /api/export` and restore via `POST /api/import`. Export button available on the dashboard.

### Live View Enhancements
Each active session now shows context usage bar, last message, message count, file size, cost estimate, model badge, and running/recent agents with task descriptions.

### Keyboard Shortcuts
Press `G` then `D`/`S`/`A`/`G`/`L`/`M`/`P`/`K` to navigate between pages. `Ctrl+K` for global search.

### Dashboard Overhaul
Active session count in health bar, keyboard shortcut hints, 6 quick actions (Graph, Live View, CLAUDE.md, Stats, Export, Discovery).

## All Changes

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Install

```bash
npm install -g claude-command-center
claude-command-center
```

Or from source:

```bash
git clone https://github.com/sorlen008/claude-command-center.git
cd claude-command-center
npm install
npm run dev
```

## Verify

```bash
sha256sum -c checksums-v1.1.0.sha256
```
