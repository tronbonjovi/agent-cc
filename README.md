# Agent CC

**Agent Control Center** — a local dashboard for visualizing and managing your agentic coding ecosystem. Auto-discovers projects, MCP servers, skills, plugins, sessions, agents, and their relationships — zero configuration.

Currently built around [Claude Code](https://docs.anthropic.com/en/docs/claude-code), with plans to support additional agentic systems in the future.

## Quick Start

```bash
git clone https://github.com/tronbonjovi/agent-cc.git
cd agent-cc
npm install
npm run dev
```

Open [http://localhost:5100](http://localhost:5100). Everything is auto-discovered from your `~/.claude/` directory.

For production, Agent CC runs bare metal via systemd. See [SETUP.md](SETUP.md) for detailed installation and deployment.

## Requirements

- **Node.js 18+**
- **Claude Code** installed (the dashboard reads from `~/.claude/`)
- **git** (optional, used for the update feature)

## What It Does

- **Project discovery** — finds all Claude Code projects, per-project cost/health/session aggregation
- **Session intelligence** — deep search across message content, AI summaries, cost analytics, file heatmap, health scores
- **Operations nerve center** — real-time service health, cost pacing, attention items, overnight activity
- **Continuation intelligence** — detects unfinished work, uncommitted changes, abandoned sessions with one-click resume
- **MCP server management** — every `.mcp.json` across all projects in one view
- **Bash knowledge base** — every shell command indexed and searchable with success rates
- **Decision log** — AI-extracted architectural decisions from past sessions
- **Natural language query** — ask questions about your analytics data
- **Session delegation** — continue sessions via terminal, Telegram, or voice
- **14 themes** — Dark, Light, Glass, Anthropic Light/Dark, Catppuccin Mocha, Nord, Dracula, Tokyo Night, Solarized Dark, and more. Each theme has its own aesthetic profile controlling glow, borders, elevation, and animation
- **Live monitoring** — real-time active sessions, context usage, cost estimates, agent tracking (integrated into Dashboard)
- **Graph visualization** — interactive ecosystem map with AI-assisted suggestions
- **Markdown editor** — edit `CLAUDE.md` and memory files with version history
- **Embedded terminal** — VS Code-style bottom panel with xterm.js, multiple tabs, split view
- **Task automation pipeline** — trigger milestones for automated execution. Workers run `claude -p` in isolated git worktrees, streaming progress to the kanban board. Budget guardrails, retry escalation, dependency-ordered scheduling, and integration gate (auto-detected test command) with human review at milestone boundaries

## Pages

| Page | What it shows |
|------|---------------|
| Dashboard | Live session monitoring, entity counts, system health, recent activity |
| Board | Cross-project kanban board — aggregated tasks, dependency flags, move controls, filters |
| Projects | Discovered projects with sessions, tech stack, cost, task boards |
| MCP Servers | Every MCP server from `.mcp.json` files |
| Skills | User-invocable and system skills |
| Plugins | Installed and available plugins |
| Markdown | CLAUDE.md, memory files, READMEs with inline editing |
| Sessions | Deep search, AI summaries, cost, diffs, notes, pins, delegation |
| Messages | Message history + prompt templates (split-screen) |
| Agents | Agent definitions and execution logs |
| Graph | Interactive node graph with custom nodes and AI suggestions |
| Analytics | Usage stats, cost tracking, filesystem activity, GitHub discovery |
| Settings | Claude Code settings, permissions, MCP configs |

## Security and Privacy

Runs entirely on your local machine. No cloud, no telemetry, no external databases.

- Binds to `127.0.0.1` only
- All API input validated with Zod
- File-reading routes use `realpath` path traversal guards
- Shell commands sanitized — no user input passed unsanitized
- Secrets (env vars with "secret", "password", "token", "key") are redacted
- Data stored locally as plain JSON in `~/.agent-cc/`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5100` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `AGENT_CC_DATA` | `~/.agent-cc/` | Data directory |
| `NERVE_CENTER_SERVICES` | `Agent CC:5100` | Services to monitor (`name:port,name:port`) |

See [SETUP.md](SETUP.md) for the full list of environment variables.

## Tech Stack

**Frontend:** React 18, TanStack Query, Tailwind CSS, Radix UI, React Flow
**Backend:** Express 5, chokidar, Zod
**Build:** Vite + esbuild, TypeScript throughout

## Development

```bash
npm run dev          # dev server with hot reload
npm run check        # TypeScript type-check
npm test             # run all tests
npm run build        # production build
```
