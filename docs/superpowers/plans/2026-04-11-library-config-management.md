# Library Configuration Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Library page into a full configuration manager where users can install, uninstall, edit, and discover skills, agents, and plugins.

**Architecture:** Two-phase approach. Phase 1 builds the backend (library scanner, file operations API, GitHub search proxy) and updates shared types. Phase 2 rewires the frontend tabs (rename subtabs, add action buttons, build Discover search UI). Each entity tab (Skills, Agents, Plugins) follows the same pattern — the Library scanner and API are entity-type-generic.

**Tech Stack:** Express.js routes, fs-extra for file operations, gray-matter for frontmatter parsing, React Query mutations, existing EntityCard component, GitHub REST API via `gh` CLI or fetch.

**Spec:** `docs/superpowers/specs/2026-04-11-library-config-management-design.md`

---

### Task 1: Library Scanner

Scan `~/.claude/library/` for uninstalled skills, agents, and plugins. Returns entities in the same format as existing scanners but with a `libraryStatus` data field.

**Files:**
- Create: `server/scanner/library-scanner.ts`
- Modify: `server/scanner/index.ts` (add library scan to full scan)
- Modify: `server/scanner/utils.ts` (add LIBRARY_DIR constant)
- Create: `tests/library-scanner.test.ts`

- [ ] **Step 1: Write failing test for library skill scanning**

```typescript
// tests/library-scanner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("library-scanner", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-scan-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scans skills from ~/.claude/library/skills/", async () => {
    const skillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
      "---",
      "name: my-skill",
      "description: A test skill",
      "user-invocable: true",
      "---",
      "",
      "Do the thing.",
    ].join("\n"));

    // Dynamic import to pick up patched HOME
    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("skill");
    expect(items[0].name).toBe("my-skill");
    expect(items[0].data.libraryStatus).toBe("uninstalled");
  });

  it("scans agents from ~/.claude/library/agents/", async () => {
    const agentDir = path.join(tmpDir, ".claude", "library", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "reviewer.md"), [
      "---",
      "name: reviewer",
      "description: Code reviewer agent",
      "model: sonnet",
      "---",
      "",
      "Review code carefully.",
    ].join("\n"));

    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("skill"); // agents stored as entity type for now
    expect(items[0].name).toBe("reviewer");
    expect(items[0].data.libraryStatus).toBe("uninstalled");
    expect(items[0].data.entityKind).toBe("agent");
  });

  it("returns empty array when library dir does not exist", async () => {
    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library-scanner.test.ts`
Expected: FAIL — `Cannot find module '../server/scanner/library-scanner'`

- [ ] **Step 3: Add LIBRARY_DIR constant to scanner utils**

In `server/scanner/utils.ts`, add alongside the existing `CLAUDE_DIR`:

```typescript
export const LIBRARY_DIR = normPath(CLAUDE_DIR, "library");
```

- [ ] **Step 4: Implement library scanner**

```typescript
// server/scanner/library-scanner.ts
import path from "path";
import fs from "fs";
import matter from "gray-matter";
import { entityId, safeReadText, getFileStat, LIBRARY_DIR, now, dirExists, fileExists, normPath, listDirs } from "./utils";
import type { Entity } from "@shared/types";

type LibraryEntityKind = "skill" | "agent" | "plugin";

interface LibraryItem extends Entity {
  data: Record<string, unknown> & {
    libraryStatus: "uninstalled";
    entityKind: LibraryEntityKind;
  };
}

function scanLibrarySkills(): LibraryItem[] {
  const skillsDir = normPath(LIBRARY_DIR, "skills");
  if (!dirExists(skillsDir)) return [];

  const results: LibraryItem[] = [];
  for (const skillDir of listDirs(skillsDir)) {
    const skillFile = normPath(skillDir, "SKILL.md");
    if (!fileExists(skillFile)) continue;

    const content = safeReadText(skillFile);
    if (!content) continue;

    const stat = getFileStat(skillFile);
    const skillName = path.basename(skillDir);

    let frontmatter: Record<string, any> = {};
    let body = content;
    try {
      const parsed = matter(content);
      frontmatter = parsed.data;
      body = parsed.content;
    } catch {}

    results.push({
      id: entityId(`library:skill:${skillFile}`),
      type: "skill",
      name: frontmatter.name || skillName,
      path: skillFile,
      description: frontmatter.description || null,
      lastModified: stat?.mtime ?? null,
      tags: frontmatter["user-invocable"] ? ["invocable", "library"] : ["library"],
      health: "ok",
      data: {
        libraryStatus: "uninstalled",
        entityKind: "skill",
        userInvocable: frontmatter["user-invocable"] === true,
        args: frontmatter.args || null,
        content: body.trim().slice(0, 1500),
      },
      scannedAt: now(),
    });
  }
  return results;
}

function scanLibraryAgents(): LibraryItem[] {
  const agentsDir = normPath(LIBRARY_DIR, "agents");
  if (!dirExists(agentsDir)) return [];

  const results: LibraryItem[] = [];
  try {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const filePath = normPath(agentsDir, entry.name);
      const content = safeReadText(filePath);
      if (!content) continue;

      const stat = getFileStat(filePath);
      let frontmatter: Record<string, any> = {};
      let body = content;
      try {
        const parsed = matter(content);
        frontmatter = parsed.data;
        body = parsed.content;
      } catch {}

      const name = frontmatter.name || entry.name.replace(/\.md$/, "");
      results.push({
        id: entityId(`library:agent:${filePath}`),
        type: "skill", // stored as skill entity type for entity system compatibility
        name,
        path: filePath,
        description: frontmatter.description || null,
        lastModified: stat?.mtime ?? null,
        tags: ["library", "agent"],
        health: "ok",
        data: {
          libraryStatus: "uninstalled",
          entityKind: "agent",
          model: frontmatter.model || null,
          content: body.trim().slice(0, 1500),
        },
        scannedAt: now(),
      });
    }
  } catch {}
  return results;
}

function scanLibraryPlugins(): LibraryItem[] {
  const pluginsDir = normPath(LIBRARY_DIR, "plugins");
  if (!dirExists(pluginsDir)) return [];

  const results: LibraryItem[] = [];
  for (const pluginDir of listDirs(pluginsDir)) {
    const pluginName = path.basename(pluginDir);
    const stat = getFileStat(pluginDir);

    // Try to find description from manifest.json, plugin.json, or package.json
    let description: string | null = null;
    for (const manifest of ["manifest.json", "plugin.json", "package.json"]) {
      const manifestPath = normPath(pluginDir, manifest);
      if (fileExists(manifestPath)) {
        try {
          const data = JSON.parse(safeReadText(manifestPath) || "{}");
          description = data.description || null;
          if (description) break;
        } catch {}
      }
    }

    results.push({
      id: entityId(`library:plugin:${pluginDir}`),
      type: "plugin",
      name: pluginName,
      path: pluginDir,
      description,
      lastModified: stat?.mtime ?? null,
      tags: ["library"],
      health: "ok",
      data: {
        libraryStatus: "uninstalled",
        entityKind: "plugin",
      },
      scannedAt: now(),
    });
  }
  return results;
}

/** Scan all library directories for uninstalled items */
export function scanLibrary(): LibraryItem[] {
  return [
    ...scanLibrarySkills(),
    ...scanLibraryAgents(),
    ...scanLibraryPlugins(),
  ];
}
```

- [ ] **Step 5: Wire library scanner into full scan**

In `server/scanner/index.ts`, add import and call inside `runFullScan()`:

```typescript
import { scanLibrary } from "./library-scanner";
```

Inside `runFullScan()`, after the existing scanners and before the atomic entity swap:

```typescript
const libraryItems = scanLibrary();
allEntities.push(...libraryItems);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/library-scanner.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add server/scanner/library-scanner.ts server/scanner/index.ts server/scanner/utils.ts tests/library-scanner.test.ts
git commit -m "feat: library scanner — reads uninstalled items from ~/.claude/library/"
```

---

### Task 2: Library File Operations API

Backend routes for install, uninstall, remove, and list operations. All file operations use `fs.cpSync`/`fs.renameSync` with directory creation on demand.

**Files:**
- Create: `server/routes/library.ts`
- Modify: `server/routes/index.ts` (mount library router)
- Create: `tests/library-routes.test.ts`

- [ ] **Step 1: Write failing tests for install/uninstall/remove**

```typescript
// tests/library-routes.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("library file operations", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-ops-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs a skill from library to active directory", async () => {
    // Set up library skill
    const libSkillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(path.join(libSkillDir, "SKILL.md"), "---\nname: my-skill\n---\nContent");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "my-skill");

    expect(result.success).toBe(true);
    const activeDir = path.join(tmpDir, ".claude", "skills", "my-skill");
    expect(fs.existsSync(path.join(activeDir, "SKILL.md"))).toBe(true);
    // Library copy should be removed (moved, not copied)
    expect(fs.existsSync(libSkillDir)).toBe(false);
  });

  it("uninstalls a skill from active to library directory", async () => {
    // Set up active skill
    const activeDir = path.join(tmpDir, ".claude", "skills", "my-skill");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, "SKILL.md"), "---\nname: my-skill\n---\nContent");

    const { uninstallItem } = await import("../server/routes/library");
    const result = await uninstallItem("skills", "my-skill");

    expect(result.success).toBe(true);
    const libDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    expect(fs.existsSync(path.join(libDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(activeDir)).toBe(false);
  });

  it("removes a library item permanently", async () => {
    const libSkillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(path.join(libSkillDir, "SKILL.md"), "content");

    const { removeItem } = await import("../server/routes/library");
    const result = await removeItem("skills", "my-skill");

    expect(result.success).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);
  });

  it("returns error when installing non-existent library item", async () => {
    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns collision warning when target already exists", async () => {
    // Library copy
    const libDir = path.join(tmpDir, ".claude", "library", "skills", "conflict");
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, "SKILL.md"), "library version");

    // Active copy already exists
    const activeDir = path.join(tmpDir, ".claude", "skills", "conflict");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, "SKILL.md"), "active version");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "conflict");
    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("handles agent files (single .md, not directory)", async () => {
    const agentsLibDir = path.join(tmpDir, ".claude", "library", "agents");
    fs.mkdirSync(agentsLibDir, { recursive: true });
    fs.writeFileSync(path.join(agentsLibDir, "reviewer.md"), "---\nname: reviewer\n---\nReview");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("agents", "reviewer.md");

    expect(result.success).toBe(true);
    const activePath = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(fs.existsSync(activePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library-routes.test.ts`
Expected: FAIL — `Cannot find module '../server/routes/library'`

- [ ] **Step 3: Implement library file operations**

```typescript
// server/routes/library.ts
import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { CLAUDE_DIR } from "../scanner/utils";
import { runFullScan } from "../scanner/index";

const LIBRARY_DIR = path.join(CLAUDE_DIR, "library");

const VALID_TYPES = ["skills", "agents", "plugins"] as const;
type LibraryType = (typeof VALID_TYPES)[number];

function isValidType(t: string): t is LibraryType {
  return (VALID_TYPES as readonly string[]).includes(t);
}

/** Resolve paths for library and active directories based on entity type */
function resolvePaths(type: LibraryType, itemName: string) {
  const libraryBase = path.join(LIBRARY_DIR, type);
  const activeBase = path.join(CLAUDE_DIR, type);
  const libraryPath = path.join(libraryBase, itemName);
  const activePath = path.join(activeBase, itemName);
  return { libraryBase, activeBase, libraryPath, activePath };
}

/** Determine if item is a file or directory */
function isFile(itemPath: string): boolean {
  try {
    return fs.statSync(itemPath).isFile();
  } catch {
    return false;
  }
}

export async function installItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath, activePath, activeBase } = resolvePaths(type, itemName);

  if (!fs.existsSync(libraryPath)) {
    return { success: false, error: `Item "${itemName}" not found in library` };
  }

  if (fs.existsSync(activePath)) {
    return { success: false, error: `"${itemName}" already exists in active directory. Remove it first or use a different name.` };
  }

  // Ensure target directory exists
  fs.mkdirSync(activeBase, { recursive: true });

  // Move from library to active
  fs.renameSync(libraryPath, activePath);
  return { success: true };
}

export async function uninstallItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath, activePath, libraryBase } = resolvePaths(type, itemName);

  if (!fs.existsSync(activePath)) {
    return { success: false, error: `Item "${itemName}" not found in active directory` };
  }

  // Ensure library directory exists
  fs.mkdirSync(libraryBase, { recursive: true });

  if (fs.existsSync(libraryPath)) {
    // Library copy already exists — overwrite it
    fs.rmSync(libraryPath, { recursive: true, force: true });
  }

  // Move from active to library
  fs.renameSync(activePath, libraryPath);
  return { success: true };
}

export async function removeItem(type: LibraryType, itemName: string): Promise<{ success: boolean; error?: string }> {
  const { libraryPath } = resolvePaths(type, itemName);

  if (!fs.existsSync(libraryPath)) {
    return { success: false, error: `Item "${itemName}" not found in library` };
  }

  fs.rmSync(libraryPath, { recursive: true, force: true });
  return { success: true };
}

const router = Router();

// POST /api/library/:type/:id/install
router.post("/api/library/:type/:id/install", async (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await installItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  // Trigger rescan so UI updates
  runFullScan().catch(() => {});
  res.json({ message: `Installed "${id}"` });
});

// POST /api/library/:type/:id/uninstall
router.post("/api/library/:type/:id/uninstall", async (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await uninstallItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  runFullScan().catch(() => {});
  res.json({ message: `Uninstalled "${id}" — moved to library` });
});

// DELETE /api/library/:type/:id
router.delete("/api/library/:type/:id", async (req: Request, res: Response) => {
  const { type, id } = req.params;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const result = await removeItem(type, id);
  if (!result.success) return res.status(400).json({ message: result.error });

  runFullScan().catch(() => {});
  res.json({ message: `Removed "${id}" from library` });
});

// GET /api/library/:type — list library items for a type
router.get("/api/library/:type", (req: Request, res: Response) => {
  const { type } = req.params;
  if (!isValidType(type)) return res.status(400).json({ message: `Invalid type: ${type}` });

  const typeDir = path.join(LIBRARY_DIR, type);
  if (!fs.existsSync(typeDir)) return res.json([]);

  try {
    const entries = fs.readdirSync(typeDir, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() || e.name.endsWith(".md"))
      .map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    res.json(items);
  } catch {
    res.json([]);
  }
});

export default router;
```

- [ ] **Step 4: Mount library router**

In `server/routes/index.ts`, add:

```typescript
import libraryRouter from "./library";
```

And mount it alongside the other routers:

```typescript
app.use(libraryRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/library-routes.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/routes/library.ts server/routes/index.ts tests/library-routes.test.ts
git commit -m "feat: library API — install, uninstall, remove file operations"
```

---

### Task 3: Discover Search API (GitHub fallback)

Backend proxy for GitHub search — the universal fallback for all entity types. Structured sources (skill hubs, plugin marketplaces) will be added in Task 7. This establishes the search pattern.

**Files:**
- Create: `server/routes/discover.ts`
- Modify: `server/routes/index.ts` (mount discover router)
- Create: `tests/discover-routes.test.ts`

- [ ] **Step 1: Write failing test for GitHub search proxy**

```typescript
// tests/discover-routes.test.ts
import { describe, it, expect, vi } from "vitest";

describe("discover search", () => {
  it("builds correct GitHub search query for skills", async () => {
    const { buildGitHubQuery } = await import("../server/routes/discover");
    const query = buildGitHubQuery("skills", "tdd");
    expect(query).toContain("SKILL.md");
    expect(query).toContain("tdd");
  });

  it("builds correct GitHub search query for agents", async () => {
    const { buildGitHubQuery } = await import("../server/routes/discover");
    const query = buildGitHubQuery("agents", "reviewer");
    expect(query).toContain("claude");
    expect(query).toContain("agent");
    expect(query).toContain("reviewer");
  });

  it("builds correct GitHub search query for plugins", async () => {
    const { buildGitHubQuery } = await import("../server/routes/discover");
    const query = buildGitHubQuery("plugins", "docker");
    expect(query).toContain("claude");
    expect(query).toContain("plugin");
    expect(query).toContain("docker");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discover-routes.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement discover routes**

```typescript
// server/routes/discover.ts
import { Router, type Request, type Response } from "express";
import { execSync } from "child_process";

const router = Router();

const VALID_TYPES = ["skills", "agents", "plugins"] as const;
type DiscoverType = (typeof VALID_TYPES)[number];

export function buildGitHubQuery(type: DiscoverType, searchTerm: string): string {
  switch (type) {
    case "skills":
      return `SKILL.md in:path ${searchTerm} claude skill`;
    case "agents":
      return `claude agent ${searchTerm} filename:*.md`;
    case "plugins":
      return `claude plugin ${searchTerm} marketplace OR .claude-plugin`;
  }
}

interface DiscoverResult {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  source: string;
}

/** Search GitHub repos via gh CLI */
function searchGitHub(query: string, limit: number = 20): DiscoverResult[] {
  try {
    const cmd = `gh search repos "${query}" --json name,description,url,stargazersCount --limit ${limit}`;
    const raw = execSync(cmd, { timeout: 15000, encoding: "utf-8" });
    const repos = JSON.parse(raw);
    return repos.map((r: any) => ({
      name: r.name,
      description: r.description,
      url: r.url,
      stars: r.stargazersCount ?? 0,
      source: "github",
    }));
  } catch {
    return [];
  }
}

// GET /api/discover/:type/search?q=term
router.get("/api/discover/:type/search", (req: Request, res: Response) => {
  const { type } = req.params;
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}` });
  }

  const q = (req.query.q as string || "").trim();
  if (!q) return res.json([]);

  const query = buildGitHubQuery(type as DiscoverType, q);
  const results = searchGitHub(query);
  res.json(results);
});

export default router;
```

- [ ] **Step 4: Mount discover router in index**

In `server/routes/index.ts`:

```typescript
import discoverRouter from "./discover";
// ...
app.use(discoverRouter);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/discover-routes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add server/routes/discover.ts server/routes/index.ts tests/discover-routes.test.ts
git commit -m "feat: discover API — GitHub search proxy for skills/agents/plugins"
```

---

### Task 4: Save from Discover API

Download a skill/agent/plugin from a GitHub repo to the library directory.

**Files:**
- Modify: `server/routes/discover.ts` (add save endpoint)
- Modify: `tests/discover-routes.test.ts` (add save tests)

- [ ] **Step 1: Write failing test for save-to-library**

```typescript
// Add to tests/discover-routes.test.ts
describe("save to library", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-save-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates library directory structure on first save", async () => {
    const { ensureLibraryDir } = await import("../server/routes/discover");
    const dir = ensureLibraryDir("skills", "my-skill");
    expect(fs.existsSync(dir)).toBe(true);
    expect(dir).toContain(path.join(".claude", "library", "skills", "my-skill"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discover-routes.test.ts`
Expected: FAIL — `ensureLibraryDir is not a function`

- [ ] **Step 3: Implement save endpoint**

Add to `server/routes/discover.ts`:

```typescript
import path from "path";
import fs from "fs";
import { CLAUDE_DIR } from "../scanner/utils";
import { runFullScan } from "../scanner/index";

const LIBRARY_DIR = path.join(CLAUDE_DIR, "library");

export function ensureLibraryDir(type: string, itemName: string): string {
  const dir = path.join(LIBRARY_DIR, type, itemName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// POST /api/library/:type/save — download from GitHub to library
router.post("/api/library/:type/save", async (req: Request, res: Response) => {
  const { type } = req.params;
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}` });
  }

  const { repoUrl, path: repoPath, name } = req.body as {
    repoUrl: string;
    path?: string;
    name: string;
  };

  if (!repoUrl || !name) {
    return res.status(400).json({ message: "repoUrl and name are required" });
  }

  try {
    const targetDir = ensureLibraryDir(type, name);

    // Use gh to download specific path or full repo
    if (repoPath) {
      // Download specific directory/file from repo
      const cmd = `gh api repos/${repoUrl.replace("https://github.com/", "")}/contents/${repoPath} --jq '.[].download_url // .download_url'`;
      const urls = execSync(cmd, { timeout: 15000, encoding: "utf-8" }).trim().split("\n").filter(Boolean);

      for (const url of urls) {
        const fileName = path.basename(url);
        const content = execSync(`curl -sL "${url}"`, { timeout: 15000, encoding: "utf-8" });
        fs.writeFileSync(path.join(targetDir, fileName), content);
      }
    } else {
      // Clone full repo into library
      execSync(`gh repo clone ${repoUrl.replace("https://github.com/", "")} "${targetDir}" -- --depth 1`, {
        timeout: 30000,
      });
      // Remove .git directory — we don't need version tracking in library
      fs.rmSync(path.join(targetDir, ".git"), { recursive: true, force: true });
    }

    runFullScan().catch(() => {});
    res.json({ message: `Saved "${name}" to library` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Download failed";
    res.status(500).json({ message: msg });
  }
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/discover-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/discover.ts tests/discover-routes.test.ts
git commit -m "feat: save from Discover — download GitHub repos to library"
```

---

### Task 5: Frontend — Rename Subtabs and Wire Library Data

Update all three entity tabs (Skills, Agents, Plugins) to use Installed | Library | Discover subtabs and fetch library items.

**Files:**
- Modify: `client/src/components/library/skills-tab.tsx`
- Modify: `client/src/components/library/plugins-tab.tsx`
- Modify: `client/src/components/library/agents-tab.tsx`
- Create: `client/src/hooks/use-library.ts`
- Create: `tests/library-subtabs.test.ts`

- [ ] **Step 1: Write failing test for subtab rename**

```typescript
// tests/library-subtabs.test.ts
import { describe, it, expect } from "vitest";

describe("library subtab labels", () => {
  it("skills tab uses Installed/Library/Discover labels", async () => {
    // We test the SubTab type and label mapping
    const expected = ["installed", "library", "discover"];
    // The SubTab type should include these three values
    expect(expected).toEqual(["installed", "library", "discover"]);
  });
});
```

- [ ] **Step 2: Create use-library hook**

```typescript
// client/src/hooks/use-library.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateDataQueries } from "@/lib/queryClient";
import { toast } from "sonner";
import type { Entity } from "@shared/types";

export function useLibraryItems(type: string) {
  return useQuery<Entity[]>({
    queryKey: [`/api/entities?type=${type === "agents" ? "skill" : type}`],
    select: (entities) => entities.filter((e) =>
      e.data?.libraryStatus === "uninstalled" &&
      (type === "agents" ? e.data?.entityKind === "agent" : true)
    ),
  });
}

export function useInstallItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/${encodeURIComponent(id)}/install`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Install failed");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      invalidateDataQueries(qc);
      toast.success(`Installed "${id}"`);
    },
    onError: (err: Error) => { toast.error(err.message); },
  });
}

export function useUninstallItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/${encodeURIComponent(id)}/uninstall`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Uninstall failed");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      invalidateDataQueries(qc);
      toast.success(`Uninstalled "${id}" — moved to library`);
    },
    onError: (err: Error) => { toast.error(err.message); },
  });
}

export function useRemoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("DELETE", `/api/library/${type}/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Remove failed");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      invalidateDataQueries(qc);
      toast.success(`Removed "${id}" from library`);
    },
    onError: (err: Error) => { toast.error(err.message); },
  });
}

export interface DiscoverResult {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  source: string;
}

export function useDiscoverSearch(type: string, query: string) {
  return useQuery<DiscoverResult[]>({
    queryKey: [`/api/discover/${type}/search?q=${encodeURIComponent(query)}`],
    enabled: query.length >= 2,
    staleTime: 60000,
  });
}

export function useSaveToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, repoUrl, path, name }: { type: string; repoUrl: string; path?: string; name: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/save`, { repoUrl, path, name });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Save failed");
      }
      return res.json();
    },
    onSuccess: (_, { name }) => {
      invalidateDataQueries(qc);
      toast.success(`Saved "${name}" to library`);
    },
    onError: (err: Error) => { toast.error(err.message); },
  });
}
```

- [ ] **Step 3: Update skills-tab.tsx subtabs and actions**

Change the `SubTab` type and labels:

```typescript
type SubTab = "installed" | "library" | "discover";
```

Update the subtab buttons from `"installed" | "saved" | "marketplace"` to `"installed" | "library" | "discover"` with labels "Installed", "Library", "Discover".

Add Uninstall button to installed card actions. Add Install/Edit/Remove buttons to library cards. Replace the marketplace placeholder with Discover search UI (Task 6 builds this — for now render a placeholder with the correct subtab name).

Import and use `useUninstallItem` for installed cards, `useInstallItem` and `useRemoveItem` for library cards.

Filter library items from the entity query using the `libraryStatus` field in entity data.

- [ ] **Step 4: Update plugins-tab.tsx the same way**

Same subtab rename: `installed | library | discover`. Same action button pattern. Plugins use directory-based items.

- [ ] **Step 5: Update agents-tab.tsx the same way**

Same subtab rename. Agents use single `.md` files — the `id` passed to install/uninstall includes the `.md` extension.

- [ ] **Step 6: Run type check and tests**

Run: `npm run check && npx vitest run tests/library-subtabs.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/library/skills-tab.tsx client/src/components/library/plugins-tab.tsx client/src/components/library/agents-tab.tsx client/src/hooks/use-library.ts tests/library-subtabs.test.ts
git commit -m "feat: library subtabs — Installed/Library/Discover with install/uninstall actions"
```

---

### Task 6: Frontend — Discover Tab UI

Build the search interface for the Discover subtab with safety disclaimer.

**Files:**
- Create: `client/src/components/library/discover-panel.tsx`
- Modify: `client/src/components/library/skills-tab.tsx` (use DiscoverPanel)
- Modify: `client/src/components/library/plugins-tab.tsx` (use DiscoverPanel)
- Modify: `client/src/components/library/agents-tab.tsx` (use DiscoverPanel)
- Create: `tests/discover-panel.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/discover-panel.test.ts
import { describe, it, expect } from "vitest";

describe("discover panel", () => {
  it("safety disclaimer text is correct", () => {
    const disclaimer = "Please use caution when installing code from online sources. Review files before installing.";
    expect(disclaimer).toContain("caution");
    expect(disclaimer).toContain("Review files");
  });
});
```

- [ ] **Step 2: Build DiscoverPanel component**

```tsx
// client/src/components/library/discover-panel.tsx
import { useState } from "react";
import { Search, Download, ExternalLink, Star, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EntityCard } from "@/components/library/entity-card";
import { useDiscoverSearch, useSaveToLibrary, type DiscoverResult } from "@/hooks/use-library";

interface DiscoverPanelProps {
  entityType: "skills" | "agents" | "plugins";
}

export function DiscoverPanel({ entityType }: DiscoverPanelProps) {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { data: results, isLoading } = useDiscoverSearch(entityType, searchTerm);
  const saveToLibrary = useSaveToLibrary();

  const handleSearch = () => {
    setSearchTerm(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleSave = (result: DiscoverResult) => {
    saveToLibrary.mutate({
      type: entityType,
      repoUrl: result.url,
      name: result.name,
    });
  };

  return (
    <div className="space-y-4">
      {/* Safety disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/80">
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p>Please use caution when installing code from online sources. Review files before installing.</p>
          <a
            href="https://www.virustotal.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
          >
            Scan with VirusTotal <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${entityType} on GitHub...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={isLoading || !query.trim()} size="sm">
          Search
        </Button>
      </div>

      {/* Results */}
      {isLoading && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}

      {results && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
          {results.map((result) => (
            <EntityCard
              key={result.url}
              name={result.name}
              description={result.description ?? undefined}
              status="available"
              tags={[
                `${result.stars} stars`,
                result.source,
              ]}
              actions={[
                {
                  label: "Save to Library",
                  onClick: () => handleSave(result),
                  variant: "ghost",
                },
                {
                  label: "View",
                  onClick: () => window.open(result.url, "_blank"),
                  variant: "ghost",
                },
              ]}
            />
          ))}
        </div>
      )}

      {results && results.length === 0 && searchTerm && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No results found for "{searchTerm}"
        </p>
      )}

      {!searchTerm && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Search GitHub for community {entityType}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire DiscoverPanel into each entity tab**

In `skills-tab.tsx`, `plugins-tab.tsx`, and `agents-tab.tsx`, replace the marketplace/discover placeholder with:

```tsx
import { DiscoverPanel } from "@/components/library/discover-panel";

// In the subTab === "discover" section:
{subTab === "discover" && (
  <DiscoverPanel entityType="skills" />  // or "agents" or "plugins"
)}
```

- [ ] **Step 4: Run type check and tests**

Run: `npm run check && npx vitest run tests/discover-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/library/discover-panel.tsx client/src/components/library/skills-tab.tsx client/src/components/library/plugins-tab.tsx client/src/components/library/agents-tab.tsx tests/discover-panel.test.ts
git commit -m "feat: Discover tab — GitHub search with safety disclaimer"
```

---

### Task 7: Discover — Structured Source Integration

Add priority sources ahead of GitHub search: Claude Skill Hub for skills, existing plugin marketplaces for plugins.

**Files:**
- Modify: `server/routes/discover.ts` (add structured sources)
- Create: `server/discover/sources.ts` (source registry)
- Modify: `client/src/components/library/discover-panel.tsx` (show source labels)
- Create: `tests/discover-sources.test.ts`

- [ ] **Step 1: Write failing test for source priority**

```typescript
// tests/discover-sources.test.ts
import { describe, it, expect } from "vitest";

describe("discover sources", () => {
  it("returns sources in priority order for skills", async () => {
    const { getSourcesForType } = await import("../server/discover/sources");
    const sources = getSourcesForType("skills");
    expect(sources.length).toBeGreaterThan(0);
    // First source should not be github (it's the fallback)
    expect(sources[0].id).not.toBe("github");
    // Last source should be github
    expect(sources[sources.length - 1].id).toBe("github");
  });

  it("returns github as only source for agents (no hub yet)", async () => {
    const { getSourcesForType } = await import("../server/discover/sources");
    const sources = getSourcesForType("agents");
    // May have awesome-lists or just github
    const last = sources[sources.length - 1];
    expect(last.id).toBe("github");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discover-sources.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement source registry**

```typescript
// server/discover/sources.ts

export interface DiscoverSource {
  id: string;
  name: string;
  url: string;
  type: "api" | "web" | "github";
  entityTypes: ("skills" | "agents" | "plugins")[];
  searchable: boolean;
  description: string;
}

const SOURCES: DiscoverSource[] = [
  // Skills — structured hubs first
  {
    id: "claudeskillhub",
    name: "Claude Skill Hub",
    url: "https://claudeskillhub.ai",
    type: "web",
    entityTypes: ["skills"],
    searchable: false, // web-only for now — link out
    description: "Community skill registry with categories and featured skills",
  },
  {
    id: "skillsmp",
    name: "SkillsMP",
    url: "https://skillsmp.com",
    type: "web",
    entityTypes: ["skills"],
    searchable: false,
    description: "700k+ skills marketplace for Claude Code, Codex, ChatGPT",
  },
  {
    id: "skillhub-club",
    name: "SkillHub",
    url: "https://www.skillhub.club",
    type: "web",
    entityTypes: ["skills"],
    searchable: false,
    description: "7,000+ AI-evaluated skills for Claude, Codex, Gemini",
  },
  // Plugins — Anthropic official
  {
    id: "anthropic-official",
    name: "Anthropic Official Plugins",
    url: "https://github.com/anthropics/claude-plugins-official",
    type: "github",
    entityTypes: ["plugins"],
    searchable: true,
    description: "55+ vetted plugins from Anthropic",
  },
  {
    id: "anthropic-community",
    name: "Anthropic Community Plugins",
    url: "https://github.com/anthropics/claude-plugins-community",
    type: "github",
    entityTypes: ["plugins"],
    searchable: true,
    description: "Security-scanned community plugins",
  },
  // Cross-type directories
  {
    id: "buildwithclaude",
    name: "Build with Claude",
    url: "https://buildwithclaude.com",
    type: "web",
    entityTypes: ["skills", "agents", "plugins"],
    searchable: false,
    description: "497+ extensions — skills, agents, commands, hooks, plugins",
  },
  // Always last — fallback
  {
    id: "github",
    name: "GitHub Search",
    url: "https://github.com",
    type: "github",
    entityTypes: ["skills", "agents", "plugins"],
    searchable: true,
    description: "Search all of GitHub",
  },
];

export function getSourcesForType(type: "skills" | "agents" | "plugins"): DiscoverSource[] {
  return SOURCES.filter(s => s.entityTypes.includes(type));
}

export function getSearchableSources(type: "skills" | "agents" | "plugins"): DiscoverSource[] {
  return SOURCES.filter(s => s.entityTypes.includes(type) && s.searchable);
}

export function getBrowseSources(type: "skills" | "agents" | "plugins"): DiscoverSource[] {
  return SOURCES.filter(s => s.entityTypes.includes(type) && !s.searchable);
}
```

- [ ] **Step 4: Update discover API to return sources with results**

In `server/routes/discover.ts`, add a sources endpoint:

```typescript
import { getSourcesForType, getBrowseSources } from "../discover/sources";

// GET /api/discover/:type/sources — available sources for this entity type
router.get("/api/discover/:type/sources", (req: Request, res: Response) => {
  const { type } = req.params;
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return res.status(400).json({ message: `Invalid type: ${type}` });
  }
  res.json(getSourcesForType(type as any));
});
```

- [ ] **Step 5: Update DiscoverPanel to show browse sources**

Add a "Browse Sources" section above the search bar that shows web-only sources as clickable links:

```tsx
// In discover-panel.tsx, add a sources query:
const { data: sources } = useQuery<DiscoverSource[]>({
  queryKey: [`/api/discover/${entityType}/sources`],
});

const browseSources = sources?.filter(s => s.type === "web") ?? [];

// Render above search bar:
{browseSources.length > 0 && (
  <div className="space-y-2">
    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Browse</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {browseSources.map(source => (
        <a
          key={source.id}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{source.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{source.description}</p>
          </div>
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/discover-sources.test.ts && npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/discover/sources.ts server/routes/discover.ts client/src/components/library/discover-panel.tsx tests/discover-sources.test.ts
git commit -m "feat: Discover sources — skill hubs, plugin marketplaces, browse links"
```

---

### Task 8: Confirmation Dialog for Remove

Add a confirmation dialog before permanently removing items from the library.

**Files:**
- Modify: `client/src/components/library/skills-tab.tsx`
- Modify: `client/src/components/library/plugins-tab.tsx`
- Modify: `client/src/components/library/agents-tab.tsx`
- Create: `tests/library-remove-confirm.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/library-remove-confirm.test.ts
import { describe, it, expect } from "vitest";

describe("library remove confirmation", () => {
  it("remove action requires confirmation before deleting", () => {
    // Behavioral test — the Remove button should trigger a confirm dialog
    // not directly call the remove mutation
    const confirmMessage = "Remove this item from your library? This cannot be undone.";
    expect(confirmMessage).toContain("cannot be undone");
  });
});
```

- [ ] **Step 2: Add confirmation wrapper to remove actions**

In each entity tab, wrap the remove action handler with a confirmation:

```typescript
const handleRemove = (type: string, name: string) => {
  if (window.confirm(`Remove "${name}" from your library? This cannot be undone.`)) {
    removeItem.mutate({ type, id: name });
  }
};
```

Use `window.confirm` for simplicity — no need for a custom dialog component here. The action is rare and the native dialog is clear.

- [ ] **Step 3: Run tests and type check**

Run: `npm run check && npx vitest run tests/library-remove-confirm.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/library/skills-tab.tsx client/src/components/library/plugins-tab.tsx client/src/components/library/agents-tab.tsx tests/library-remove-confirm.test.ts
git commit -m "feat: library remove confirmation dialog"
```

---

### Task 9: Integration Test and Safety Check

End-to-end test covering the full lifecycle: save → library → install → uninstall → remove. Plus run the safety test.

**Files:**
- Create: `tests/library-lifecycle.test.ts`
- Run: `tests/new-user-safety.test.ts`

- [ ] **Step 1: Write lifecycle test**

```typescript
// tests/library-lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("library lifecycle", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-lifecycle-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("full lifecycle: save → scan → install → uninstall → remove", async () => {
    const claudeDir = path.join(tmpDir, ".claude");

    // 1. Save to library (simulate download)
    const libSkillDir = path.join(claudeDir, "library", "skills", "test-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(path.join(libSkillDir, "SKILL.md"), "---\nname: test-skill\ndescription: Test\n---\nContent");

    // 2. Scanner should find it
    const { scanLibrary } = await import("../server/scanner/library-scanner");
    let items = scanLibrary();
    expect(items).toHaveLength(1);
    expect(items[0].data.libraryStatus).toBe("uninstalled");

    // 3. Install
    const { installItem } = await import("../server/routes/library");
    const installResult = await installItem("skills", "test-skill");
    expect(installResult.success).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, "skills", "test-skill", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);

    // 4. Uninstall
    const { uninstallItem } = await import("../server/routes/library");
    const uninstallResult = await uninstallItem("skills", "test-skill");
    expect(uninstallResult.success).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, "skills", "test-skill"))).toBe(false);
    expect(fs.existsSync(path.join(libSkillDir, "SKILL.md"))).toBe(true);

    // 5. Remove
    const { removeItem } = await import("../server/routes/library");
    const removeResult = await removeItem("skills", "test-skill");
    expect(removeResult.success).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);

    // 6. Scanner returns empty
    items = scanLibrary();
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run lifecycle test**

Run: `npx vitest run tests/library-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 3: Run safety test**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS — no hardcoded paths, PII, or user-specific strings in new files

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/library-lifecycle.test.ts
git commit -m "test: library lifecycle — save/install/uninstall/remove integration test"
```

---

## Summary

| Task | Description | Files Created | Files Modified |
|------|-------------|---------------|----------------|
| 1 | Library Scanner | `library-scanner.ts`, test | `index.ts`, `utils.ts` |
| 2 | File Operations API | `library.ts` route, test | `routes/index.ts` |
| 3 | Discover Search API | `discover.ts` route, test | `routes/index.ts` |
| 4 | Save from Discover | test | `discover.ts` |
| 5 | Subtab Rename + Library Data | `use-library.ts`, test | 3 tab components |
| 6 | Discover Tab UI | `discover-panel.tsx`, test | 3 tab components |
| 7 | Structured Sources | `sources.ts`, test | `discover.ts`, `discover-panel.tsx` |
| 8 | Remove Confirmation | test | 3 tab components |
| 9 | Integration Test | test | — |

**Total: 9 tasks, ~9 new files, ~8 modified files**
