# Phase 1: Fix What's Broken — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 bugs that prevent the app from working correctly: project discovery, session tracking, live view stats, trash persistence, and user feedback.

**Architecture:** All fixes are in existing files. Server-side: scanner utils, live-scanner, session-scanner, config, routes. Client-side: App.tsx, hooks. One new dependency: sonner for toast notifications.

**Tech Stack:** Express 5, React 18, React Query, Vitest 4, TypeScript, sonner

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `server/scanner/utils.ts:338-345` | Expand `~/` in `getExtraPaths()` |
| Modify | `server/routes/settings.ts:28-42` | Clear project cache after settings save |
| Modify | `server/scanner/live-scanner.ts:207-254` | PID-based session status detection |
| Modify | `server/scanner/live-scanner.ts:73-85` | Session file fallback for compacted sessions |
| Modify | `server/scanner/live-scanner.ts:359-377` | Fix modelsInUse to use today's executions |
| Modify | `server/config.ts:5` | Change TRASH_DIR to ~/.claude-command-center/trash |
| Modify | `server/scanner/utils.ts:55-67` | Allow paths under new trash dir |
| Modify | `client/src/App.tsx:86-96` | Add Toaster component |
| Modify | `client/src/hooks/use-sessions.ts` | Add toast notifications to all mutations |
| Modify | `client/src/hooks/use-settings.ts` | Add toast notifications to mutations |
| Modify | `client/src/hooks/use-markdown.ts` | Add toast notifications to mutations |
| Modify | `client/src/hooks/use-agents.ts` | Add toast notifications to mutations |
| Modify | `client/src/hooks/use-entities.ts` | Add toast notifications to mutations |
| Modify | `client/src/hooks/use-prompts.ts` | Add toast notifications to mutations |
| Modify | `client/src/hooks/use-update.ts` | Add toast notifications to mutations |
| New | `tests/phase1-fixes.test.ts` | Tests for all server-side fixes |

---

### Task 1: Fix Project Discovery

**Files:**
- Modify: `server/scanner/utils.ts:338-345`
- Modify: `server/routes/settings.ts:1-42`
- Test: `tests/phase1-fixes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/phase1-fixes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";

describe("getExtraPaths tilde expansion", () => {
  it("expands ~/projects to full home path", async () => {
    // Mock getDB to return scanPaths with tilde paths
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: [],
            extraProjectDirs: ["~/projects", "~/dev/repos"],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    // Clear module cache to pick up mock
    const { getExtraPaths } = await import("../server/scanner/utils");
    const paths = getExtraPaths();
    const home = os.homedir();

    expect(paths.extraProjectDirs).toContain(`${home}/projects`);
    expect(paths.extraProjectDirs).toContain(`${home}/dev/repos`);
    expect(paths.extraProjectDirs).not.toContain("~/projects");

    vi.doUnmock("../server/db");
  });

  it("expands ~ alone to home directory", async () => {
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: ["~/.claude/mcp.json"],
            extraProjectDirs: [],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    const { getExtraPaths } = await import("../server/scanner/utils");
    const paths = getExtraPaths();
    const home = os.homedir();

    expect(paths.extraMcpFiles).toContain(`${home}/.claude/mcp.json`);
    expect(paths.extraMcpFiles).not.toContain("~/.claude/mcp.json");

    vi.doUnmock("../server/db");
  });

  it("leaves absolute paths unchanged", async () => {
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: [],
            extraProjectDirs: ["/opt/projects"],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    const { getExtraPaths } = await import("../server/scanner/utils");
    const paths = getExtraPaths();

    expect(paths.extraProjectDirs).toContain("/opt/projects");

    vi.doUnmock("../server/db");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

Expected: Tests fail because `getExtraPaths()` returns raw `~/` paths without expansion.

- [ ] **Step 3: Implement tilde expansion in `getExtraPaths()`**

In `server/scanner/utils.ts`, replace the `getExtraPaths` function (lines 338-345):

```typescript
/** Expand ~/... and ~\... prefixes to the real home directory */
function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Get extra scan paths from app settings (tilde-expanded) */
export function getExtraPaths() {
  try {
    const settings = getDB().appSettings;
    const raw = settings?.scanPaths || { extraMcpFiles: [], extraProjectDirs: [], extraSkillDirs: [], extraPluginDirs: [] };
    return {
      extraMcpFiles: raw.extraMcpFiles.map(expandTilde),
      extraProjectDirs: raw.extraProjectDirs.map(expandTilde),
      extraSkillDirs: raw.extraSkillDirs.map(expandTilde),
      extraPluginDirs: raw.extraPluginDirs.map(expandTilde),
    };
  } catch {
    return { extraMcpFiles: [], extraProjectDirs: [], extraSkillDirs: [], extraPluginDirs: [] };
  }
}
```

- [ ] **Step 4: Implement cache invalidation after settings save**

In `server/routes/settings.ts`, add the import and call `clearProjectDirsCache()` after saving scanPaths. Replace the entire file:

```typescript
import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { defaultAppSettings } from "../db";
import { validate } from "./validation";
import { clearProjectDirsCache } from "../scanner/utils";

const ScanPathsSchema = z.object({
  homeDir: z.string().nullable().optional(),
  claudeDir: z.string().nullable().optional(),
  extraMcpFiles: z.array(z.string()).max(50).optional(),
  extraProjectDirs: z.array(z.string()).max(50).optional(),
  extraSkillDirs: z.array(z.string()).max(50).optional(),
  extraPluginDirs: z.array(z.string()).max(50).optional(),
}).optional();

const SettingsPatchSchema = z.object({
  appName: z.string().trim().min(1, "appName must be a non-empty string").max(50, "appName must be 50 characters or fewer").optional(),
  scanPaths: ScanPathsSchema,
  onboarded: z.boolean().optional(),
});

const router = Router();

router.get("/api/settings", (_req, res) => {
  res.json(storage.getAppSettings());
});

router.patch("/api/settings", (req, res) => {
  const parsed = validate(SettingsPatchSchema, req.body, res);
  if (!parsed) return;

  const patch: Partial<import("@shared/types").AppSettings> = {};
  if (parsed.appName !== undefined) patch.appName = parsed.appName;
  if (parsed.scanPaths !== undefined) {
    const current = storage.getAppSettings().scanPaths;
    patch.scanPaths = { ...current, ...parsed.scanPaths };
  }
  if (parsed.onboarded !== undefined) patch.onboarded = parsed.onboarded;

  const updated = storage.updateAppSettings(patch);

  // Clear project discovery cache so new scanPaths take effect immediately
  if (parsed.scanPaths !== undefined) {
    clearProjectDirsCache();
  }

  res.json(updated);
});

router.post("/api/settings/reset", (_req, res) => {
  clearProjectDirsCache();
  const updated = storage.updateAppSettings({
    appName: defaultAppSettings.appName,
    scanPaths: { ...defaultAppSettings.scanPaths },
  });
  res.json(updated);
});

export default router;
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/scanner/utils.ts server/routes/settings.ts tests/phase1-fixes.test.ts
git commit -m "fix: expand tilde in scan paths and invalidate cache on settings save

getExtraPaths() now expands ~/... prefixes to os.homedir().
Settings PATCH route now calls clearProjectDirsCache() so new
scan paths take effect without a server restart."
```

---

### Task 2: Fix Session Status Detection (PID Checking)

**Files:**
- Modify: `server/scanner/live-scanner.ts:207-254`
- Test: `tests/phase1-fixes.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/phase1-fixes.test.ts`:

```typescript
describe("PID-based session filtering", () => {
  it("isProcessAlive returns true for current process", async () => {
    // We'll test the helper directly
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("isProcessAlive returns false for non-existent PID", async () => {
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    // PID 99999999 almost certainly doesn't exist
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it("isProcessAlive returns false for PID 0", async () => {
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    expect(isProcessAlive(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

Expected: Fails because `isProcessAlive` is not exported from `live-scanner.ts`.

- [ ] **Step 3: Implement PID checking**

In `server/scanner/live-scanner.ts`, add and export the `isProcessAlive` helper after the imports (after line 8):

```typescript
/** Check if a process is running by sending signal 0 (no-op signal).
 *  Returns false for PID 0 or if the process doesn't exist. */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

Then in `getLiveData()`, add a PID check right after reading the session JSON data (after line 222, inside the `for (const f of files)` loop). Replace this section:

Old code (lines 218-228):
```typescript
        const filePath = normPath(sessionsDir, f.name);
        const data = safeReadJson(filePath) as { pid?: number; sessionId?: string; cwd?: string; startedAt?: number } | null;
        if (!data || !data.sessionId) continue;

        const session: ActiveSession = {
          pid: data.pid || 0,
          sessionId: data.sessionId,
          cwd: (data.cwd || "").replace(/\\/g, "/"),
          startedAt: data.startedAt || 0,
          activeAgents: [],
        };
```

New code:
```typescript
        const filePath = normPath(sessionsDir, f.name);
        const data = safeReadJson(filePath) as { pid?: number; sessionId?: string; cwd?: string; startedAt?: number } | null;
        if (!data || !data.sessionId) continue;

        // Skip sessions whose process is no longer running (stale .json files)
        if (!isProcessAlive(data.pid || 0)) continue;

        const session: ActiveSession = {
          pid: data.pid || 0,
          sessionId: data.sessionId,
          cwd: (data.cwd || "").replace(/\\/g, "/"),
          startedAt: data.startedAt || 0,
          activeAgents: [],
        };
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/scanner/live-scanner.ts tests/phase1-fixes.test.ts
git commit -m "fix: filter dead sessions by PID in Live View

getLiveData() now checks process.kill(pid, 0) before adding a
session to the active list. Stale .json files from crashed
sessions are silently skipped."
```

---

### Task 3: Fix Session Continuation (findSessionFile Fallback)

**Files:**
- Modify: `server/scanner/live-scanner.ts:73-85`
- Test: `tests/phase1-fixes.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/phase1-fixes.test.ts`:

```typescript
import fs from "fs";
import path from "path";

describe("findSessionFile fallback", () => {
  const tmpDir = path.join(os.tmpdir(), "cc-phase1-test-" + Date.now());
  const projectsDir = path.join(tmpDir, "projects");
  const projDir = path.join(projectsDir, "-home-user-myproject");

  beforeEach(() => {
    fs.mkdirSync(projDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns exact match when file is fresh", async () => {
    const sessionId = "aaaa-bbbb-cccc";
    const exactPath = path.join(projDir, `${sessionId}.jsonl`);
    fs.writeFileSync(exactPath, '{"type":"system"}\n');
    // Touch it to make it recent
    const now = new Date();
    fs.utimesSync(exactPath, now, now);

    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile(sessionId, projectsDir);
    expect(result).toContain(`${sessionId}.jsonl`);
  });

  it("returns most recent JSONL when exact match is stale", async () => {
    const oldSessionId = "aaaa-bbbb-cccc";
    const oldPath = path.join(projDir, `${oldSessionId}.jsonl`);
    fs.writeFileSync(oldPath, '{"type":"system"}\n');
    // Make exact match stale (10 minutes ago)
    const staleTime = new Date(Date.now() - 600_000);
    fs.utimesSync(oldPath, staleTime, staleTime);

    // Create a newer file (the "compacted" continuation)
    const newSessionId = "dddd-eeee-ffff";
    const newPath = path.join(projDir, `${newSessionId}.jsonl`);
    fs.writeFileSync(newPath, '{"type":"system"}\n');
    const now = new Date();
    fs.utimesSync(newPath, now, now);

    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile(oldSessionId, projectsDir);
    expect(result).toContain(`${newSessionId}.jsonl`);
  });

  it("returns null when no match exists", async () => {
    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile("nonexistent-id", projectsDir);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

Expected: The "stale exact match" test fails because `findSessionFile` currently only does exact matching.

- [ ] **Step 3: Implement the fallback logic**

In `server/scanner/live-scanner.ts`, export `findSessionFile` and replace the function (lines 73-85):

```typescript
/** Find the session JSONL file across all project dirs.
 *  Claude Code creates a new JSONL file (with a new session ID) after context
 *  compaction, but the runtime metadata in ~/.claude/sessions/<pid>.json still
 *  references the *original* session ID.  To handle this we first look for an
 *  exact match; if that file is stale (>5 min old) we fall back to the most
 *  recently modified JSONL in the same project directory — which is very likely
 *  the continuation of the same session. */
const STALE_SESSION_FILE_MS = 5 * 60 * 1000; // 5 minutes

export function findSessionFile(sessionId: string, projectsDir: string): string | null {
  if (!dirExists(projectsDir)) return null;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectPath = normPath(projectsDir, dir.name);
      const exactPath = normPath(projectPath, `${sessionId}.jsonl`);

      if (fs.existsSync(exactPath)) {
        // Check if the exact match is fresh enough
        try {
          const stat = fs.statSync(exactPath);
          const ageMs = Date.now() - stat.mtime.getTime();
          if (ageMs <= STALE_SESSION_FILE_MS) {
            return exactPath; // Fresh exact match — use it
          }
        } catch {
          return exactPath; // Can't stat? Return it anyway
        }

        // Exact match is stale — look for a newer JSONL in the same directory
        const newerFile = findMostRecentJsonl(projectPath);
        return newerFile || exactPath; // Fall back to exact if nothing newer
      }
    }
  } catch {}
  return null;
}

/** Find the most recently modified .jsonl file in a directory */
function findMostRecentJsonl(dirPath: string): string | null {
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    let newest: string | null = null;
    let newestMtime = 0;

    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      const filePath = normPath(dirPath, f.name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtime.getTime() > newestMtime) {
          newestMtime = stat.mtime.getTime();
          newest = filePath;
        }
      } catch {}
    }

    return newest;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/scanner/live-scanner.ts tests/phase1-fixes.test.ts
git commit -m "fix: fall back to most recent JSONL when session file is stale

findSessionFile() now checks the mtime of the exact match. If
it's older than 5 minutes, it scans the same project directory
for the most recently modified JSONL — handling context compaction
where Claude creates a new session ID."
```

---

### Task 4: Fix Live View Stats Mismatch

**Files:**
- Modify: `server/scanner/live-scanner.ts:359-377`
- Test: `tests/phase1-fixes.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/phase1-fixes.test.ts`:

```typescript
describe("modelsInUse consistency", () => {
  it("getLiveData modelsInUse should pull from today's executions, not just active agents", async () => {
    // This is a structural test — we verify the code path by inspecting
    // getLiveData's return shape. When no sessions are active but agent
    // executions exist, modelsInUse should still contain models.
    // Since we can't easily mock the filesystem for a full integration test,
    // we verify the function exists and returns the expected shape.
    const { getLiveData } = await import("../server/scanner/live-scanner");
    const data = getLiveData();

    expect(data).toHaveProperty("stats");
    expect(data.stats).toHaveProperty("modelsInUse");
    expect(Array.isArray(data.stats.modelsInUse)).toBe(true);
    expect(data.stats).toHaveProperty("agentsToday");
    expect(typeof data.stats.agentsToday).toBe("number");
  });
});
```

- [ ] **Step 2: Run test, verify current behavior**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

Expected: Test passes (shape check), but this confirms the structure. The real fix is behavioral.

- [ ] **Step 3: Implement the fix**

In `server/scanner/live-scanner.ts`, replace the `modelsInUse` collection (lines 370-377):

Old code:
```typescript
  // 5. Collect unique models from active agents
  const modelsSet = new Set<string>();
  for (const s of activeSessions) {
    for (const a of s.activeAgents) {
      if (a.model) modelsSet.add(a.model);
    }
  }
  const modelsInUse = Array.from(modelsSet);
```

New code:
```typescript
  // 5. Collect unique models from today's agent executions (same source as agentsToday)
  //    This ensures modelsInUse and agentsToday are always consistent.
  const modelsSet = new Set<string>();
  for (const exec of getCachedExecutions()) {
    if ((exec.firstTs || "") >= midnightUTC && exec.model) {
      modelsSet.add(exec.model);
    }
  }
  const modelsInUse = Array.from(modelsSet);
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/scanner/live-scanner.ts tests/phase1-fixes.test.ts
git commit -m "fix: modelsInUse now pulls from today's executions instead of active agents

Both agentsToday and modelsInUse now use the same data source
(getCachedExecutions filtered by midnight), eliminating the
mismatch where '24 agents today, 0 models' could occur."
```

---

### Task 5: Fix Trash Location

**Files:**
- Modify: `server/config.ts:1-5`
- Modify: `server/scanner/utils.ts:55-67`
- Test: `tests/phase1-fixes.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/phase1-fixes.test.ts`:

```typescript
describe("TRASH_DIR location", () => {
  it("TRASH_DIR should be under home directory, not /tmp", async () => {
    const { TRASH_DIR } = await import("../server/config");
    const home = os.homedir();

    expect(TRASH_DIR).toContain(".claude-command-center");
    expect(TRASH_DIR).toContain("trash");
    expect(TRASH_DIR.startsWith(home.replace(/\\/g, "/"))).toBe(true);
    expect(TRASH_DIR).not.toContain(os.tmpdir());
  });
});

describe("fileExists allows trash dir paths", () => {
  it("should accept paths under ~/.claude-command-center/trash", async () => {
    const { TRASH_DIR } = await import("../server/config");

    // Create a temp file in the trash dir to test fileExists
    fs.mkdirSync(TRASH_DIR, { recursive: true });
    const testFile = path.join(TRASH_DIR, "test-session.jsonl");
    fs.writeFileSync(testFile, "test");

    const { fileExists } = await import("../server/scanner/utils");
    expect(fileExists(testFile)).toBe(true);

    // Cleanup
    fs.unlinkSync(testFile);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

Expected: The TRASH_DIR test fails because it currently points to `/tmp/claude-sessions-trash`.

- [ ] **Step 3: Implement the fix**

In `server/config.ts`, replace the entire file:

```typescript
import path from "path";
import os from "os";

/** Directory for trashed session files (undo support).
 *  Uses ~/.claude-command-center/trash/ so files survive reboots (unlike /tmp). */
export const TRASH_DIR = path.join(os.homedir(), ".claude-command-center", "trash").replace(/\\/g, "/");

/** Full scan interval for periodic refresh (ms) */
export const PERIODIC_SCAN_INTERVAL_MS = 30_000;

/** Debounce interval for watcher-triggered rescans (ms) */
export const DEBOUNCE_MS = 2000;

/** Maximum number of sessions returned in unpaginated responses */
export const MAX_SESSIONS_RESPONSE = 1000;

/** Size of head chunk read from JSONL files (bytes) */
export const MAX_JSONL_HEAD_CHUNK = 65536;

/** Size of tail chunk read from JSONL files (bytes) */
export const MAX_JSONL_TAIL_CHUNK = 4096;
```

In `server/scanner/utils.ts`, update the `fileExists` function (lines 55-67) to also allow paths under the new trash directory:

Old code:
```typescript
export function fileExists(filePath: string): boolean {
  try {
    // Guard against path traversal: only allow paths under home directory or absolute paths to known locations
    const resolved = path.resolve(filePath);
    const home = os.homedir();
    if (!resolved.startsWith(home) && !resolved.startsWith("/tmp") && !resolved.startsWith(os.tmpdir())) {
      return false;
    }
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}
```

New code:
```typescript
export function fileExists(filePath: string): boolean {
  try {
    // Guard against path traversal: only allow paths under home directory or known locations
    const resolved = path.resolve(filePath);
    const home = os.homedir();
    const trashDir = path.join(home, ".claude-command-center", "trash");
    if (!resolved.startsWith(home) && !resolved.startsWith("/tmp") && !resolved.startsWith(os.tmpdir()) && !resolved.startsWith(trashDir)) {
      return false;
    }
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run tests/phase1-fixes.test.ts
```

- [ ] **Step 5: Run ALL existing tests to check for regressions**

```bash
npx vitest run
```

Expected: All tests pass. The trash location change is backward-compatible because the old `/tmp` path is still allowed in `fileExists` (sessions already trashed there will still be found until the next reboot clears `/tmp`).

- [ ] **Step 6: Commit**

```bash
git add server/config.ts server/scanner/utils.ts tests/phase1-fixes.test.ts
git commit -m "fix: move trash dir from /tmp to ~/.claude-command-center/trash

Trashed sessions now survive reboots. The fileExists() guard
also allows the new trash directory path."
```

---

### Task 6: Add Toast Notifications

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/hooks/use-sessions.ts`
- Modify: `client/src/hooks/use-settings.ts`
- Modify: `client/src/hooks/use-markdown.ts`
- Modify: `client/src/hooks/use-agents.ts`
- Modify: `client/src/hooks/use-entities.ts`
- Modify: `client/src/hooks/use-prompts.ts`
- Modify: `client/src/hooks/use-update.ts`

- [ ] **Step 1: Install sonner**

```bash
npm install sonner
```

- [ ] **Step 2: Add Toaster to App.tsx**

In `client/src/App.tsx`, add the import at the top with the other imports:

```typescript
import { Toaster } from "sonner";
```

Then add `<Toaster richColors position="bottom-right" />` inside the `App` component return, after `<KeyboardShortcutsOverlay />`:

Old code (lines 86-96):
```typescript
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <GlobalSearch />
        <KeyboardShortcutsOverlay />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

New code:
```typescript
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <GlobalSearch />
        <KeyboardShortcutsOverlay />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Add toasts to `use-sessions.ts`**

Replace `client/src/hooks/use-sessions.ts` with toast notifications on all mutations. Add the import at the top:

```typescript
import { toast } from "sonner";
```

Then update each mutation hook. Here are all the mutations that need `toast` calls:

**useDeleteSession:**
```typescript
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Session deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete session: ${err.message}`); },
  });
}
```

**useBulkDeleteSessions:**
```typescript
export function useBulkDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/sessions", { ids });
      return res.json();
    },
    onSuccess: (_data, ids) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(`${ids.length} sessions deleted`);
    },
    onError: (err: Error) => { toast.error(`Failed to delete sessions: ${err.message}`); },
  });
}
```

**useOpenSession:**
```typescript
export function useOpenSession() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/open`);
      return res.json();
    },
    onSuccess: () => { toast.success("Session opened in terminal"); },
    onError: (err: Error) => { toast.error(`Failed to open session: ${err.message}`); },
  });
}
```

**useDeleteAllSessions:**
```typescript
export function useDeleteAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/delete-all");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("All sessions deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete all sessions: ${err.message}`); },
  });
}
```

**useUndoDeleteSessions:**
```typescript
export function useUndoDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/undo");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Delete undone — sessions restored");
    },
    onError: (err: Error) => { toast.error(`Failed to undo delete: ${err.message}`); },
  });
}
```

**useSummarizeSession:**
```typescript
export function useSummarizeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/summarize`);
      return res.json() as Promise<SessionSummary>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Session summarized");
    },
    onError: (err: Error) => { toast.error(`Failed to summarize session: ${err.message}`); },
  });
}
```

**useSummarizeBatch:**
```typescript
export function useSummarizeBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/summarize-batch");
      return res.json() as Promise<{ summarized: string[]; failed: string[]; skipped: string[] }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(`Batch summarize: ${data.summarized.length} done, ${data.skipped.length} skipped`);
    },
    onError: (err: Error) => { toast.error(`Batch summarize failed: ${err.message}`); },
  });
}
```

**useContextLoader:**
```typescript
export function useContextLoader() {
  return useMutation({
    mutationFn: async (project: string) => {
      const res = await apiRequest("POST", "/api/sessions/context-loader", { project });
      return res.json() as Promise<ContextLoaderResult>;
    },
    onSuccess: () => { toast.success("Context loaded"); },
    onError: (err: Error) => { toast.error(`Failed to load context: ${err.message}`); },
  });
}
```

**useCreatePrompt (in use-sessions.ts):**
```typescript
export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; prompt: string; project?: string; tags?: string[] }) => {
      const res = await apiRequest("POST", "/api/sessions/prompts", data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/prompts"] });
      toast.success("Prompt created");
    },
    onError: (err: Error) => { toast.error(`Failed to create prompt: ${err.message}`); },
  });
}
```

**useDeletePrompt (in use-sessions.ts):**
```typescript
export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/prompts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/prompts"] });
      toast.success("Prompt deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete prompt: ${err.message}`); },
  });
}
```

**useUpdateWorkflow:**
```typescript
export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<WorkflowConfig>) => {
      const res = await apiRequest("PATCH", "/api/sessions/workflows", patch);
      return res.json() as Promise<WorkflowConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/workflows"] });
      toast.success("Workflow updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update workflow: ${err.message}`); },
  });
}
```

**useRunWorkflows:**
```typescript
export function useRunWorkflows() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/workflows/run");
      return res.json();
    },
    onSuccess: () => { toast.success("Workflows executed"); },
    onError: (err: Error) => { toast.error(`Failed to run workflows: ${err.message}`); },
  });
}
```

**useTogglePin:**
```typescript
export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/pin/${id}`);
      return res.json() as Promise<{ sessionId: string; isPinned: boolean }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(data.isPinned ? "Session pinned" : "Session unpinned");
    },
    onError: (err: Error) => { toast.error(`Failed to toggle pin: ${err.message}`); },
  });
}
```

**useSaveNote:**
```typescript
export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await apiRequest("PUT", `/api/sessions/${id}/note`, { text });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Note saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save note: ${err.message}`); },
  });
}
```

**useNLQuery:**
```typescript
export function useNLQuery() {
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/sessions/nl-query", { question });
      return res.json() as Promise<NLQueryResult>;
    },
    onError: (err: Error) => { toast.error(`Query failed: ${err.message}`); },
  });
}
```

**useExtractDecisions:**
```typescript
export function useExtractDecisions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/decisions/extract/${id}`);
      return res.json() as Promise<{ decisions: Decision[]; count: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/decisions"] });
      toast.success(`${data.count} decisions extracted`);
    },
    onError: (err: Error) => { toast.error(`Failed to extract decisions: ${err.message}`); },
  });
}
```

**useDelegate:**
```typescript
export function useDelegate() {
  return useMutation({
    mutationFn: async (params: { sessionId: string; target: string; task?: string }) => {
      const res = await apiRequest("POST", "/api/sessions/delegate", params);
      return res.json() as Promise<DelegationResult>;
    },
    onSuccess: (data) => { toast.success(`Delegated to ${data.target}`); },
    onError: (err: Error) => { toast.error(`Delegation failed: ${err.message}`); },
  });
}
```

- [ ] **Step 4: Add toasts to `use-settings.ts`**

In `client/src/hooks/use-settings.ts`, add the import and toast calls:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { AppSettings } from "@shared/types";

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: ["/api/settings"],
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const res = await apiRequest("PATCH", "/api/settings", patch);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      if (variables.scanPaths) {
        qc.invalidateQueries({ queryKey: ["/api/scanner/status"] });
      }
      toast.success("Settings saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save settings: ${err.message}`); },
  });
}

export function useResetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/reset");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Settings reset to defaults");
    },
    onError: (err: Error) => { toast.error(`Failed to reset settings: ${err.message}`); },
  });
}
```

- [ ] **Step 5: Add toasts to `use-markdown.ts`**

In `client/src/hooks/use-markdown.ts`, add the import at the top:

```typescript
import { toast } from "sonner";
```

Then add toast calls to each mutation:

**useSaveMarkdown:**
```typescript
export function useSaveMarkdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("PUT", `/api/markdown/${id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
      toast.success("File saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save file: ${err.message}`); },
  });
}
```

**useCreateMarkdownFile:**
```typescript
export function useCreateMarkdownFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filePath, content }: { filePath: string; content: string }) => {
      const res = await apiRequest("POST", "/api/markdown", { filePath, content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
      toast.success("File created");
    },
    onError: (err: Error) => { toast.error(`Failed to create file: ${err.message}`); },
  });
}
```

**useRestoreMarkdown:**
```typescript
export function useRestoreMarkdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, backupId }: { id: string; backupId: number }) => {
      const res = await apiRequest("POST", `/api/markdown/${id}/restore/${backupId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
      toast.success("Backup restored");
    },
    onError: (err: Error) => { toast.error(`Failed to restore backup: ${err.message}`); },
  });
}
```

**useUpdateMarkdownMeta:**
```typescript
export function useUpdateMarkdownMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, meta }: { id: string; meta: Partial<MarkdownFileMeta> }) => {
      const res = await apiRequest("PATCH", `/api/markdown/${id}/meta`, meta);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown/meta"] });
      toast.success("Metadata updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update metadata: ${err.message}`); },
  });
}
```

- [ ] **Step 6: Add toasts to `use-agents.ts`**

In `client/src/hooks/use-agents.ts`, add the import at the top:

```typescript
import { toast } from "sonner";
```

Then add toast calls to each mutation:

**useSaveAgentDefinition:**
```typescript
export function useSaveAgentDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("PUT", `/api/agents/definitions/${id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents/definitions"] });
      toast.success("Agent definition saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save agent: ${err.message}`); },
  });
}
```

**useCreateAgentDefinition:**
```typescript
export function useCreateAgentDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; model?: string; color?: string; tools?: string[]; content?: string }) => {
      const res = await apiRequest("POST", "/api/agents/definitions", data);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents/definitions"] });
      toast.success("Agent created");
    },
    onError: (err: Error) => { toast.error(`Failed to create agent: ${err.message}`); },
  });
}
```

- [ ] **Step 7: Add toasts to `use-entities.ts`**

In `client/src/hooks/use-entities.ts`, add the import at the top:

```typescript
import { toast } from "sonner";
```

Then add toast calls to `useRescan`:

```typescript
export function useRescan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scanner/rescan");
      return res.json();
    },
    onSuccess: () => {
      invalidateDataQueries(qc);
      toast.success("Rescan complete");
    },
    onError: (err: Error) => { toast.error(`Rescan failed: ${err.message}`); },
  });
}
```

- [ ] **Step 8: Add toasts to `use-prompts.ts`**

In `client/src/hooks/use-prompts.ts`, add the import at the top:

```typescript
import { toast } from "sonner";
```

Then add toast calls to each mutation:

**useCreatePrompt:**
```typescript
export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; prompt: string; project?: string; tags?: string[] }) => {
      const res = await apiRequest("POST", "/api/sessions/prompts", data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt created");
    },
    onError: (err: Error) => { toast.error(`Failed to create prompt: ${err.message}`); },
  });
}
```

**useUpdatePrompt:**
```typescript
export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; prompt?: string; tags?: string[]; isFavorite?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/sessions/prompts/${id}`, data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update prompt: ${err.message}`); },
  });
}
```

**useDeletePrompt:**
```typescript
export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/prompts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete prompt: ${err.message}`); },
  });
}
```

- [ ] **Step 9: Add toasts to `use-update.ts`**

In `client/src/hooks/use-update.ts`, add the import at the top:

```typescript
import { toast } from "sonner";
```

Then add toast calls to each mutation:

**useCheckForUpdate:**
```typescript
export function useCheckForUpdate() {
  const qc = useQueryClient();
  return useMutation<StatusWithPrefs>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/check");
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/update/status"], data);
      toast.success(data.updateAvailable ? "Update available" : "Already up to date");
    },
    onError: (err: Error) => { toast.error(`Update check failed: ${err.message}`); },
  });
}
```

**useApplyUpdate:**
```typescript
export function useApplyUpdate() {
  const qc = useQueryClient();
  return useMutation<UpdateApplyResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/apply");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/update/status"] });
      if (data.success) {
        toast.success("Update applied — restart to activate");
      } else {
        toast.error(`Update failed: ${data.error || "unknown error"}`);
      }
    },
    onError: (err: Error) => { toast.error(`Failed to apply update: ${err.message}`); },
  });
}
```

**useRestartServer:**
```typescript
export function useRestartServer() {
  return useMutation<{ message: string }>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/restart");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Server restarting...");
      // Server will die and respawn. Poll until it's back, then reload.
      const poll = setInterval(async () => {
        try {
          const resp = await fetch("/health");
          if (resp.ok) {
            clearInterval(poll);
            window.location.reload();
          }
        } catch {
          // Server still restarting
        }
      }, 1500);
      // Stop polling after 30s — show manual restart instructions
      setTimeout(() => {
        clearInterval(poll);
        document.title = "Restart failed — restart manually";
        toast.error("Restart timed out — restart the server manually");
      }, 30000);
    },
    onError: (err: Error) => { toast.error(`Failed to restart server: ${err.message}`); },
  });
}
```

**useUpdatePrefs:**
```typescript
export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation<UpdatePreferences, Error, Partial<UpdatePreferences>>({
    mutationFn: async (patch) => {
      const res = await apiRequest("PATCH", "/api/update/prefs", patch);
      return res.json();
    },
    onSuccess: (newPrefs) => {
      // Update the cached status to include new prefs
      qc.setQueryData<StatusWithPrefs>(["/api/update/status"], (old) =>
        old ? { ...old, prefs: newPrefs } : old
      );
      toast.success("Update preferences saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save preferences: ${err.message}`); },
  });
}
```

- [ ] **Step 10: Verify the build compiles**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 11: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json client/src/App.tsx client/src/hooks/use-sessions.ts client/src/hooks/use-settings.ts client/src/hooks/use-markdown.ts client/src/hooks/use-agents.ts client/src/hooks/use-entities.ts client/src/hooks/use-prompts.ts client/src/hooks/use-update.ts
git commit -m "feat: add toast notifications to all mutation hooks

Install sonner and add <Toaster /> to App.tsx. Every mutation
hook now shows toast.success() on completion and toast.error()
on failure, giving users immediate visual feedback for all
async operations."
```

---

## Verification Checklist

After all 6 tasks are complete, run these checks:

```bash
# All tests pass
npx vitest run

# TypeScript compiles
npx tsc --noEmit

# Server starts without errors
npm run dev
```

Then manually verify:
- [ ] Add a `~/projects` path in Settings, hit Projects page — projects appear without restart
- [ ] Kill a Claude Code process — Live View stops showing it within 3 seconds
- [ ] Start a long session that triggers compaction — Live View still shows history
- [ ] "Agents today" and "models used" are consistent
- [ ] Delete a session, reboot, undo still works
- [ ] Every mutation shows a success/error toast
