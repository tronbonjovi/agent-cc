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

## Key Commands

```bash
npm run dev          # dev server with hot reload
npm run check        # TypeScript type-check (must pass before commit)
npm test             # all tests including new-user-safety checks
npm run build        # production build
```

## Deployment

There is NO docker-compose.yml in this repo. Agent CC is deployed as part of the homelab stack at `~/docker/docker-compose.yml`. After making changes:

```bash
# 1. Rsync source to Docker build context
rsync -a --delete --exclude node_modules --exclude .git --exclude dist \
  ~/dev/projects/agent-cc/ ~/docker/agent-cc/

# 2. Rebuild via the homelab compose file (the ONLY compose file)
docker compose -f ~/docker/docker-compose.yml up -d --build agent-cc
```

If Docker config changes are needed (volumes, env vars, ports), edit `~/docker/docker-compose.yml` directly. Never create a standalone compose file in this repo.

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

- **1956 unit tests** covering parsers, routes, storage, validation, scanners, task I/O, path safety, API integration
- **`new-user-safety.test.ts`** — automated guardrail that scans all source files for:
  - Hardcoded user paths (both decoded `C:/Users/...` and encoded `C--Users-...`)
  - Phone numbers / PII
  - User-specific project names in UI
  - Missing Claude CLI pre-checks
  - Missing cross-platform support
  - Missing env var configuration for external services

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
