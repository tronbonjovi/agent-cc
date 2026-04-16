# Agent CC

**Agent Control Center** — a personal platform for AI-assisted software development. Ties together session intelligence, analytics, project management, workflow tools, and a built-in workspace. Currently built around Claude Code, with plans to support additional AI development tools.

Built by a solo developer learning software engineering with AI as primary coding partner.

## Core Features

The Session Intelligence engine is the backbone — it ingests AI coding session data into a unified SQLite store and builds hierarchical session trees. Analytics, cost tracking, and chat all read from that store. Ecosystem Discovery scans your environment for projects, tools, and configs. The rest are standalone workspace and management tools.

**Session Intelligence** `Live` — The deep engine. Parses JSONL session files, extracts messages, tool calls, costs, file changes, and metadata. Builds hierarchical session trees linking parent sessions to subagent sessions. Ingests incrementally into SQLite with byte-offset resumption.

**Ecosystem Discovery** `Live` — Fleet of filesystem scanners that discover what exists in your environment: projects, skills, plugins, MCP servers, agents, configs, markdown files, tasks, Docker services, and git remotes. Produces an entity graph that feeds the dashboard, library, and graph visualization.

**Analytics** `Live` — Cost breakdowns by session, model, source, and time period. Time-series charts for tokens, cache efficiency, model distribution, tool usage, and file heatmaps. Session deep-dive with message timeline, tool call rendering, and filterable message search. AI-vs-deterministic savings tracking.

**Nerve Center** `Needs Work` — Interactive node-link force graph showing all discovered entities and their relationships. Color-coded by type, draggable, zoomable, with entity type filtering.

**Board** `Needs Work` — Cross-project kanban board with four columns, milestone grouping, dependency flags, and session linking. Two-way sync with [workflow-framework](https://github.com/tronbonjovi/workflow-framework) markdown task files.

**Chat** `Live` — Integrated multi-tab chat panel. Conversations persist in SQLite. Slash commands route to server-side workflows (no shell access from chat input). Claude Code hooks stream inline. Import past sessions as chat tabs. Conversation sidebar with source filtering.

**Terminal** `Live` — VS Code-style embedded terminal with multiple tabs, split view, persistent state, and theme-aware rendering.

**Library** `Needs Work` — Management interface for skills, plugins, MCP servers, agents, and prompts. Discovery from GitHub. Install/uninstall for library items. Bash knowledge base with indexed shell commands.

**Editor** `Needs Work` — Markdown editor for CLAUDE.md, memory files, and READMEs. Split edit/preview, version history with diff and restore, CLAUDE.md validation, overlap detection across files.

**Workflow Builder** `Planned` — Visual infinite canvas with node-based directed graph workflow system.

**File Explorer** `Planned` — Custom file browser integrated with the workspace.

## Quick Start

```bash
git clone https://github.com/tronbonjovi/agent-cc.git
cd agent-cc
npm install
npm run dev
```

Open [http://localhost:5100](http://localhost:5100). Everything is auto-discovered from your `~/.claude/` directory.

For production deployment, see [SETUP.md](SETUP.md).

## Tech Stack

**Frontend:** React 18, TanStack Query, Tailwind CSS, Radix UI, React Flow, xterm.js
**Backend:** Express 5, better-sqlite3, chokidar, Zod
**Build:** Vite + esbuild, TypeScript throughout

## Security & Privacy

Runs entirely on your local machine. No cloud, no telemetry, no external databases.

- Binds to `127.0.0.1` only
- All API input validated with Zod
- File-reading routes use `realpath` path traversal guards
- Secrets (env vars with "secret", "password", "token", "key") are redacted

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5100` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `AGENT_CC_DATA` | `~/.agent-cc/` | Data directory |

See [SETUP.md](SETUP.md) for the full list of environment variables and deployment options.

## Development

```bash
npm run dev          # dev server with hot reload
npm run check        # TypeScript type-check
npm test             # run all tests
npm run build        # production build
```

## Requirements

- **Node.js 18+**
- **Claude Code** installed (reads from `~/.claude/`)
- **git** (optional, used for the update feature)
