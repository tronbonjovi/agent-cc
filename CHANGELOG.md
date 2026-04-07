# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Centralized kanban board** — cross-project board at `/board` aggregates tasks from all projects into 5 columns (Backlog → Ready → In Progress → Review → Done). Includes:
  - Board types, column definitions, cross-project aggregator with per-project colors
  - Dependency validation with flagging (advise, not block) and auto-unflag
  - Board API routes: GET state/stats, POST move with validation, POST roadmap ingest, SSE events
  - Roadmap ingest parser (markdown → milestones + tasks with dependency resolution)
  - React Query hooks with 10s polling fallback and SSE auto-reconnect with backoff
  - Rich task cards (project colors, priority badges, tags, activity, cost, assignee)
  - Side panel with task details, move controls, flag dismissal
  - Filter bar (project, priority, flagged) with milestone progress indicators
  - Pipeline freeze guard on board moves (respects active pipeline runs)
  - 7 new test files, 47 tests covering types, aggregator, validator, events, routes, filters, integration
  - 7 rounds of Codex adversarial review, 16 bugs caught and fixed
- **Task automation pipeline** — server-side pipeline manager orchestrates Claude CLI workers in isolated git worktrees. Milestones execute tasks in dependency order with budget/circuit-breaker guardrails, retry escalation (self-fix → codex-rescue → blocked), and SSE streaming to the kanban board. Includes:
  - Pipeline types, git ops (worktrees, snapshots, rebase), budget tracker, event bus
  - Worker lifecycle: build → AI review → human review, with cooperative pause
  - Manager: milestone scheduling, dependency resolution, integration gate
  - REST API: start/pause/resume/approve/cancel/descope + SSE events
  - Client hooks and UI overlays (pipeline card overlay, milestone controls)
  - Auto-detect base branch (main/master/develop/etc) and test command (npm/pnpm/yarn/cargo/go/pytest/make)
  - Configurable `testCommand` per pipeline config with fail-closed integration gate
  - Project-scoped API guards preventing cross-project pipeline manipulation
  - Durable run state persistence — survives server restarts (restored as stalled)
  - Cross-project task file scoping (compound `projectId:taskId` index keys)
  - 9 rounds of Codex adversarial review, all findings addressed
- **Pipeline-first kanban board design** — spec and 13-task implementation plan for rebuilding the kanban board as a pipeline-native UI. Columns are fixed pipeline stages (Backlog → Queued → Build → AI Review → Human Review → Done), milestones render as collapsible horizontal swimlanes, cards move via automation only (no drag-and-drop). 12 rounds of Codex adversarial review on the spec.
- **Workflow system design** — spec for markdown-based project workflow system (ROADMAP.md → milestones → tasks) with YAML frontmatter, tags, status lifecycle, and kanban integration. Skill-based approach keeps CLAUDE.md lean.
- **Session rename** — click the pencil icon on any active session to give it a meaningful name. Custom names appear everywhere: Dashboard, Sessions page, and health panel. Names persist across restarts
- **Data size health threshold** — session file size now color-coded (green < 500KB, yellow 500KB–2MB, red > 2MB), configurable in Settings alongside existing thresholds
- **Analytics tabs** — Sessions page Analytics panel converted from 12 vertically-stacked sections to 10 individual tabs with URL persistence (`?atab=` param)

### Changed
- **Model tags** — now show versioned names (Opus 4.6, Sonnet 4.6, Haiku 4.5) instead of just family name
- **Dashboard layout** — active sessions and recent activity have fixed height with scroll (~3 cards visible, scrollable); removed stat cards, quick actions, session stats, system card, and recent changes sections
- **Dashboard accents** — decorative green highlights (status dots, live border, running agent indicators, new session ring, cost display) now use theme-aware primary color instead of hardcoded green. Health traffic-light colors (green/yellow/red) unchanged
- **CSS animations** — `live-border` pulse and glow classes now use `--primary` CSS variable, adapting to active theme (orange in Anthropic, blue in default dark)
- **Sessions top bar** — restructured into two rows: title + search on top, filters + actions below. Filter buttons use theme primary accent when active
- **Project paths** — encoded project keys now display as readable paths (`~/dev/projects/agent-cc` instead of dashes)
- **Health threshold colors** — message count and cost on active session cards colored green/yellow/red based on configured thresholds

### Removed
- **Session stat cards** — Total/Storage/Active/Empty cards removed from Sessions page (info already in subtitle)

### Removed
- **Ask a Question** — NL query section removed from analytics (AI integration not a current focus)
- **Smart Context Loader** — context generation section removed from analytics
- **Continuation Panel** — "Pick up where you left off" section removed from analytics

### Fixed
- **Health thresholds migration** — existing databases created before the health feature now get default thresholds backfilled automatically
- **Session health indicators** — active session health panel on Sessions page showing context usage progress bar, cost, and message count with color-coded thresholds (green/yellow/red)
- **Configurable health thresholds** — Settings page section to customize when indicators change color, with validation (yellow < red) and reset to defaults
- **Smart polling** — live data polling adjusts automatically: 5s when sessions are active, 30s when idle (was fixed 3s)
- **Deploy script** — `scripts/deploy.sh` handles build, kill, restart, and verification in one command
- **Session handoff notes** — `docs/handoff/` directory for carrying in-progress work between sessions, integrated into `/wrap-up` skill

- **Cost indexer** — new `cost-indexer.ts` module incrementally parses JSONL files, stores structured `CostRecord` objects in `agent-cc.json` with exact model versions, pricing snapshots, and subagent parent-child relationships
- **Compute/cache cost split** — daily chart now shows stacked bars for compute (input+output) vs cache (read+write) costs with legend
- **Exact model versions** — model breakdown shows full model strings (`claude-opus-4-6`) instead of family names (`opus`), with per-category token columns (In/Out/Cache Rd/Cache Wr)
- **Subagent cost attribution** — top sessions show subagent count and cost rolled up to the parent session
- **Session cost detail endpoint** — `GET /api/analytics/costs/session/:id` returns per-session breakdown including subagent costs and applied rates
- **Costs page time period selector** — 7d / 30d / 90d pill toggle, all data scoped to selected window
- **Weekly cost comparison** — banner showing this week vs last week spend with % change
- **Top sessions table** — 20 most expensive sessions with model and cost

### Fixed
- **Service restart hang** — SIGTERM handler now closes HTTP server and exits process, so `systemctl restart` completes instantly instead of timing out after 90s
- **Subagent JSONL path** — indexer was looking for subagents at `{projectDir}/subagents/` instead of `{projectDir}/{sessionId}/subagents/`, missing all sonnet/haiku subagent cost data
- **Project name display** — `decodeProjectKey` is lossy (hyphens become slashes), so "agent-cc" displayed as "cc". Now uses entity lookup with `path.basename()` for correct names
- **Partial line data loss** — indexer advanced offset to file size even when last JSONL line was incomplete (mid-write). Now only advances through last complete newline
- **Cost record ID collision** — two assistant responses in the same second with the same model produced identical IDs, silently dropping one. Added line index to hash
- **Index state persistence** — deletions and offset changes weren't persisted when no new records were inserted, causing stale data after restart
- **Model column layout** — long model names (`claude-haiku-4-5-20251001`) blew out column alignment. Stripped `claude-` prefix, condensed to 4 columns
- **Session click 404** — top sessions linked to nonexistent `/sessions/:id` route
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
