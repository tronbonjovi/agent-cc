# Phase 0: Fork and Clean — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, fix API 404 handling, verify tests pass, and review .gitignore — getting the fork into a clean working state.

**Architecture:** This is cleanup only. We delete 4 orphaned client pages, remove 3 backward-compat route aliases from the React router, add an Express catch-all for unmatched `/api/*` requests, and verify the existing test suite runs.

**Tech Stack:** React 18, wouter (routing), Express 5, Vitest 4, TypeScript

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Delete | `client/src/pages/discovery.tsx` | Dead page — merged into Activity |
| Delete | `client/src/pages/config.tsx` | Dead page — merged into Settings |
| Delete | `client/src/pages/rules.tsx` | Dead page — orphaned, no route |
| Delete | `client/src/pages/cost-dashboard.tsx` | Dead page — duplicates stats.tsx |
| Modify | `client/src/App.tsx:73-81` | Remove 3 backward-compat routes |
| Modify | `server/routes/index.ts:78` | Add API 404 catch-all after all routers |
| Modify | `.gitignore` | Review and update if needed |

---

### Task 1: Delete Dead Pages

**Files:**
- Delete: `client/src/pages/discovery.tsx`
- Delete: `client/src/pages/config.tsx`
- Delete: `client/src/pages/rules.tsx`
- Delete: `client/src/pages/cost-dashboard.tsx`

- [ ] **Step 1: Delete the 4 orphaned page files**

```bash
rm client/src/pages/discovery.tsx
rm client/src/pages/config.tsx
rm client/src/pages/rules.tsx
rm client/src/pages/cost-dashboard.tsx
```

- [ ] **Step 2: Verify no imports reference these files**

```bash
grep -r "discovery\|config\|rules\|cost-dashboard" client/src/ --include="*.tsx" --include="*.ts" -l
```

Expected: No results referencing the deleted files. `App.tsx` has comments mentioning "Discovery" and "Config" but no imports of the deleted files. The routes on lines 73-74 and 81 reference `ActivityPage`, `SettingsPage`, and `Stats` — not the deleted files.

- [ ] **Step 3: Commit**

```bash
git add -u client/src/pages/
git commit -m "chore: remove 4 orphaned pages (discovery, config, rules, cost-dashboard)"
```

---

### Task 2: Remove Backward-Compat Route Aliases

**Files:**
- Modify: `client/src/App.tsx:73-81`

- [ ] **Step 1: Remove the 3 redirect routes from App.tsx**

In `client/src/App.tsx`, remove these three lines:

```
            <Route path="/discovery" component={ActivityPage} />
```

```
            <Route path="/config" component={SettingsPage} />
```

```
            <Route path="/costs" component={Stats} />
```

The file should go from this (lines 63-85):

```tsx
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/projects" component={Projects} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/mcps" component={MCPs} />
            <Route path="/skills" component={Skills} />
            <Route path="/plugins" component={Plugins} />
            <Route path="/markdown" component={MarkdownFiles} />
            <Route path="/markdown/:id" component={MarkdownEdit} />
            <Route path="/graph" component={GraphPage} />
            <Route path="/discovery" component={ActivityPage} />
            <Route path="/config" component={SettingsPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/agents" component={Agents} />
            <Route path="/live" component={Live} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/stats" component={Stats} />
            <Route path="/costs" component={Stats} />
            <Route path="/messages" component={MessageHistory} />
            <Route path="/apis" component={APIs} />
            <Route path="/prompts" component={Prompts} />
            <Route component={NotFound} />
          </Switch>
```

To this:

```tsx
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/projects" component={Projects} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/mcps" component={MCPs} />
            <Route path="/skills" component={Skills} />
            <Route path="/plugins" component={Plugins} />
            <Route path="/markdown" component={MarkdownFiles} />
            <Route path="/markdown/:id" component={MarkdownEdit} />
            <Route path="/graph" component={GraphPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/agents" component={Agents} />
            <Route path="/live" component={Live} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/stats" component={Stats} />
            <Route path="/messages" component={MessageHistory} />
            <Route path="/apis" component={APIs} />
            <Route path="/prompts" component={Prompts} />
            <Route component={NotFound} />
          </Switch>
```

- [ ] **Step 2: Clean up the dead-code comments at the top of App.tsx**

Remove or update lines 23-24 and 31-32 since they reference the removed routes:

```
// Discovery merged into Activity page
// Config merged into Settings page
```

```
// Rules page removed — content covered by Markdown "What Claude Loads" + individual entity pages
// Costs merged into Stats (Analytics) page
```

These comments are no longer needed — the routes are gone now.

- [ ] **Step 3: Verify the app compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "chore: remove backward-compat route aliases for /discovery, /config, /costs"
```

---

### Task 3: Fix API 404 Handling

**Files:**
- Modify: `server/routes/index.ts:78` (after all routers, before end of `registerRoutes`)
- Test: `tests/api-404.test.ts` (new)

- [ ] **Step 1: Write a failing test for the API 404 behavior**

Create `tests/api-404.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes/index";

describe("API 404 handling", () => {
  it("returns JSON 404 for unmatched /api/* routes", async () => {
    const app = express();
    app.use(express.json());
    const server = createServer(app);

    await registerRoutes(server, app);

    // Use Node's built-in fetch against a real listening server
    const port = 0; // OS picks a free port
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/nonexistent`);

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/json/);

    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });

    server.close();
  });

  it("does not intercept valid API routes", async () => {
    const app = express();
    app.use(express.json());
    const server = createServer(app);

    await registerRoutes(server, app);

    const port = 0;
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");

    server.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/api-404.test.ts
```

Expected: First test FAILS — `/api/nonexistent` currently has no handler (the catch-all is in static.ts/vite.ts, not registered during testing).

Note: The test may error differently (404 with no body, or connection refused). Either way, the assertion `expect(body).toEqual({ error: "Not found" })` should fail.

- [ ] **Step 3: Add the API 404 catch-all to server/routes/index.ts**

In `server/routes/index.ts`, add the catch-all inside `registerRoutes()`, after the `app.post("/api/actions/open-file", handleOpen);` line (line 87) and before the closing `}` of the function:

```typescript
  // Catch-all for unmatched API routes — must be after all API routers
  // but before the SPA catch-all in static.ts/vite.ts
  app.use("/api/{*path}", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
```

The end of `registerRoutes()` should look like:

```typescript
  app.post("/api/actions/open-folder", handleOpen);
  app.post("/api/actions/open-file", handleOpen);

  // Catch-all for unmatched API routes — must be after all API routers
  // but before the SPA catch-all in static.ts/vite.ts
  app.use("/api/{*path}", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/api-404.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/api-404.test.ts server/routes/index.ts
git commit -m "fix: return JSON 404 for unmatched API routes instead of HTML"
```

---

### Task 4: Verify Existing Test Suite

**Files:**
- None modified — just running existing tests

- [ ] **Step 1: Install dependencies**

```bash
npm install
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: All 9 existing test files + our new `api-404.test.ts` pass. If any fail, diagnose and fix before proceeding.

- [ ] **Step 3: If any tests fail, fix them**

Common issues to look for:
- Stale file paths (tests reference files that moved)
- Missing environment setup (tests need specific env vars)
- Import path issues (`@shared` alias may not resolve)

Fix any failures and re-run until green.

- [ ] **Step 4: Commit any test fixes (only if changes were needed)**

```bash
git add -A
git commit -m "fix: repair broken tests from upstream"
```

Skip this step if all tests passed without changes.

---

### Task 5: Review and Update .gitignore

**Files:**
- Modify: `.gitignore` (if needed)

- [ ] **Step 1: Check git status for untracked files that should be ignored**

```bash
git status
```

Look for files that shouldn't be tracked:
- `.claude/` project config files (these are local to each developer)
- Any `.env` files (already covered)
- Any editor-specific files not already covered

- [ ] **Step 2: Update .gitignore if needed**

The current `.gitignore` already covers: `node_modules/`, `dist/`, `data/`, `.env`, `.DS_Store`, editor files, `*.log`, `*.tmp`, `docs/screenshots/`.

If `.claude/` needs to be ignored (it's user-specific config), add it. Otherwise, no changes needed.

- [ ] **Step 3: Commit if changes were made**

```bash
git add .gitignore
git commit -m "chore: update .gitignore for fork-specific needs"
```

Skip this step if no changes were needed.

---

### Task 6: Final Verification

- [ ] **Step 1: Run the full test suite one more time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Start the dev server and verify it works**

```bash
npm run dev
```

Expected: Server starts on port 5100 without errors. Verify in browser:
- Dashboard loads at `http://localhost:5100`
- `/discovery`, `/config`, `/costs` all show the NotFound page
- Navigation works for remaining pages

- [ ] **Step 3: Test the API 404 fix**

```bash
curl -s http://localhost:5100/api/nonexistent | head
```

Expected: `{"error":"Not found"}`

- [ ] **Step 4: Push to origin**

```bash
git push origin main
```
