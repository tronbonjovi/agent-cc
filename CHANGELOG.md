# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cost indexer** — new `cost-indexer.ts` module incrementally parses JSONL files, stores structured `CostRecord` objects in `agent-cc.json` with exact model versions, pricing snapshots, and subagent parent-child relationships
- **Compute/cache cost split** — daily chart now shows stacked bars for compute (input+output) vs cache (read+write) costs with legend
- **Exact model versions** — model breakdown shows full model strings (`claude-opus-4-6`) instead of family names (`opus`), with per-category token columns (In/Out/Cache Rd/Cache Wr)
- **Subagent cost attribution** — top sessions show subagent count and cost rolled up to the parent session
- **Session cost detail endpoint** — `GET /api/analytics/costs/session/:id` returns per-session breakdown including subagent costs and applied rates
- **Costs page time period selector** — 7d / 30d / 90d pill toggle, all data scoped to selected window
- **Weekly cost comparison** — banner showing this week vs last week spend with % change
- **Top sessions table** — 20 most expensive sessions with model and cost

### Fixed
- **Opus 4.5/4.6 pricing** — was using Opus 4.0 rates ($15/$75 per MTok), actual Opus 4.6 rate is $5/$25. Costs were inflated 3x
- **Haiku 4.5 pricing** — was using Haiku 3.5 rates ($0.80/$4), actual Haiku 4.5 rate is $1/$5
- **Live-scanner cost estimate** — was applying cache-read rate (10%) to all input tokens instead of proper per-category rates
- **Unified pricing module** — cost-analytics.ts was duplicating pricing definitions; now imports from single source
- **Cache savings calculation** — was hardcoded to Sonnet pricing; now uses dominant model's actual rates
- **Weekly comparison accuracy** — was computed from truncated daily window (broken in 7d mode, off-by-one in all modes); now computed from raw token data with equal half-open 7-day ranges
- **Plan limit comparison** — was using period-scoped total against monthly cap; now uses dedicated 30-day `monthlyTotalCost`
- **Cost totals scoped to period** — `/api/analytics/costs` totals were all-time while chart showed 30 days; now both respect the `days` query param
- **Token display in top sessions** — was only showing input+output; now includes cache tokens so numbers explain the cost

### Changed
- **Cost analytics route** — rewrote from 488-line async JSONL parser to 30-line sync query layer over cost-indexer; response shape changed from flat token counts to structured `CostSummary` with token breakdowns per model/project/day

### Changed
- **Embedded terminal panel** — VS Code-style bottom panel with xterm.js rendering and node-pty backend. Features: multiple terminal tabs, side-by-side split view (max 2 panes), resizable drag handle, collapsible panel, state persistence across navigation and reloads. WebSocket bridge at `/ws/terminal` with origin validation, sanitized environment, cwd restriction to home directory, and max 10 concurrent terminals
- **Terminal React hooks** — `useTerminalPanel()` and `useUpdateTerminalPanel()` for panel state management

### Changed
- **UI consolidation** — reduced sidebar navigation from 15 items to 11 by merging related pages:
  - Dashboard + Live View → Dashboard (combined status bar, active sessions, recent activity)
  - Messages + Prompts → Messages (split-screen: message history left, prompt templates right)
  - Activity & Discover + Analytics & Cost → Analytics (four tabs: Usage, Costs, Activity, Discover)
  - APIs removed from sidebar (route still accessible directly)
- **Fluid page width** — removed rigid `max-w-[1400px]` from all pages; content now fills available screen width dynamically
- **Analytics deep-linking** — `/stats?tab=discover` and `?tab=activity` link directly to specific tabs; old routes (`/live`, `/prompts`, `/activity`) redirect to merged destinations
- **Task project picker** — replaced sidebar project list with dropdown combobox in top bar, eliminating double-sidebar clutter
- **Project scanner** — fixed phantom projects (Docker, Tron, home dir) appearing in project list; session key fallback now requires project markers; home-level infra dirs excluded
- **Anthropic Dark theme** — replaced warm brown palette with neutral greys matching Claude app UI; accent color updated to Anthropic brand orange (#da7756); now the default theme
- **Terminal colors** — theme-reactive: background, foreground, cursor, and selection colors now derive from the active theme and update live on theme switch; separate ANSI palettes for dark and light variants
- **Terminal panel UI** — replaced text symbols with Lucide icons (Plus, X, Columns2, ChevronUp/Down, Terminal); improved drag handle hover feedback; polished collapsed state bar
- **Markdown editor theming** — editor now matches the selected theme; dynamic `data-color-mode` based on theme variant with CSS overrides mapping editor backgrounds, toolbar, borders, code blocks, tables, and links to theme variables
- **Deployment** — switched from Docker to bare metal systemd service for reduced friction

### Fixed
- **Terminal security** — WebSocket origin validation, sanitized PTY environment, cwd restriction, terminal ID collision handling, max 10 concurrent terminals, cols/rows bounds checking
- **Terminal React state** — rewrote panel with useReducer for atomic state transitions, fixed stale closures in resize/persist handlers
- **Shell fallback** — use `/bin/sh` instead of `bash` for cross-platform compatibility (Alpine, minimal containers)
- **Build externals** — keep node-pty and ws as external requires (native addon can't be bundled)
- **Horizontal scroll** — prevented infinite horizontal scrolling on main content area

### Removed
- **Docker deployment for Agent CC** — replaced with bare metal systemd; other homelab services still use Docker
- **Task sidebar component** — replaced by dropdown project picker
- **App brand icon** — removed gradient Terminal icon from sidebar and associated brand-glow CSS animations; placeholder for new icon

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
