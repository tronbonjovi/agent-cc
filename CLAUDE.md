# Agent CC — Development Guide

## Quick Start

```bash
npm install
npm run dev        # starts on http://localhost:5100
npm run check      # TypeScript type-check
npm test           # run all tests
```

## Architecture

Express.js backend + React frontend (TypeScript), served from a single process. Session data is read from `~/.claude/projects/` JSONL files. Persistent state stored in `~/.agent-cc/agent-cc.json`.

## Safety Rules

**CRITICAL — Follow these rules for ALL changes:**

1. **No hardcoded paths.** Never use absolute paths like `C:/Users/zwin0/...` or `/Users/hi/...`. Use `os.homedir()`, env vars, or relative paths.

2. **No PII in source code.** Never hardcode phone numbers, email addresses, IP addresses, or personal names. Use env vars for user-specific config.

3. **No user-specific project names in UI.** Never reference specific projects (Nicora Desk, findash, etc.) in placeholder text, examples, or labels. Use generic examples like "my-app", "backend".

4. **Claude CLI features must pre-check availability.** Any route that spawns `claude -p` must call `isClaudeAvailable()` first and return 503 with a clear message if not installed. Users may not have Claude Code CLI.

5. **External services must be configurable.** Don't hardcode service ports or URLs. Use env vars (e.g., `NERVE_CENTER_SERVICES`). Default to minimal config that works without external services.

6. **Cross-platform support.** Terminal/process spawning must handle win32, darwin, and linux. Never assume Windows `cmd.exe`.

7. **Graceful degradation.** Every scanner and API endpoint must return a valid response even when data is empty, files are missing, or services are down. Use try/catch, return empty arrays, never crash.

8. **Run `new-user-safety.test.ts` after changes.** This test automatically catches hardcoded paths, phone numbers, PII, and user-specific UI strings. If it fails, fix before committing.

9. **No screenshots in git.** `docs/screenshots/` is gitignored. Screenshots contain live user data and must never be committed. Also watch for encoded path forms like `C--Users-username` (Claude project key format).

10. **Do not crawl `archive/`.** Historical specs, plans, task files, and brainstorms from Apr 3→12 live in `archive/` (gitignored, skipped by ripgrep). For history, use `git log` and `CHANGELOG.md`. Explicit `Read` on a known archive path is fine — just don't search/glob it when exploring the repo.

## Key Commands

```bash
npm run dev          # dev server with hot reload
npm run check        # TypeScript type-check (must pass before commit)
npm test             # all tests including new-user-safety checks
npm run build        # production build
```

## Deployment

Agent CC runs bare metal via systemd on the devbox. After making changes:

```bash
scripts/deploy.sh                      # build, restart, verify (one command)
journalctl -u agent-cc -f              # tail logs if needed
```

The systemd unit file is at `/etc/systemd/system/agent-cc.service`. Caddy reverse-proxies `acc.devbox` to `localhost:5100`.

## Commit Format

```
feat: description — vX.Y.Z
fix: description — vX.Y.Z
chore: description — vX.Y.Z
```

## File Structure

```
server/
  routes/          # Express API routes
  scanner/         # JSONL parsers, analytics, AI features
  board/           # Kanban board (aggregator, validator, events, ingest)
  db.ts            # JSON database with atomic writes
  storage.ts       # Storage abstraction layer
shared/
  types.ts         # Shared TypeScript interfaces
client/
  src/pages/       # React page components
  src/hooks/       # React Query hooks
  src/components/  # Reusable UI components
tests/             # Vitest tests
```

## Adding AI Features (claude -p)

When adding features that use `claude -p`:

1. Add `--no-session-persistence` flag to prevent polluting user's session list
2. Remove `CLAUDECODE` from env: `delete env.CLAUDECODE`
3. Add `isClaudeAvailable()` check in the route handler
4. Handle errors gracefully — return 500 with descriptive message
5. Set reasonable timeouts (60s for queries, 300s for summarization)

## Tool Call Efficiency

- Prefer 1 targeted file read over multiple speculative globs
- Batch independent tool calls in a single message
- Every round-trip re-sends full context — have a clear reason for each call
- Don't explore "just in case" — if you know the file path, read it directly

## Adding New Services/Integrations

When adding integrations with external services:

1. Use env vars for all URLs, ports, paths, API keys
2. Document the env var in this file and in README.md
3. Default behavior when env var is not set: feature is disabled, returns helpful message
4. Never expose the feature as "broken" — show "not configured" state instead

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Server port | 5100 |
| `HOST` | Server host | 127.0.0.1 |
| `AGENT_CC_DATA` | Data directory | ~/.agent-cc |
| `NERVE_CENTER_SERVICES` | Services to monitor (name:port,name:port) | Agent CC:5100 |
| `VOICE_CALLER_SCRIPT` | Path to voice outbound caller script | (disabled) |
| `VOICE_PHONE` | Phone number for voice calls | (disabled) |
| `TELEGRAM_BOT_URL` | Telegram bot HTTP API URL | (disabled) |
| `ALLOWED_ORIGINS` | Extra CORS origins for reverse proxy (comma-separated) | (none) |
| `EXTRA_PROJECT_DIRS` | Extra project directories for scanner (comma-separated) | (none) |

## Tests

- **5,553 unit tests across 152 files** covering parsers, routes, storage, validation, scanners, cost indexer, task I/O, path safety, API integration, terminal (ring buffer, session survival, attach protocol, group store, instance manager, toggle, ping keepalive, explorer resize), board aggregation/validation/events/routes/archive/delete, session enrichment, workflow bridge (discovery, status mapping, milestone synthesis, write-back), message timeline content extraction, dashboard layout, board popout positioning, workspace layout (project cards, project popout, project zone, 3-zone integration, nav redirect, route restructure, resizable sidebars, completed milestones zone), stale project pruning, project deletion cascade, board filter safety, board side panel, session highlight, board filters, dashboard preview frontmatter stripping, milestone colors, agent role enrichment, status light tooltips, session tab restructure, analytics move, graph analytics move, nav consolidation, library page (tab shell, entity card, tab migration, three-tier layout, file editor tab, redirects), responsive foundation (breakpoint hook, sizing tokens, responsive sidebar, PageContainer, dashboard/board/library/sessions/analytics/settings responsive passes), session health drilldown, library incoming tabs, layout viewport (shell overflow, PageContainer scroll, dashboard viewport, board viewport, scroll page defaults), library config management (library scanner, file operations API, discover search, save from discover, subtab rename, discover panel, structured sources, remove confirmation, lifecycle integration), session parser (JSONL extraction, tool execution pairing, cost/token aggregation, cache integration), session parse cache (file-size invalidation, singleton API, combined parsed+tree storage), card enrichment (session detail accordion, health reason tags, auto session-task linking, enrichment field population), analytics foundation (decisions removal, workflows relocation, prompts relocation, 5-tab flatten, nav/route redirects), entity graph (force-directed nerve center layout replacing topology), sessions redesign (list-detail layout, session rows, filters/sort/search, session detail panel, overview grid, tool timeline, token breakdown, file impact, health details, lifecycle events, linked task, auto-link improvements, sessions tab wiring), costs deepening (token anatomy, model intelligence, cache efficiency, system prompt overhead, session/project value, costs tab wiring), sessions fixes (resizable divider, pin toggle, overview wiring, linked task hide, chevron rotation, lifecycle labels), costs fixes (collapsible panels, model name normalization, context overhead rename, session navigation), session hierarchy (subagent discovery, SessionTree builder with three-tier linkage, post-order cost rollup, cache tree storage, scanner tree wiring, integration test with scrubbed fixture, sessions route opt-in tree via ?include=tree), flat-to-tree wave 1 (session-analytics/project-value/enricher SessionTree migration with subagent spend inclusion, null-tree fallback preserved, ToolTimeline tree-aware grouping with deterministic subagent colors), flat-to-tree wave 2 (shared subagent-colors module extracted from ToolTimeline with resolveAssistantTurnOwner helper, SessionOverview tree-aware model walk and Subagents chip strip, TokenBreakdown tree-aware row builder with accurate cumulative and Agent column, FileImpact ownerCounts with right-aligned palette dot cluster, SessionDetail forwarding tree to all three components), charts enrichment (charts infrastructure with filter bar context and ChartCard wrapper, 10 tree-backed aggregation endpoints with ?breakdown=all|parent and session-level ?models= filter, token economics charts with section-level breakdown toggle, session patterns charts with tree-inclusive depth labeling, tool usage charts with consistent palette and breakdown prop plumbing, file/activity/workflow charts with ProjectActivityComparison reading /api/analytics/costs/value for tree-inclusive project totals, per-subagent cost breakdown endpoint and chart component with delegation percentage headline and drill-in top sessions), messages redesign (timeline endpoint with 7 TimelineMessage variants and ?include=tree enrichment, session sidebar component, 7 message bubble components with markdown rendering, tool renderer registry with per-tool Summary modules and fallback, central renderMessage dispatcher exhaustive over all variants with never-guard, SidechainGroup with subagentContext grouping via shared subagent-colors palette, dispatcher/barrel split to avoid circular import from SidechainGroup, ConversationViewer with authoritative tree-based grouping and scroll preservation via useLayoutEffect anchor walk, jump-to-top/bottom floating buttons and visible-only position indicator, keyboard nav via aria-expanded disclosure buttons, FilterBar with 6 toggle pills and 3 mode presets, MessagesTab container wiring sidebar + filter bar + viewer with URL param sync, legacy message-history.tsx removed with PromptsPanel extracted, ConversationSearch overlay with Ctrl+F shortcut and auto-expand-to-match, errorsOnly surrounding-context walk with paired tool_call + preceding assistant turn dedup and sidechain precedence, search-highlight context module extraction to avoid circular import, manual QA cleanup fixing empty thinking blocks / subagent JSONL merge into timeline / extended system-injected tag stripping / isMeta user_text suppression / isSidechain user-bubble agent-prompt styling / errorsOnly surfacedRawIndices shared filtered set), codebase cleanup phase 1 (dead page deletion: sessions/board/activity/prompts, session-analytics-panel.tsx 739-LOC split into library/bash-knowledge-panel + settings/workflow-config-panel, health-indicator/stat-card/use-count-up/use-debounce/board-filters/onboarding-wizard deletion, UsageTab/ActivityTab/HistoryTab/ExecutionCard/StatsTab dead-function removal collapsing stats.tsx from 421 to 52 LOC and agents-tab.tsx from 773 to 461 LOC), codebase cleanup phase 2 (formatter consolidation into shared/format.ts with canonical formatUsd/formatCost/formatTokens/formatDate, client/src/lib/format.ts re-export shim, 19 client files + server/cli/report.ts migrated, shortenModel deleted with shortModel migration across board components, session health mapping consolidated into client/src/lib/session-health.ts with sessionHealthColor/sessionHealthLabel/sessionHealthBadgeVariant, SessionRow/HealthDetails/SessionOverview/SessionDetail/session-indicators migrated, emerald-for-good canonical color pinned by tests), codebase cleanup phase 3 (structural/naming fixes: discovery.ts → discover-github.ts rename, nested DiscoverTab → AgentsDiscoverTab disambiguation, prompts-panel.tsx relocation from pages/ to components/library/, shared/pricing.ts consolidation with 4-field MODEL_PRICING and APIEquivalentValue derivation, stale comment cleanup in session-tree-builder/use-scanner/SessionDepthDistribution, script/ → scripts/ directory merge with package.json update, DiscoverResult export drop; server error handling: new server/lib/route-errors.ts with handleRouteError helper and ValidationError/NotFoundError/ConflictError classes, 16-test TDD coverage, 11 of 13 route files migrated, canonical {error, detail?} shape across full API surface via validation.ts cascade, SSE stream handlers and isClaudeAvailable 503 check preserved, update.ts and discover-github.ts deliberately skipped with documented reasons)
- **`new-user-safety.test.ts`** — automated guardrail that scans all source files for:
  - Hardcoded user paths (both decoded `C:/Users/...` and encoded `C--Users-...`)
  - Phone numbers / PII
  - User-specific project names in UI
  - Missing Claude CLI pre-checks
  - Missing cross-platform support
  - Missing env var configuration for external services

## Workflow-Framework Integration Contract

Agent CC's board reads task files created by [workflow-framework](~/dev/projects/workflow-framework), a Claude Code plugin. This is a cross-project dependency — changes to either side can break the integration.

### File Layout

Workflow-framework creates tasks at `.claude/roadmap/<milestone-dir>/<task>.md`. Our scanner (`server/scanner/task-scanner.ts`) reads all `.md` files in milestone directories, excluding `ROADMAP.md`, `MILESTONE.md`, `TASK.md`, `ARCHIVE.md`, and the `drafts/` subdirectory.

### Fields We Read (from task frontmatter)

| Field | Required | Mapped To |
|-------|----------|-----------|
| `id` | **yes** | `TaskItem.id` |
| `title` | **yes** | `TaskItem.title` |
| `status` | **yes** | `TaskItem.status` (mapped via `statusToColumn`) |
| `created` | **yes** | `TaskItem.created` |
| `updated` | **yes** | `TaskItem.updated` |
| `milestone` | no | `TaskItem.parent` |
| `dependsOn` | no | `TaskItem.dependsOn` |
| `complexity` | no | label `complexity:{value}` |
| `parallelSafe` | no | label `parallel-safe` |
| `phase` | no | label `phase:{value}` |
| `filesTouch` | no | labels `touches:{path}` |
| `sessionId` | no | `TaskItem.sessionId` |

If any required field is missing, `mapWorkflowToTaskItem` returns null and the file is counted as malformed.

### Fields We Write Back (via `updateTaskField` in `server/task-io.ts`)

When a task is moved on the board, we update the task file's frontmatter directly (preserving all workflow-specific fields). We write:
- `status` — reverse-mapped from board column to workflow status
- `updated` — set to current date

### Status Mapping

```
Workflow → Board                Board → Workflow
─────────────────               ─────────────────
pending    → queue              queue       → pending
todo       → queue              in-progress → in_progress
in_progress → in-progress       review      → review
review     → review             done        → completed
completed  → done
blocked    → in-progress
cancelled  → done
planned    → queue
ready      → queue
backlog    → queue
(unknown)  → queue
```

### Milestone Status

Milestones are synthetic — one per directory under `.claude/roadmap/`. Status is computed in priority order:
1. `MILESTONE.md` `status_override` field (highest — intentional workflow-framework behavior for manual overrides)
2. Computed from child tasks (all done → done, any in-progress → in-progress, else queue)

ROADMAP.md description is still used as static milestone metadata (body text), but its status column is **not** used for milestone status. Workflow-framework v0.5.0+ no longer keeps ROADMAP.md current on task changes (only `/status` syncs it), so reading status from it would always be stale.

### What Workflow-Framework Must Not Change Without Coordination

- **Required frontmatter fields**: `id`, `title`, `status`, `created`, `updated` — removing or renaming any of these breaks parsing
- **Status value strings**: `pending`, `in_progress`, `review`, `completed`, `blocked`, `cancelled` — new values fall through to `queue`
- **Directory structure**: `<project>/.claude/roadmap/<milestone>/<task>.md` — changing nesting or moving task files breaks discovery
- **YAML frontmatter format**: Must remain gray-matter compatible

### Key Files

- `server/scanner/task-scanner.ts` — reads workflow task files, builds milestones
- `server/task-io.ts` — writes status changes back to task files
- `server/board/aggregator.ts` — `statusToColumn()` maps workflow statuses to board columns
- `tests/workflow-bridge.test.ts` — integration tests for the bridge
- `tests/task-scanner.test.ts` — scanner unit tests

## Pre-commit Hook (PII Guard)

A git pre-commit hook runs `new-user-safety.test.ts` before every commit. If PII is detected, the commit is blocked.

The hook lives at `.git/hooks/pre-commit` (not tracked in git). If it's missing after a fresh clone, recreate it:

```bash
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/bash
echo "Running safety checks..."
cd "$(git rev-parse --show-toplevel)"
npx vitest run tests/new-user-safety.test.ts --reporter=dot 2>&1
if [ $? -ne 0 ]; then
  echo "BLOCKED: Safety test failed — personal data or hardcoded paths detected."
  exit 1
fi
HOOK
chmod +x .git/hooks/pre-commit
```
