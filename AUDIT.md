# Claude Command Center — Deep Audit Report

**Date:** 2026-04-02
**Source:** sorlen008/claude-command-center v1.21.6 (commit 2026-03-25)
**Method:** Code review (server + client) + live API testing on port 5100

---

## TL;DR

The API layer is solid — 40+ endpoints, most return rich data correctly. The **Live View** is genuinely well-built. The biggest problems are: (1) project discovery doesn't find projects outside default paths, (2) several UI pages are half-implemented or redundant, (3) no test suite despite vitest being configured, and (4) scattered bugs in session/agent status tracking.

---

## What Works Well

### Live View (server + client)
- Detects active sessions by reading `~/.claude/sessions/*.json`
- 3-second polling with status classification (thinking/waiting/idle/stale)
- Context usage bars, model info, duration, message count, cost estimates
- Pin sessions, copy resume commands — genuinely useful UX
- Educational "Context & Session Tips" guide explaining compression and model limits

### Session Intelligence
- Deep search across all JSONL session content works
- Cost analytics: $133.85 total tracked, breakdown by project/model/day
- File heatmap showing which files were touched across sessions
- Health scoring (tool errors, retry patterns)
- Session pinning, notes, bulk delete with undo

### Entity Scanner
- Discovers 142+ entities (MCPs, skills, plugins, markdown files) with zero config
- 35ms scan time — fast
- SSE stream for scan events
- MCP secret redaction (env vars with "secret", "password", "token", "key")

### API Layer
- Express with Zod validation on all inputs
- Consistent error handling and response format
- Session ID format enforcement (UUID regex)
- Path validation (must be under home directory)

### Graph Visualization
- 6 view modes (graph, tiles, tree, list, radial, matrix)
- Hover highlighting via CSS injection (avoids React re-renders — smart)
- BFS traversal for connected path highlighting
- 13 edge types with dynamic legend

---

## What's Broken or Half-Baked

### Critical: Project Discovery Doesn't Work

**Problem:** Projects page returns empty. The scanner only looks in:
- `~/` direct children
- Children of hardcoded container dirs: `projects`, `repos`, `src`, `code`, `dev`, `workspace`, etc.

**Root cause:** `server/scanner/utils.ts:96-172` — `PROJECT_CONTAINER_NAMES` is hardcoded. If your projects are in `~/dev/projects/` it *should* find them (since `dev` is in the list), but the discovery requires specific "markers" (CLAUDE.md, .mcp.json, .git, package.json, etc.). The "add extra paths" settings feature exists but doesn't seem to trigger a rescan properly.

**Fix:** Debug why `~/dev/projects/pii-washer` etc. aren't being found. Likely the settings to rescan pipeline is broken.

### Session Status Mismatches

**Problem:** Live View shows "24 agents today, 0 models used" while also showing 1 active session. The top bar stats don't match the session cards below.

**Root cause:** Multiple issues:
- `session-scanner.ts:253` — marks sessions "active" if `.json` file exists in `~/.claude/sessions/`, but crashed sessions leave stale `.json` files
- `live-scanner.ts:73-85` — `findSessionFile()` only does exact ID match. When Claude Code compacts context (creates new session ID), the `.json` metadata still references the old ID, so it shows "no history" even though data exists
- Stats counters pull from different caches that refresh at different intervals (30s scan vs 3s live poll)

### Pages That Are Redundant or Broken

| Page | Issue |
|------|-------|
| **Discovery** (197 lines) | Merged into Activity page, but still routable separately |
| **Config** (173 lines) | Just redirects to Settings |
| **Rules** (375 lines) | Not linked in nav, functionality unclear |
| **Cost Dashboard** (482 lines) | Overlaps heavily with Sessions Analytics tab |
| **Stats** (572 lines) | Another cost/usage page with redundant data |

### API 404 Handling Broken

Non-existent API routes (e.g., `/api/nonexistent`) return HTML (Vite's frontend) instead of JSON 404. The Vite dev server catch-all is swallowing Express 404s.

### No Test Suite

`vitest.config.ts` exists. `tests/` directory exists. But no evidence of actual test files in the commit history. This is a ~17,000-line codebase with zero tests.

### Missing Toast/Notification System

No toast library (no react-toastify, sonner). Async operations (delete, save, rescan) give no visual feedback. User has to guess if actions succeeded.

---

## Security Concerns

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| Path traversal via symlinks | Medium | `routes/agents.ts:65` | Use `realpath()` after validation |
| MCP secret redaction is case-sensitive | Low | `mcp-scanner.ts:189` | Use case-insensitive regex |
| Session trash stored in `/tmp/` | Low | `config.ts:5` | Move to `~/.claude-command-center/trash/` |
| Unsafe inline style injection | Low | `graph.tsx:551` | Replace with CSS class injection |
| GitHub token could leak in logs | Low | `discovery.ts:28` | Ensure Authorization header excluded from logs |

None of these are exploitable in the local-only context, but worth fixing for good hygiene.

---

## Architecture Overview

```
client/                    # React 18 + Vite 7 + TypeScript
  src/
    pages/          (23 pages, ~11,000 lines — several redundant)
    components/     (40+ components — Radix UI + custom)
    hooks/          (15+ hooks — React Query pattern)
    lib/            (query client, utils)

server/                    # Express 5 + TypeScript
  routes/           (API endpoints — well-structured)
  scanner/          (project, session, MCP, live scanners)
  db.ts             (JSON file database with debounced writes)
  storage.ts        (abstraction over db)

shared/                    # Shared TypeScript types
  types.ts          (450+ lines — well-structured)
```

**Key dependencies:** React Query (server state), wouter (routing), Radix UI (headless components), @xyflow/react (graph), @uiw/react-md-editor (markdown editor), dagre (graph layout), Zod (validation), chokidar (file watching)

---

## Roadmap: Our Fork

### Phase 0: Fork and Clean — DONE

- [x] Fork on GitHub
- [x] Remove dead pages (discovery.tsx, config.tsx, rules.tsx)
- [x] Consolidate cost pages (stats + cost-dashboard into one page)
- [x] Add .gitignore for our needs
- [x] Set up vitest with at least 1 smoke test
- [x] Fix API 404 handling (Express catch-all before Vite)

### Phase 1: Fix What's Broken — DONE

- [x] **Fix project discovery** — debug why extra paths don't trigger rescan, verify marker detection
- [x] **Fix session status mismatches** — implement `findSessionFile()` fallback for compacted sessions
- [x] **Fix stale active sessions** — validate PIDs against running processes, not just file existence
- [x] **Fix Live View stats** — ensure agent count, model, and spend pull from same data source
- [x] **Add toast notifications** — install sonner or react-hot-toast, wire into mutations
- [x] **Fix trash location** — move from `/tmp/` to `~/.claude-command-center/trash/`

### Phase 2: Harden — DONE

- [x] Add tests for scanner modules (project, session, MCP, deep-search, 7 import tests)
- [x] Add tests for API endpoints (16 integration tests with native fetch)
- [x] Fix path traversal — `validateSafePath()` with `fs.promises.realpath`, applied to all routes
- [x] Fix MCP secret redaction — `shouldRedactEnvVar()` with false-positive protection + connection string redaction
- [x] Add error boundaries — per-page `<ErrorBoundary pageName="...">` with reset on all 18 routes
- [x] Improve deep search — 300ms debounce, loading spinner, error/empty states
- [x] Security review fixes — Windows shell injection, delete path validation, Telegram env var, upstream URL cleanup

### Phase 3: Make It Ours (Next)

- [ ] **Docker image** — containerize for local dev stack (user's top priority)
- [ ] Redesign Dashboard with the stats that actually matter (from evaluation notes)
- [ ] Improve project page — per-project health, recent sessions, quick actions
- [ ] Improve MCP page — enable/disable, test connectivity, edit configs
- [ ] Add features from "wish list" (from EVALUATION-GUIDE.md)

---

## Files to Focus On First

These are the highest-impact files for understanding and fixing the codebase:

| File | Why |
|------|-----|
| `server/scanner/utils.ts` | Project discovery logic — root of the "no projects found" bug |
| `server/scanner/live-scanner.ts` | Live View data — the best feature, but has session continuation bug |
| `server/scanner/session-scanner.ts` | Session parsing, active status detection |
| `server/routes/index.ts` | API routing — 404 handling fix goes here |
| `client/src/pages/live.tsx` | The best UI page — understand this first |
| `client/src/pages/sessions.tsx` | Largest page (1,916 lines) — needs the most cleanup |
| `shared/types.ts` | All TypeScript types — read this to understand the data model |

---

## Next Steps

1. Review this audit and the EVALUATION-GUIDE.md notes
2. Decide: fork on GitHub now, or keep evaluating?
3. When ready, start a session with: *"Let's start Phase 0 — fork and clean up the command center"*
