# v1.0.0

Initial public release of Claude Command Center.

## What is it?

A local dashboard for visualizing and managing your Claude Code ecosystem. Runs on `localhost:5100`, reads your `~/.claude/` directory, and shows you everything in one place.

## Features

- **Auto-discovery** of projects, MCP servers, skills, plugins, sessions, and agents
- **Session browser** with search, filter, sort, and bulk operations
- **Agent tracker** with definitions and execution history
- **Live monitoring** of active Claude Code sessions with context usage, cost estimates
- **Interactive graph** of your ecosystem with AI-assisted suggestions and `graph-config.yaml` support
- **Markdown editor** for CLAUDE.md and memory files with version history
- **Discovery** of unconfigured projects and MCP servers
- **Config viewer** for settings, permissions, and MCP configurations
- **Activity feed** from file watcher
- **One-click updates** from the sidebar

## Security

- Runs on `127.0.0.1` only (not network-accessible by default)
- No telemetry, no analytics, no outbound network requests
- All data stored locally in `~/.claude-command-center/`
- Secrets in scanned configs are redacted
- All user inputs validated with Zod schemas
- See [SECURITY.md](SECURITY.md) for the full policy

## Install

```bash
git clone https://github.com/sorlen008/claude-command-center.git
cd claude-command-center
npm install
npm run dev
```

Requires Node.js 18+ and Claude Code installed.

## Verify

```bash
sha256sum -c checksums-v1.0.0.sha256
```
