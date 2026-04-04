# Phase 2: Harden — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Depends on:** Phase 0 (done), Phase 1 (done), Security pass (done)

---

## Goal

Harden the Command Center against real-world edge cases: path traversal, secret leakage, component crashes, search UX gaps, and untested code paths. Ship with confidence that the app doesn't leak data, crash silently, or break under unexpected input.

---

## Execution Strategy

4 parallel workstreams grouped by file ownership to eliminate merge conflicts. Each stream owns its code changes AND tests — no stream tests code that another stream is modifying.

| Stream | Scope | Files Owned |
|--------|-------|-------------|
| **A: Path Safety** | Shared path validator + route hardening + API route tests | `server/routes/validation.ts`, `server/routes/*.ts`, new test files |
| **B: Secret Redaction** | Expand MCP env var redaction + scanner tests | `server/scanner/mcp-scanner.ts`, new test files |
| **C: Error Boundaries** | Per-page error boundaries with useful fallback UI | `client/src/components/error-boundary.tsx`, `client/src/App.tsx` |
| **D: Deep Search UX + Scanner Coverage** | Debounce, loading states + tests for 9 untested scanners | `client/src/hooks/`, `client/src/pages/sessions.tsx`, new test files |

---

## Stream A: Path Safety

### Problem

Path validation exists (`validateMarkdownPath()` in `validation.ts`) but is inconsistently applied. Uses `path.resolve()` which doesn't follow symlinks. Some routes read paths without any validation:

- `agents.ts:46` — reads `def.filePath` without validation
- `sessions.ts:562` — file read without path check
- `projects.ts` — reads multiple JSON files without validation

### Solution

1. **Create `validateSafePath(inputPath: string): string | null`** in `validation.ts`
   - Resolve with `fs.realpath()` to follow symlinks
   - Reject paths outside `os.homedir()` and `/tmp`
   - Reject null bytes, encoded traversal sequences
   - Return resolved path or null on failure

2. **Replace all ad-hoc path checks** with `validateSafePath()`
   - `agents.ts` — validate before read (line 46) and write (line 65)
   - `sessions.ts` — validate before file read (line 562)
   - `projects.ts` — validate computed paths
   - `markdown.ts` — replace `validateMarkdownPath()` calls

3. **Deprecate `validateMarkdownPath()`** — redirect to `validateSafePath()`

### Tests

Attack-vector tests (these must prove the exploit is blocked, not just that code exists):

- `../../etc/passwd` traversal
- Symlink pointing outside home directory
- Null byte injection (`path%00.json`)
- URL-encoded traversal (`%2e%2e%2f`)
- Valid paths still work (positive cases)

Supertest integration tests for routes that accept paths:

- `GET /api/sessions/:id` — valid and invalid IDs
- `PUT /api/agents` — path traversal in body
- `GET /api/markdown/search` — path in query params
- Confirm 400/403 response on traversal attempts

---

## Stream B: Secret Redaction

### Problem

MCP scanner redacts env vars matching `secret`, `password`, `token`, `key` — but misses common patterns:

- `DATABASE_URL` — the most common secret in .env files
- `CONNECTION_STRING` — Azure/general pattern
- `MONGO_URI`, `POSTGRES_URI`, `REDIS_URL` — database connection strings
- `AWS_SECRET_ACCESS_KEY` — matched by "secret", but `AWS_ACCESS_KEY_ID` is not sensitive
- `CREDENTIALS`, `AUTH_TOKEN` — missed

Additionally, database connection strings containing credentials are extracted and displayed raw (lines 27-76 of mcp-scanner.ts).

### Solution

1. **Expand keyword list:**
   ```
   Existing: secret, password, token, key
   Add: credential, auth, database_url, connection_string,
        mongo_uri, postgres_uri, redis_url, mysql_uri,
        private_key, api_key, webhook
   ```

2. **Add prefix matching:**
   ```
   AWS_, STRIPE_, GITHUB_TOKEN, OPENAI_, ANTHROPIC_
   ```

3. **Redact credentials in database URLs:**
   - Parse connection strings, redact username:password portion
   - Display host/port/database but not credentials
   - Pattern: `protocol://[REDACTED]@host:port/db`

4. **False positive protection:**
   - `KEYBOARD_LAYOUT`, `KEY_BINDING`, `TOKEN_LIMIT` should NOT be redacted
   - Short keywords (`key`, `token`) use word-boundary matching: redact when the keyword is a standalone word or suffix after `_` (e.g., `API_KEY` yes, `KEYBOARD` no; `AUTH_TOKEN` yes, `TOKEN_LIMIT` no)
   - Longer keywords (`password`, `secret`, `credential`, `database_url`, `connection_string`) match anywhere — false positive risk is negligible

### Tests

- Real-world env var names: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `MONGO_URI`
- Mixed case: `Database_Url`, `database_url`, `DATABASE_URL`
- False positives: `KEYBOARD_LAYOUT`, `TOKEN_LIMIT`, `KEY_REPEAT_RATE`
- Connection string redaction: `postgres://user:pass@host:5432/db` → `postgres://[REDACTED]@host:5432/db`
- Empty/null values don't crash
- Non-string values handled gracefully

### Scanner Tests (bundled in this stream)

Tests for `mcp-scanner.ts` specifically:

- Discovers `.mcp.json` files in expected locations
- Parses valid MCP configurations
- Handles malformed JSON gracefully
- Redaction applied correctly (covered by above tests)
- Entity output matches expected shape

---

## Stream C: Error Boundaries

### Problem

Single global `<ErrorBoundary>` wraps all routes. If any component throws, the entire app shows a generic error. No way to know which page crashed. No retry without full page reload.

### Solution

1. **Per-page boundaries in `App.tsx`:**
   - Wrap each `<Route>` / lazy-loaded page in its own `<ErrorBoundary>`
   - Pass page name as prop for error context

2. **Improve fallback UI:**
   - Show which page/section crashed
   - "Try Again" button that resets the boundary state (re-renders the page)
   - "Back to Dashboard" link as escape hatch
   - Keep console.error logging (no remote reporting — local-only app)

3. **Keep global boundary as last resort:**
   - Catches layout-level or provider-level errors
   - Shows full-page error with reload button

### Implementation Notes

- ErrorBoundary already exists at `client/src/components/error-boundary.tsx`
- Accepts `children` — just needs a `pageName` prop and per-route wrapping
- No new dependencies needed
- No tests for React error boundaries (class component lifecycle — hard to unit test meaningfully, verified by visual inspection during smoke test)

---

## Stream D: Deep Search UX + Scanner Coverage

### Deep Search Problem

No explicit debounce on search input — relies on React Query's implicit key-change behavior. No loading indicator while searching. No empty-state or error-state UI.

### Deep Search Solution

1. **Add `useDebouncedValue(value, delayMs)` hook:**
   - Simple hook using `useState` + `useEffect` with `setTimeout`
   - 300ms default delay
   - Place in `client/src/hooks/use-debounce.ts`

2. **Wire into sessions search:**
   - `useDeepSearch()` receives debounced query value
   - Show spinner while `isLoading`
   - Show "No results found" when data is empty array
   - Show error message when `isError`

### Scanner Coverage Problem

9 of 11 scanners have zero tests: agent, config, graph-config, live, markdown, plugin, project, skill, deep-search.

### Scanner Coverage Solution

Write tests for each untested scanner following established patterns:

- Temp directory setup/teardown
- Create realistic fixture files (`.mcp.json`, `CLAUDE.md`, `package.json`, etc.)
- Test happy path: scanner finds and parses expected entities
- Test error cases: malformed files, missing directories, empty inputs
- Test edge cases: very large files, unicode, special characters in paths

**Priority order** (by risk/impact):
1. `project-scanner.ts` — core feature, complex discovery logic
2. `live-scanner.ts` — real-time data, hardest to test manually
3. `deep-search.ts` — text search across JSONL files
4. `markdown-scanner.ts` — file parsing
5. `skill-scanner.ts` — plugin ecosystem
6. `plugin-scanner.ts` — plugin ecosystem
7. `agent-scanner.ts` — agent discovery
8. `config-scanner.ts` — config parsing
9. `graph-config-scanner.ts` — graph layout config

---

## Execution Pipeline

```
1. BASELINE
   └─ npm test → lock in current passing count (~1350 tests)

2. EXECUTE (parallel)
   ├─ Stream A: Path Safety        [worktree]
   ├─ Stream B: Secret Redaction   [worktree]
   ├─ Stream C: Error Boundaries   [worktree]
   └─ Stream D: Deep Search + Scanners [worktree]

3. CODEX REVIEW
   └─ Each stream reviewed by Codex before merge
      Focus: correctness, no fake fixes, no regressions

4. MERGE (sequential)
   └─ Land each stream one at a time
      Run full test suite after each merge

5. INTEGRATION
   ├─ npm test (full suite)
   ├─ npm run check (TypeScript)
   └─ new-user-safety.test.ts (PII guard)

6. SMOKE TEST (SSH-compatible)
   ├─ curl API endpoints with traversal payloads → confirm 400/403
   ├─ curl /api/entities → confirm secrets redacted
   ├─ curl /api/sessions/search?q=test → confirm search works
   └─ Start dev server, hit key pages via curl, confirm 200s
```

### Smoke Test Notes

User SSHs from Windows PC to the Linux devbox. All smoke testing must be terminal-compatible:

- `curl` for API verification
- `npm test` / `npm run check` for automated checks
- No browser-dependent testing steps
- Port-forward or direct IP access to `localhost:5100` for manual spot checks if needed

---

## Out of Scope

- **Docker deployment** — Phase 3, first item. Harden before containerize.
- **Dashboard redesign** — Phase 3.
- **Remote error reporting** — unnecessary for local-only tool.
- **Client-side component tests** — React error boundaries are class components; meaningful testing is via integration, not unit tests.
- **Rate limiting / auth** — single-user localhost app, CORS already mitigates CSRF.

---

## Success Criteria

- [ ] All traversal attack vectors return 400/403 (verified by test AND curl)
- [ ] `DATABASE_URL`, `CONNECTION_STRING`, and credential-bearing URLs are redacted
- [ ] `KEYBOARD_LAYOUT` and similar false positives are NOT redacted
- [ ] Each page has its own error boundary with retry capability
- [ ] Deep search has visible loading, empty, and error states
- [ ] 9 previously-untested scanners have test coverage
- [ ] Key API routes have supertest integration tests
- [ ] Total test count increases (target: 1500+)
- [ ] `npm test` passes, `npm run check` passes, `new-user-safety.test.ts` passes
- [ ] No new PII, hardcoded paths, or user-specific strings introduced
