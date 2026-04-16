# Agent CC — Development Guide

## Quick Start

```bash
npm install
npm run dev        # starts on http://localhost:5100 (hot reload)
npm run check      # TypeScript type-check (must pass before commit)
npm test           # run all tests (includes new-user-safety guard)
npm run build      # production build
```

## Architecture

Express.js backend + React frontend (TypeScript), served from a single process. Session data is read from `~/.claude/projects/` JSONL files. Persistent state stored in `~/.agent-cc/agent-cc.json`.

## Chat System

Two backends live behind a unified streaming interface:

- **Claude Code CLI** (`server/routes/chat.ts` → `runClaudeStreaming`): spawns `claude -p`, uses `--session-id` for history, writes JSONL the scanner picks up.
- **OpenAI-compatible** (`server/providers/openai-adapter.ts` → `runOpenAIStreaming`): HTTP `/v1/chat/completions`, stateless, full history-per-request.

Routing happens in `server/providers/router.ts::routeToProvider()` — looks up provider config from `db.providers`, resolves credentials (api-key direct, oauth via `getValidToken`, or none), and yields `StreamChunk` in the same shape regardless of backend.

Built-in providers: `claude-code`, `ollama` (honors `OLLAMA_URL` env). Additional providers configurable via Settings → Chat, persisted in `db.providers`. `oauthTokens`/`clientSecret`/`apiKey` stripped from wire responses.

Model discovery: `server/providers/model-discovery.ts` hits `/api/tags` (Ollama), `/v1/models` (OpenAI-compat), known set (Claude). 60s TTL cache that does NOT cache failures.

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
  providers/       # Chat provider routing (Claude CLI + OpenAI-compatible)
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

## Adding AI Features

Two paths depending on what you're building:

**Chat-style user-facing features** — add a provider via the Chat System (see above) or reuse `server/providers/router.ts`. Don't spawn `claude -p` directly for chat.

**Internal one-shot AI features** (summarization, queries, analysis) — use `claude -p`:

1. Remove `CLAUDECODE` from env: `delete env.CLAUDECODE`
2. Add `isClaudeAvailable()` check in the route handler
3. Handle errors gracefully — return 500 with descriptive message
4. Set reasonable timeouts (60s for queries, 300s for summarization)
5. Chat-originated sessions intentionally omit `--no-session-persistence` so the CLI writes JSONL that the scanner picks up. Non-chat AI features (summarization, queries) should still use `--no-session-persistence` to avoid polluting the session list.

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
| `AGENT_CC_DATA` | Data directory (holds `agent-cc.json` config store) | ~/.agent-cc |
| `NERVE_CENTER_SERVICES` | Services to monitor (name:port,name:port) | Agent CC:5100 |
| `VOICE_CALLER_SCRIPT` | Path to voice outbound caller script | (disabled) |
| `VOICE_PHONE` | Phone number for voice calls | (disabled) |
| `TELEGRAM_BOT_URL` | Telegram bot HTTP API URL | (disabled) |
| `ALLOWED_ORIGINS` | Extra CORS origins for reverse proxy (comma-separated) | (none) |
| `EXTRA_PROJECT_DIRS` | Extra project directories for scanner (comma-separated) | (none) |
| `OLLAMA_URL` | Default base URL for the built-in `ollama` provider (M11) | http://localhost:11434 |

## Tests

Tests live in `tests/*.test.ts` and run via vitest (`npm test`). For feature history and what each test wave covered, see `CHANGELOG.md` and `git log`.

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

## Hook Event Bridge

Agent CC exposes `POST /api/chat/hook-event` so Claude Code lifecycle hooks (configured in `~/.claude/settings.json`) can surface inline in the integrated chat panel as `chat-hook` InteractionEvents. The bridge is a pure event-adapter: it validates the payload, persists a `system / hook_fire` event, and broadcasts it over the active chat tab's SSE channel. Events fall back to a synthetic `hook-background` conversation when no chat tab is active.

Configure your `~/.claude/settings.json` to POST hook metadata into the bridge:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:5100/api/chat/hook-event -H 'Content-Type: application/json' -d '{\"hook\":\"PostToolUse\",\"tool\":\"${CLAUDE_TOOL_NAME}\"}'"
          }
        ]
      }
    ]
  }
}
```

The only required field is `hook` (non-empty string). Any other fields you include land in the event's `content.data` verbatim — stuff the payload with whatever context your hook command knows about.

**SECURITY WARNING — no auth.** The endpoint has no authentication. It's intended for single-user devbox usage against the default `127.0.0.1:5100` bind. **MUST NOT** be exposed to the public internet without adding an auth layer. High-frequency hooks (e.g., `PostToolUse` on every tool call) can also generate thousands of events per minute — if that becomes a problem, add a rate limiter or drop the hook matcher pattern.

Key files:
- `server/hooks-bridge.ts` — `recordHookEvent(payload)` pure module
- `server/routes/hook-bridge.ts` — HTTP surface at `/api/chat/hook-event`
- `tests/hooks-bridge.test.ts` — validation, routing, and no-subprocess guardrail

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
