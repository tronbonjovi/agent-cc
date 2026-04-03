# Phase 0: Fork and Clean

**Date:** 2026-04-03
**Status:** Approved
**Context:** We forked sorlen008/claude-command-center (v1.21.6) to tronbonjovi/claude-command-center. This spec covers the initial cleanup before any feature work begins.

---

## Goal

Remove dead code, fix broken fundamentals, and verify the test suite runs. No new features — just get the fork into a clean working state.

---

## 1. Delete Dead Pages

Four client pages are orphaned — no nav links, no meaningful routes. Remove them and clean up backward-compat route aliases.

**Files to delete:**

| File | Lines | Why |
|------|-------|-----|
| `client/src/pages/discovery.tsx` | 197 | Merged into Activity page |
| `client/src/pages/config.tsx` | 173 | Merged into Settings page |
| `client/src/pages/rules.tsx` | 375 | No route, no nav link, fully orphaned |
| `client/src/pages/cost-dashboard.tsx` | 482 | Duplicates stats.tsx Costs tab, never routed |

**Route cleanup in `client/src/App.tsx`:**
- Remove `/discovery` redirect route (line ~73)
- Remove `/config` redirect route (line ~74)
- Remove `/costs` redirect route (line ~81)
- Keep `/*` NotFound catch-all

**No nav changes needed** — none of these pages have sidebar links in `layout.tsx`.

**Verification:** App compiles, no broken imports, all remaining routes resolve.

---

## 2. Fix API 404 Handling

**Problem:** `server/static.ts` (production) and `server/vite.ts` (dev) both have a `/{*path}` catch-all that returns `index.html` for all unmatched routes — including `/api/*` requests. Hitting `/api/nonexistent` returns HTML instead of JSON.

**Fix:** Add an API-specific catch-all in `server/routes/index.ts`, after all API routers are registered but before the SPA catch-all:

```typescript
app.use("/api/{*path}", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
```

**Verification:** `curl http://localhost:5100/api/nonexistent` returns `{"error":"Not found"}` with status 404.

---

## 3. Verify Existing Tests

The codebase has 9 test files in `tests/` (~73K) covering backend scanners, API routes, parsers, and storage. Vitest is configured.

**Action:**
- Run `npm install` then `npx vitest run`
- If tests pass: done
- If tests fail: fix what's broken (likely stale paths or missing fixtures)
- No new tests in Phase 0 — that's Phase 2

**Verification:** `npx vitest run` exits 0.

---

## 4. Review .gitignore

Check the upstream `.gitignore` covers our needs. Ensure:
- `AUDIT.md` and `EVALUATION-GUIDE.md` are tracked (our docs)
- `.claude/` project config handling is appropriate
- No sensitive files (`.env`, credentials) are at risk of being committed

**Verification:** `git status` shows only intentional untracked files.

---

## Out of Scope (Deferred)

| Item | Deferred To |
|------|-------------|
| Toast/notification system (sonner) | Phase 1 |
| Fix project discovery | Phase 1 |
| Fix session status mismatches | Phase 1 |
| Fix stale active sessions | Phase 1 |
| Fix Live View stats | Phase 1 |
| Fix trash location (`/tmp/` issue) | Phase 1 |
| New tests for scanners/API | Phase 2 |
| Path traversal fix | Phase 2 |
| MCP secret redaction fix | Phase 2 |

---

## Success Criteria

- [ ] 4 dead page files deleted
- [ ] 3 backward-compat routes removed from App.tsx
- [ ] App compiles and runs without errors
- [ ] `/api/nonexistent` returns JSON 404, not HTML
- [ ] `npx vitest run` passes
- [ ] `.gitignore` reviewed and updated if needed
- [ ] All changes committed to fork
