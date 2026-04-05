# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Task project picker** — replaced sidebar project list with dropdown combobox in top bar, eliminating double-sidebar clutter
- **Project scanner** — fixed phantom projects (Docker, Tron, home dir) appearing in project list; session key fallback now requires project markers; home-level infra dirs excluded
- **Docker volumes** — removed read-only (`:ro`) mounts so the app can write to projects and `.claude` config

### Removed
- **Standalone docker-compose.yml** — deleted from source repo; homelab compose at `~/docker/docker-compose.yml` is the single source of truth
- **Task sidebar component** — replaced by dropdown project picker

## [2.1.0] - 2026-04-05

### Added
- **Task management** — project-level task boards with kanban view, drag-and-drop, and markdown-based task files. Tasks are stored as `.md` files with YAML frontmatter in `{project}/.claude/tasks/`, following the same pattern as skills and memories. Features: flexible hierarchy (roadmap → milestone → task or any user-defined structure), customizable statuses/types/priorities, rich task cards with priority colors and description preview, slide-out detail panel, inline task creation, and board setup flow for new projects
- **Task API** — full CRUD endpoints at `/api/tasks/` with optimistic concurrency control, atomic file writes, column reorder, and board config management
- **Task sidebar navigation** — Tasks appears as a sub-item under Projects in the sidebar, with project picker and hierarchy tree

### Fixed
- **CORS behind reverse proxy** — added `ALLOWED_ORIGINS` env var so the app works when accessed via Caddy (`acc.devbox`) instead of localhost
- **Drag-and-drop crash** — fixed crash when dragging tasks due to incomplete column order initialization
- **Drag-and-drop duplicates** — fixed duplicate card entries when dragging between columns (reorder + status change both wrote to columnOrder)
- **Task directory permissions** — created directories now use 775 mode for Docker volume compatibility
- **Save feedback** — detail panel now shows toast and closes on save

### Changed
- 1956 tests across 22 test files, all passing
- New npm dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for drag-and-drop

## [2.0.0] - 2026-04-04

Project reborn as **Agent CC** (Agent Control Center). Originally started as a fork of sorlen008/claude-command-center, the project diverged significantly and was re-established as an independent private project.

### Changed
- Renamed from "Claude Command Center" to "Agent CC" across entire codebase
- New private GitHub repo (no longer a fork)
- Data directory changed from `~/.claude-command-center/` to `~/.agent-cc/`
- Env var changed from `COMMAND_CENTER_DATA` to `AGENT_CC_DATA`
- Database file renamed from `command-center.json` to `agent-cc.json`
- Caddy subdomain changed from `ccc.devbox` to `acc.devbox`
- Removed MIT license, CONTRIBUTING.md, SECURITY.md, and other public open-source artifacts
- Reset version to 2.0.0 to mark the clean break

### Carried forward from pre-2.0
- 14 themes with aesthetic profiles (Dark, Light, Glass, Anthropic Light/Dark, Catppuccin Mocha, Nord, Dracula, Tokyo Night, Solarized Dark, and more)
- Full session intelligence (deep search, AI summaries, cost analytics, file heatmap, health scores)
- Operations nerve center, continuation intelligence, bash knowledge base, decision log
- Docker support, security hardening, path traversal protection, MCP secret redaction
- 1792+ tests across 19 test files
