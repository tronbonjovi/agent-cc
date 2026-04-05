# Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flexible, project-level task management system with kanban board, drag-and-drop, and markdown-based task files.

**Architecture:** Tasks are markdown files with YAML frontmatter in `{project}/.claude/tasks/`. A task scanner discovers them, API routes provide CRUD + reorder, and a React kanban board UI with `@dnd-kit` provides drag-and-drop interaction. Board config (statuses, column order) lives in `_config.md`.

**Tech Stack:** Express.js routes, gray-matter (existing), @dnd-kit (new), React + TanStack Query, shadcn/ui components, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-05-task-management-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `shared/task-types.ts` | Type definitions for tasks, config, board state |
| `server/task-io.ts` | Read/write task markdown files, ID generation, atomic writes |
| `server/scanner/task-scanner.ts` | Discover task files in project directories |
| `server/routes/tasks.ts` | API routes for task CRUD, reorder, config |
| `client/src/hooks/use-tasks.ts` | React Query hooks for task API |
| `client/src/pages/tasks.tsx` | Task board page with sidebar + breadcrumb + kanban |
| `client/src/components/tasks/kanban-board.tsx` | Board with columns, drag-and-drop |
| `client/src/components/tasks/kanban-column.tsx` | Single status column with card stack |
| `client/src/components/tasks/task-card.tsx` | Rich task card component |
| `client/src/components/tasks/task-detail-panel.tsx` | Slide-out edit panel using Sheet |
| `client/src/components/tasks/task-sidebar.tsx` | Project picker + hierarchy tree |
| `client/src/components/tasks/board-setup.tsx` | First-time setup dialog |
| `client/src/components/tasks/inline-create.tsx` | Inline task creation form |
| `tests/task-io.test.ts` | Tests for task file I/O |
| `tests/task-scanner.test.ts` | Tests for task scanner |
| `tests/task-routes.test.ts` | Tests for API routes |

### Modified Files

| File | Change |
|------|--------|
| `server/scanner/markdown-scanner.ts:105,130-135` | Filter out `.claude/tasks/` files |
| `server/scanner/index.ts:6,63,72` | Import and call task scanner |
| `server/routes/index.ts:2,60` | Import and register tasks router |
| `client/src/App.tsx:16,60` | Add lazy import and route for tasks page |
| `client/src/components/layout.tsx:36-68` | Add Tasks sub-item under Projects in nav |
| `client/src/lib/queryClient.ts:4` | Add `/api/tasks` to invalidateDataQueries |

---

## Task 1: Shared Task Types

**Files:**
- Create: `shared/task-types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// shared/task-types.ts

export interface TaskItem {
  id: string;
  title: string;
  type: string;
  status: string;
  parent?: string;
  priority?: string;
  labels?: string[];
  created: string;
  updated: string;
  body: string;
  filePath: string;
}

export interface TaskConfig {
  statuses: string[];
  types: string[];
  defaultType: string;
  defaultPriority: string;
  columnOrder: Record<string, string[]>;
}

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  statuses: ["backlog", "todo", "in-progress", "review", "done"],
  types: ["roadmap", "milestone", "task"],
  defaultType: "task",
  defaultPriority: "medium",
  columnOrder: {},
};

export interface TaskBoardState {
  projectId: string;
  projectName: string;
  projectPath: string;
  config: TaskConfig;
  items: TaskItem[];
  malformedCount: number;
}

export interface CreateTaskInput {
  title: string;
  type?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  parent?: string;
  body?: string;
}

export interface UpdateTaskInput {
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  parent?: string | null;
  body?: string;
  expectedUpdated?: string;
}

export interface ReorderInput {
  columnOrder: Record<string, string[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/task-types.ts
git commit -m "feat(tasks): add shared type definitions"
```

---

## Task 2: Task File I/O

**Files:**
- Create: `server/task-io.ts`
- Create: `tests/task-io.test.ts`

- [ ] **Step 1: Write failing tests for task I/O**

```typescript
// tests/task-io.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-io-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

// Import after setup
const { parseTaskFile, writeTaskFile, parseConfigFile, writeConfigFile, generateTaskId, taskFilename } = await import("../server/task-io");

describe("task-io", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generateTaskId", () => {
    it("generates itm- prefixed IDs", () => {
      const id = generateTaskId();
      expect(id).toMatch(/^itm-[a-f0-9]{8}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateTaskId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("taskFilename", () => {
    it("generates slug from type and title", () => {
      expect(taskFilename("task", "Implement OAuth Login", "a1b2c3d4")).toBe("task-implement-oauth-login-a1b2.md");
    });

    it("handles special characters", () => {
      expect(taskFilename("milestone", "Phase 1: Auth & Setup!", "e5f6g7h8")).toBe("milestone-phase-1-auth-setup-e5f6.md");
    });

    it("truncates long slugs", () => {
      const longTitle = "This is a very long task title that should be truncated to a reasonable length";
      const filename = taskFilename("task", longTitle, "a1b2c3d4");
      expect(filename.length).toBeLessThan(80);
      expect(filename).toMatch(/^task-.*-a1b2\.md$/);
    });
  });

  describe("parseTaskFile", () => {
    it("parses valid task file", () => {
      const content = `---
id: itm-a1b2c3d4
title: Test Task
type: task
status: todo
priority: high
labels: [auth, backend]
created: "2026-04-05"
updated: "2026-04-05"
---

This is the task body.
`;
      const filePath = path.join(tmpDir, "task-test-a1b2.md");
      fs.writeFileSync(filePath, content);
      const result = parseTaskFile(filePath);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("itm-a1b2c3d4");
      expect(result!.title).toBe("Test Task");
      expect(result!.type).toBe("task");
      expect(result!.status).toBe("todo");
      expect(result!.priority).toBe("high");
      expect(result!.labels).toEqual(["auth", "backend"]);
      expect(result!.body.trim()).toBe("This is the task body.");
    });

    it("returns null for missing required fields", () => {
      const content = `---
title: No ID
type: task
---
`;
      const filePath = path.join(tmpDir, "bad-task.md");
      fs.writeFileSync(filePath, content);
      const result = parseTaskFile(filePath);
      expect(result).toBeNull();
    });

    it("returns null for non-existent file", () => {
      const result = parseTaskFile(path.join(tmpDir, "nope.md"));
      expect(result).toBeNull();
    });
  });

  describe("writeTaskFile", () => {
    it("writes task with frontmatter and body", () => {
      const filePath = path.join(tmpDir, "task-write-test-abcd.md");
      writeTaskFile(filePath, {
        id: "itm-abcd1234",
        title: "Write Test",
        type: "task",
        status: "todo",
        priority: "medium",
        labels: ["test"],
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "Task body here.",
        filePath,
      });
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = parseTaskFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe("itm-abcd1234");
      expect(parsed!.title).toBe("Write Test");
      expect(parsed!.body.trim()).toBe("Task body here.");
    });

    it("uses atomic write pattern", () => {
      const filePath = path.join(tmpDir, "task-atomic-test-efgh.md");
      writeTaskFile(filePath, {
        id: "itm-efgh5678",
        title: "Atomic Test",
        type: "task",
        status: "todo",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "",
        filePath,
      });
      // .tmp file should not linger
      expect(fs.existsSync(filePath + ".tmp")).toBe(false);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("parseConfigFile", () => {
    it("parses valid config", () => {
      const content = `---
type: task-config
statuses: [backlog, todo, in-progress, review, done]
types: [roadmap, milestone, task]
default_type: task
default_priority: medium
column_order:
  backlog: [itm-a1b2c3d4]
  todo: []
---
`;
      const filePath = path.join(tmpDir, "_config.md");
      fs.writeFileSync(filePath, content);
      const config = parseConfigFile(filePath);
      expect(config).not.toBeNull();
      expect(config!.statuses).toEqual(["backlog", "todo", "in-progress", "review", "done"]);
      expect(config!.columnOrder.backlog).toEqual(["itm-a1b2c3d4"]);
    });

    it("returns null for missing file", () => {
      const config = parseConfigFile(path.join(tmpDir, "missing-config.md"));
      expect(config).toBeNull();
    });
  });

  describe("writeConfigFile", () => {
    it("writes config with all fields", () => {
      const filePath = path.join(tmpDir, "_config-write.md");
      writeConfigFile(filePath, {
        statuses: ["todo", "done"],
        types: ["task"],
        defaultType: "task",
        defaultPriority: "low",
        columnOrder: { todo: ["itm-1"], done: [] },
      });
      const parsed = parseConfigFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.statuses).toEqual(["todo", "done"]);
      expect(parsed!.columnOrder.todo).toEqual(["itm-1"]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/task-io.test.ts`
Expected: FAIL — module `../server/task-io` does not exist

- [ ] **Step 3: Implement task-io module**

```typescript
// server/task-io.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";
import type { TaskItem, TaskConfig, DEFAULT_TASK_CONFIG } from "@shared/task-types";

export function generateTaskId(): string {
  return "itm-" + crypto.randomBytes(4).toString("hex");
}

export function taskFilename(type: string, title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = id.slice(4, 8); // first 4 chars after "itm-"
  return `${type}-${slug}-${suffix}.md`;
}

export function parseTaskFile(filePath: string): TaskItem | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    const d = parsed.data;

    // Required fields
    if (!d.id || !d.title || !d.type || !d.status || !d.created || !d.updated) {
      return null;
    }

    return {
      id: String(d.id),
      title: String(d.title),
      type: String(d.type),
      status: String(d.status),
      parent: d.parent ? String(d.parent) : undefined,
      priority: d.priority ? String(d.priority) : undefined,
      labels: Array.isArray(d.labels) ? d.labels.map(String) : undefined,
      created: String(d.created),
      updated: String(d.updated),
      body: parsed.content,
      filePath: filePath.replace(/\\/g, "/"),
    };
  } catch {
    return null;
  }
}

function writeAtomic(filePath: string, content: string): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function writeTaskFile(filePath: string, task: TaskItem): void {
  const frontmatter: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    created: task.created,
    updated: task.updated,
  };
  if (task.parent) frontmatter.parent = task.parent;
  if (task.priority) frontmatter.priority = task.priority;
  if (task.labels && task.labels.length > 0) frontmatter.labels = task.labels;

  const content = matter.stringify(task.body || "", frontmatter);
  writeAtomic(filePath, content);
}

export function parseConfigFile(filePath: string): TaskConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    const d = parsed.data;

    if (d.type !== "task-config") return null;

    return {
      statuses: Array.isArray(d.statuses) ? d.statuses.map(String) : ["backlog", "todo", "in-progress", "review", "done"],
      types: Array.isArray(d.types) ? d.types.map(String) : ["roadmap", "milestone", "task"],
      defaultType: d.default_type ? String(d.default_type) : "task",
      defaultPriority: d.default_priority ? String(d.default_priority) : "medium",
      columnOrder: (d.column_order && typeof d.column_order === "object")
        ? Object.fromEntries(
            Object.entries(d.column_order as Record<string, unknown>).map(
              ([k, v]) => [k, Array.isArray(v) ? v.map(String) : []]
            )
          )
        : {},
    };
  } catch {
    return null;
  }
}

export function writeConfigFile(filePath: string, config: TaskConfig): void {
  const frontmatter: Record<string, unknown> = {
    type: "task-config",
    statuses: config.statuses,
    types: config.types,
    default_type: config.defaultType,
    default_priority: config.defaultPriority,
    column_order: config.columnOrder,
  };
  const content = matter.stringify("", frontmatter);
  writeAtomic(filePath, content);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/task-io.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/task-io.ts tests/task-io.test.ts
git commit -m "feat(tasks): add task file I/O with frontmatter parsing"
```

---

## Task 3: Task Scanner

**Files:**
- Create: `server/scanner/task-scanner.ts`
- Create: `tests/task-scanner.test.ts`

- [ ] **Step 1: Write failing tests for task scanner**

```typescript
// tests/task-scanner.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-scanner-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

const { scanProjectTasks } = await import("../server/scanner/task-scanner");

describe("task-scanner", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty board state when no tasks directory exists", () => {
    const result = scanProjectTasks(tmpDir, "test-id", "test-project");
    expect(result.items).toEqual([]);
    expect(result.config.statuses).toEqual(["backlog", "todo", "in-progress", "review", "done"]);
    expect(result.malformedCount).toBe(0);
  });

  it("discovers task files in .claude/tasks/", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    fs.writeFileSync(path.join(tasksDir, "_config.md"), `---
type: task-config
statuses: [todo, done]
types: [task]
default_type: task
default_priority: medium
column_order:
  todo: [itm-aaaaaaaa]
  done: []
---
`);

    fs.writeFileSync(path.join(tasksDir, "task-test-aaaa.md"), `---
id: itm-aaaaaaaa
title: Test Task
type: task
status: todo
created: "2026-04-05"
updated: "2026-04-05"
---

Body text.
`);

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("itm-aaaaaaaa");
    expect(result.items[0].title).toBe("Test Task");
    expect(result.config.statuses).toEqual(["todo", "done"]);
    expect(result.config.columnOrder.todo).toEqual(["itm-aaaaaaaa"]);
  });

  it("counts malformed files", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    // Valid task
    fs.writeFileSync(path.join(tasksDir, "task-valid-aaaa.md"), `---
id: itm-valid001
title: Valid
type: task
status: todo
created: "2026-04-05"
updated: "2026-04-05"
---
`);

    // Malformed task (missing required fields)
    fs.writeFileSync(path.join(tasksDir, "task-bad-bbbb.md"), `---
title: Bad Task
---
`);

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(1);
    expect(result.malformedCount).toBe(1);
  });

  it("ignores non-md files and _config.md", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    fs.writeFileSync(path.join(tasksDir, "_config.md"), `---
type: task-config
statuses: [todo]
types: [task]
default_type: task
default_priority: medium
column_order: {}
---
`);
    fs.writeFileSync(path.join(tasksDir, "notes.txt"), "not a task");

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(0);
    expect(result.malformedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/task-scanner.test.ts`
Expected: FAIL — module `../server/scanner/task-scanner` does not exist

- [ ] **Step 3: Implement task scanner**

```typescript
// server/scanner/task-scanner.ts
import fs from "fs";
import path from "path";
import { parseTaskFile, parseConfigFile } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskBoardState, TaskConfig } from "@shared/task-types";

export function scanProjectTasks(projectPath: string, projectId: string, projectName: string): TaskBoardState {
  const tasksDir = path.join(projectPath, ".claude", "tasks").replace(/\\/g, "/");

  const result: TaskBoardState = {
    projectId,
    projectName,
    projectPath: projectPath.replace(/\\/g, "/"),
    config: { ...DEFAULT_TASK_CONFIG },
    items: [],
    malformedCount: 0,
  };

  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) {
    return result;
  }

  // Parse config
  const configPath = path.join(tasksDir, "_config.md").replace(/\\/g, "/");
  const parsedConfig = parseConfigFile(configPath);
  if (parsedConfig) {
    result.config = parsedConfig;
  }

  // Parse task files
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name === "_config.md") continue;

    const filePath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const task = parseTaskFile(filePath);
    if (task) {
      result.items.push(task);
    } else {
      result.malformedCount++;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/task-scanner.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/scanner/task-scanner.ts tests/task-scanner.test.ts
git commit -m "feat(tasks): add task scanner for discovering task files"
```

---

## Task 4: Scanner Integration

**Files:**
- Modify: `server/scanner/markdown-scanner.ts`
- Modify: `server/scanner/index.ts`

- [ ] **Step 1: Filter tasks from markdown scanner**

In `server/scanner/markdown-scanner.ts`, add a filter inside `addMarkdownFile` to skip files in `tasks/` directories. Add this check right after line 23 (`if (seen.has(normalized)) return;`):

```typescript
// Skip task management files — handled by task-scanner
if (normalized.includes("/.claude/tasks/") || normalized.includes("\\.claude\\tasks\\")) return;
```

- [ ] **Step 2: Import task scanner in index.ts**

In `server/scanner/index.ts`, add the import at line 8 (after other scanner imports):

```typescript
import { scanProjectTasks } from "./task-scanner";
```

Note: The task scanner is called per-project from the API routes, not from `runFullScan()`. The full scan discovers projects; the task API reads tasks on-demand from the filesystem. No changes needed to `runFullScan()` — the import is for potential future use in partial scans.

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS — no regressions

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add server/scanner/markdown-scanner.ts server/scanner/index.ts
git commit -m "feat(tasks): filter task files from markdown scanner"
```

---

## Task 5: Task API Routes — Read

**Files:**
- Create: `server/routes/tasks.ts`
- Create: `tests/task-routes.test.ts`

- [ ] **Step 1: Write failing tests for read routes**

```typescript
// tests/task-routes.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-routes-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.COMMAND_CENTER_DATA = tmpDir;

const { Storage } = await import("../server/storage");
const { getDB } = await import("../server/db");

// We need a project entity to test against
function setupProjectEntity(storage: InstanceType<typeof Storage>, projectPath: string): string {
  const { entityId } = require("../server/scanner/utils");
  const id = entityId(`project:${projectPath}`);
  storage.upsertEntity({
    id,
    type: "project",
    name: "Test Project",
    path: projectPath,
    description: null,
    lastModified: null,
    tags: [],
    health: "ok",
    data: { projectKey: "test", sessionCount: 0, sessionSize: 0, hasClaudeMd: false, hasMemory: false },
    scannedAt: new Date().toISOString(),
  });
  return id;
}

describe("task routes", () => {
  let storage: InstanceType<typeof Storage>;
  let projectPath: string;
  let projectId: string;

  beforeEach(() => {
    // Reset
    const db = getDB();
    for (const key of Object.keys(db.entities)) delete db.entities[key];
    db.relationships = [];

    storage = new Storage();
    projectPath = path.join(tmpDir, "test-project-" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(projectPath, { recursive: true });
    projectId = setupProjectEntity(storage, projectPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("scanProjectTasks via route logic", () => {
    it("returns empty board for project without tasks", async () => {
      const { scanProjectTasks } = await import("../server/scanner/task-scanner");
      const board = scanProjectTasks(projectPath, projectId, "Test Project");
      expect(board.items).toEqual([]);
      expect(board.config.statuses).toHaveLength(5);
    });

    it("returns tasks when they exist", async () => {
      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });

      fs.writeFileSync(path.join(tasksDir, "_config.md"), `---
type: task-config
statuses: [todo, done]
types: [task]
default_type: task
default_priority: medium
column_order:
  todo: [itm-route001]
  done: []
---
`);

      fs.writeFileSync(path.join(tasksDir, "task-test-rout.md"), `---
id: itm-route001
title: Route Test Task
type: task
status: todo
created: "2026-04-05"
updated: "2026-04-05"
---

Test body.
`);

      const { scanProjectTasks } = await import("../server/scanner/task-scanner");
      const board = scanProjectTasks(projectPath, projectId, "Test Project");
      expect(board.items).toHaveLength(1);
      expect(board.items[0].title).toBe("Route Test Task");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/task-routes.test.ts`
Expected: Tests should pass (these test scanner logic used by routes). If there are import issues, fix them.

- [ ] **Step 3: Implement read routes**

```typescript
// server/routes/tasks.ts
import { Router } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { parseTaskFile, writeTaskFile, parseConfigFile, writeConfigFile, generateTaskId, taskFilename } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskItem, CreateTaskInput, UpdateTaskInput, ReorderInput } from "@shared/task-types";

const router = Router();

function getProjectPath(projectId: string): string | null {
  const entity = storage.getEntity(projectId);
  if (!entity || entity.type !== "project") return null;
  return entity.path;
}

function getTasksDir(projectPath: string): string {
  return path.join(projectPath, ".claude", "tasks").replace(/\\/g, "/");
}

function findTaskFile(tasksDir: string, taskId: string): TaskItem | null {
  if (!fs.existsSync(tasksDir)) return null;
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_config.md") continue;
    const filePath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const task = parseTaskFile(filePath);
    if (task && task.id === taskId) return task;
  }
  return null;
}

// GET /api/tasks/project/:projectId — all tasks for a project
router.get("/api/tasks/project/:projectId", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const entity = storage.getEntity(req.params.projectId)!;
  const board = scanProjectTasks(projectPath, req.params.projectId, entity.name);
  res.json(board);
});

// GET /api/tasks/:taskId — single task (requires projectId query param)
router.get("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });

  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const task = findTaskFile(getTasksDir(projectPath), req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// GET /api/tasks/project/:projectId/config — board config
router.get("/api/tasks/project/:projectId/config", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const configPath = path.join(getTasksDir(projectPath), "_config.md");
  const config = parseConfigFile(configPath);
  res.json(config || DEFAULT_TASK_CONFIG);
});

export default router;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/task-routes.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/tasks.ts tests/task-routes.test.ts
git commit -m "feat(tasks): add read API routes for tasks and config"
```

---

## Task 6: Task API Routes — Write

**Files:**
- Modify: `server/routes/tasks.ts`

- [ ] **Step 1: Add create, update, delete routes to tasks.ts**

Append the following routes to `server/routes/tasks.ts` before `export default router`:

```typescript
// POST /api/tasks/project/:projectId — create task
router.post("/api/tasks/project/:projectId", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const tasksDir = getTasksDir(projectPath);

  // Auto-create directory and config if needed
  if (!fs.existsSync(tasksDir)) {
    try {
      fs.mkdirSync(tasksDir, { recursive: true });
      writeConfigFile(path.join(tasksDir, "_config.md"), { ...DEFAULT_TASK_CONFIG });
    } catch (err) {
      return res.status(403).json({ error: "Cannot create tasks directory — not writable" });
    }
  }

  const input: CreateTaskInput = req.body;
  if (!input.title) return res.status(400).json({ error: "title is required" });

  // Load current config for defaults
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath) || { ...DEFAULT_TASK_CONFIG };

  const id = generateTaskId();
  const now = new Date().toISOString().split("T")[0];
  const task: TaskItem = {
    id,
    title: input.title,
    type: input.type || config.defaultType,
    status: input.status || config.statuses[0],
    parent: input.parent,
    priority: input.priority || config.defaultPriority,
    labels: input.labels,
    created: now,
    updated: now,
    body: input.body || "",
    filePath: "",
  };

  const filename = taskFilename(task.type, task.title, id);
  task.filePath = path.join(tasksDir, filename).replace(/\\/g, "/");

  try {
    writeTaskFile(task.filePath, task);
  } catch (err) {
    return res.status(500).json({ error: "Failed to write task file" });
  }

  // Add to column order
  const col = config.columnOrder[task.status];
  if (col) {
    col.push(id);
  } else {
    config.columnOrder[task.status] = [id];
  }
  writeConfigFile(configPath, config);

  res.status(201).json(task);
});

// PUT /api/tasks/:taskId — update task
router.put("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });

  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const tasksDir = getTasksDir(projectPath);
  const existing = findTaskFile(tasksDir, req.params.taskId);
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const input: UpdateTaskInput = req.body;

  // Concurrency check
  if (input.expectedUpdated && existing.updated !== input.expectedUpdated) {
    return res.status(409).json({ error: "Conflict — task was modified", current: existing });
  }

  const oldStatus = existing.status;
  const now = new Date().toISOString().split("T")[0];

  // Apply updates
  if (input.title !== undefined) existing.title = input.title;
  if (input.type !== undefined) existing.type = input.type;
  if (input.status !== undefined) existing.status = input.status;
  if (input.priority !== undefined) existing.priority = input.priority;
  if (input.labels !== undefined) existing.labels = input.labels;
  if (input.parent !== undefined) existing.parent = input.parent || undefined;
  if (input.body !== undefined) existing.body = input.body;
  existing.updated = now;

  try {
    writeTaskFile(existing.filePath, existing);
  } catch (err) {
    return res.status(500).json({ error: "Failed to write task file" });
  }

  // Update column order if status changed
  if (input.status !== undefined && input.status !== oldStatus) {
    const configPath = path.join(tasksDir, "_config.md");
    const config = parseConfigFile(configPath) || { ...DEFAULT_TASK_CONFIG };

    // Remove from old column
    if (config.columnOrder[oldStatus]) {
      config.columnOrder[oldStatus] = config.columnOrder[oldStatus].filter((id: string) => id !== existing.id);
    }
    // Add to new column
    if (!config.columnOrder[input.status]) config.columnOrder[input.status] = [];
    config.columnOrder[input.status].push(existing.id);

    writeConfigFile(configPath, config);
  }

  res.json(existing);
});

// DELETE /api/tasks/:taskId — delete task
router.delete("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });

  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const tasksDir = getTasksDir(projectPath);
  const task = findTaskFile(tasksDir, req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });

  try {
    fs.unlinkSync(task.filePath);
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete task file" });
  }

  // Remove from column order
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath);
  if (config) {
    for (const status of Object.keys(config.columnOrder)) {
      config.columnOrder[status] = config.columnOrder[status].filter((id: string) => id !== task.id);
    }
    writeConfigFile(configPath, config);
  }

  // Orphan children — clear parent reference for any child tasks
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_config.md") continue;
    const childPath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const child = parseTaskFile(childPath);
    if (child && child.parent === task.id) {
      child.parent = undefined;
      child.updated = new Date().toISOString().split("T")[0];
      writeTaskFile(childPath, child);
    }
  }

  res.json({ deleted: true, id: task.id });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/task-routes.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/routes/tasks.ts
git commit -m "feat(tasks): add create, update, delete API routes"
```

---

## Task 7: Reorder Route + Registration

**Files:**
- Modify: `server/routes/tasks.ts`
- Modify: `server/routes/index.ts`

- [ ] **Step 1: Add reorder and config update routes**

Append to `server/routes/tasks.ts` before `export default router`:

```typescript
// PUT /api/tasks/project/:projectId/reorder — update column order
router.put("/api/tasks/project/:projectId/reorder", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const tasksDir = getTasksDir(projectPath);
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath);
  if (!config) return res.status(404).json({ error: "Board not initialized" });

  const input: ReorderInput = req.body;
  if (!input.columnOrder) return res.status(400).json({ error: "columnOrder required" });

  config.columnOrder = input.columnOrder;
  writeConfigFile(configPath, config);
  res.json(config);
});

// PUT /api/tasks/project/:projectId/config — update board config
router.put("/api/tasks/project/:projectId/config", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });

  const tasksDir = getTasksDir(projectPath);

  // Create directory if needed
  if (!fs.existsSync(tasksDir)) {
    try {
      fs.mkdirSync(tasksDir, { recursive: true });
    } catch {
      return res.status(403).json({ error: "Cannot create tasks directory — not writable" });
    }
  }

  const configPath = path.join(tasksDir, "_config.md");
  const existing = parseConfigFile(configPath);
  const config = { ...(existing || DEFAULT_TASK_CONFIG), ...req.body };

  // Preserve column_order from existing if not in request
  if (!req.body.columnOrder && existing) {
    config.columnOrder = existing.columnOrder;
  }

  writeConfigFile(configPath, config);
  res.json(config);
});
```

- [ ] **Step 2: Register routes in index.ts**

In `server/routes/index.ts`, add import at the top (after other router imports, around line 19):

```typescript
import tasksRouter from "./tasks";
```

Add registration inside `registerRoutes()` (after `app.use(apisRouter);` around line 78):

```typescript
  app.use(tasksRouter);
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass including new task tests

- [ ] **Step 4: Commit**

```bash
git add server/routes/tasks.ts server/routes/index.ts
git commit -m "feat(tasks): add reorder route, register task routes"
```

---

## Task 8: Client Foundation — Hooks, Routing, Navigation

**Files:**
- Create: `client/src/hooks/use-tasks.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout.tsx`
- Modify: `client/src/lib/queryClient.ts`

- [ ] **Step 1: Create React Query hooks for tasks**

```typescript
// client/src/hooks/use-tasks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { TaskBoardState, TaskItem, TaskConfig, CreateTaskInput, UpdateTaskInput, ReorderInput } from "@shared/task-types";

export function useTaskBoard(projectId: string | undefined) {
  return useQuery<TaskBoardState>({
    queryKey: [`/api/tasks/project/${projectId}`],
    enabled: !!projectId,
  });
}

export function useTaskConfig(projectId: string | undefined) {
  return useQuery<TaskConfig>({
    queryKey: [`/api/tasks/project/${projectId}/config`],
    enabled: !!projectId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const res = await apiRequest("POST", `/api/tasks/project/${projectId}`, input);
      return res.json() as Promise<TaskItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to create task: ${err.message}`); },
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...input }: UpdateTaskInput & { taskId: string }) => {
      const res = await apiRequest("PUT", `/api/tasks/${taskId}?projectId=${projectId}`, input);
      return res.json() as Promise<TaskItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to update task: ${err.message}`); },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("DELETE", `/api/tasks/${taskId}?projectId=${projectId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to delete task: ${err.message}`); },
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderInput) => {
      const res = await apiRequest("PUT", `/api/tasks/project/${projectId}/reorder`, input);
      return res.json() as Promise<TaskConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to reorder: ${err.message}`); },
  });
}

export function useUpdateTaskConfig(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<TaskConfig>) => {
      const res = await apiRequest("PUT", `/api/tasks/project/${projectId}/config`, config);
      return res.json() as Promise<TaskConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to update config: ${err.message}`); },
  });
}
```

- [ ] **Step 2: Add lazy import and route in App.tsx**

In `client/src/App.tsx`, add the lazy import (after the other page imports, around line 33):

```typescript
const Tasks = lazy(() => import("@/pages/tasks"));
```

Add the route inside `<Switch>` (after the `/projects/:id` route, around line 69):

```typescript
            <Route path="/tasks">
              <ErrorBoundary pageName="Tasks"><Tasks /></ErrorBoundary>
            </Route>
            <Route path="/tasks/:projectId">
              <ErrorBoundary pageName="Tasks"><Tasks /></ErrorBoundary>
            </Route>
```

- [ ] **Step 3: Add Tasks to sidebar navigation**

In `client/src/components/layout.tsx`, add the `CheckSquare` import to the lucide-react import block (line 12):

```typescript
  CheckSquare,
```

In the `navSections` array, add a `children` field to the Projects item and render Tasks as a sub-item. Replace the Entities section (lines 43-52) with:

```typescript
  {
    label: "Entities",
    items: [
      { path: "/projects", label: "Projects", icon: FolderOpen, countKey: "project" as const,
        children: [
          { path: "/tasks", label: "Tasks", icon: CheckSquare, countKey: null },
        ],
      },
      { path: "/mcps", label: "MCP Servers", icon: Server, countKey: "mcp" as const },
      { path: "/skills", label: "Skills", icon: Wand2, countKey: "skill" as const },
      { path: "/plugins", label: "Plugins", icon: Puzzle, countKey: "plugin" as const },
      { path: "/markdown", label: "Markdown", icon: FileText, countKey: "markdown" as const },
      { path: "/apis", label: "APIs", icon: Globe, countKey: null },
    ],
  },
```

Then in the rendering logic (around line 136), after the nav item is rendered, add child rendering. After `return navContent;` (line 195) and before the closing `})}`, add:

```typescript
                    // Render children if present and not collapsed
                    {!collapsed && item.children && item.children.map((child) => {
                      const isChildActive = location.startsWith(child.path);
                      return (
                        <Link key={child.path} href={child.path}>
                          <div
                            className={cn(
                              "flex items-center rounded-md pl-9 pr-3 py-1.5 text-xs transition-all duration-150 cursor-pointer group relative",
                              isChildActive
                                ? "bg-gradient-to-r from-brand-1/10 via-brand-2/8 to-transparent text-sidebar-accent-foreground font-medium"
                                : "text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            )}
                          >
                            <child.icon className={cn("h-3.5 w-3.5 mr-2 flex-shrink-0", isChildActive && "text-nav-active")} />
                            <span>{child.label}</span>
                          </div>
                        </Link>
                      );
                    })}
```

Note: This requires updating the TypeScript type for nav items to support the optional `children` field. Add a type above `navSections`:

```typescript
interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey: string | null;
  children?: NavItem[];
}
```

- [ ] **Step 4: Add tasks to query invalidation**

In `client/src/lib/queryClient.ts`, add `/api/tasks` to the `invalidateDataQueries` function's key list (line 4):

```typescript
export function invalidateDataQueries(qc: QueryClient) {
  for (const key of ["/api/entities", "/api/scanner/status", "/api/projects", "/api/sessions", "/api/graph", "/api/apis", "/api/live", "/api/stats", "/api/markdown", "/api/tasks"]) {
```

- [ ] **Step 5: Create stub tasks page**

```typescript
// client/src/pages/tasks.tsx
import { useParams } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import type { ProjectEntity } from "@shared/types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const { data: projects } = useEntities<ProjectEntity>("project");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tasks</h1>
      <p className="text-muted-foreground">
        {params.projectId
          ? `Showing tasks for project ${params.projectId}`
          : `Select a project (${projects?.length || 0} available)`
        }
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run type check and tests**

Run: `npm run check`
Expected: No TypeScript errors

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/use-tasks.ts client/src/pages/tasks.tsx client/src/App.tsx client/src/components/layout.tsx client/src/lib/queryClient.ts
git commit -m "feat(tasks): add client hooks, routing, and nav integration"
```

---

## Task 9: Task Sidebar Component

**Files:**
- Create: `client/src/components/tasks/task-sidebar.tsx`

- [ ] **Step 1: Create task sidebar with project picker and hierarchy tree**

```typescript
// client/src/components/tasks/task-sidebar.tsx
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

interface TaskSidebarProps {
  projects: ProjectEntity[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  items: TaskItem[];
  selectedParent: string | null;
  onSelectParent: (id: string | null) => void;
}

export function TaskSidebar({ projects, selectedProjectId, onSelectProject, items, selectedParent, onSelectParent }: TaskSidebarProps) {
  return (
    <aside className="w-56 border-r bg-sidebar flex flex-col">
      <div className="p-3 border-b">
        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Projects</div>
        <ScrollArea className="max-h-40">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelectProject(p.id); onSelectParent(null); }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                selectedProjectId === p.id
                  ? "bg-brand-1/15 text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </ScrollArea>
      </div>

      {selectedProjectId && items.length > 0 && (
        <div className="p-3 flex-1">
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Hierarchy</div>
          <ScrollArea className="flex-1">
            <button
              onClick={() => onSelectParent(null)}
              className={cn(
                "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                selectedParent === null ? "bg-brand-1/10 font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50"
              )}
            >
              All Items
            </button>
            <HierarchyTree
              items={items}
              parentId={undefined}
              depth={0}
              selectedParent={selectedParent}
              onSelectParent={onSelectParent}
            />
          </ScrollArea>
        </div>
      )}
    </aside>
  );
}

function HierarchyTree({ items, parentId, depth, selectedParent, onSelectParent }: {
  items: TaskItem[];
  parentId: string | undefined;
  depth: number;
  selectedParent: string | null;
  onSelectParent: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const children = items.filter((i) => i.parent === parentId && i.type !== "task");

  if (children.length === 0) return null;

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {children.map((item) => {
        const hasChildren = items.some((i) => i.parent === item.id);
        const isExpanded = expanded.has(item.id);
        const isSelected = selectedParent === item.id;

        return (
          <div key={item.id}>
            <button
              onClick={() => {
                onSelectParent(item.id);
                if (hasChildren) {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }
              }}
              className={cn(
                "w-full flex items-center gap-1 px-2 py-1 rounded text-xs text-left transition-colors",
                isSelected ? "bg-brand-1/10 font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50"
              )}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
              ) : (
                <span className="w-3" />
              )}
              <span className="truncate">{item.title}</span>
            </button>
            {hasChildren && isExpanded && (
              <HierarchyTree items={items} parentId={item.id} depth={depth + 1} selectedParent={selectedParent} onSelectParent={onSelectParent} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/tasks/task-sidebar.tsx
git commit -m "feat(tasks): add task sidebar with project picker and hierarchy"
```

---

## Task 10: Kanban Board + Columns

**Files:**
- Create: `client/src/components/tasks/kanban-board.tsx`
- Create: `client/src/components/tasks/kanban-column.tsx`

- [ ] **Step 1: Install @dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Create kanban column component**

```typescript
// client/src/components/tasks/kanban-column.tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { TaskItem } from "@shared/task-types";

interface KanbanColumnProps {
  status: string;
  items: TaskItem[];
  onAddTask: (status: string) => void;
  renderCard: (item: TaskItem) => React.ReactNode;
  inlineCreate?: React.ReactNode;
}

export function KanbanColumn({ status, items, onAddTask, renderCard, inlineCreate }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 min-w-[18rem] rounded-lg bg-muted/30 border",
        isOver && "ring-2 ring-brand-1/30"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</span>
          <span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">{items.length}</span>
        </div>
      </div>

      {/* Card stack */}
      <div className="flex-1 p-2 space-y-2 min-h-[100px] overflow-y-auto">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => renderCard(item))}
        </SortableContext>
      </div>

      {/* Inline create form or add button */}
      {inlineCreate || (
        <button
          onClick={() => onAddTask(status)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors border-t"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add task</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create kanban board component**

```typescript
// client/src/components/tasks/kanban-board.tsx
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { KanbanColumn } from "./kanban-column";
import { TaskCard, TaskCardDragOverlay } from "./task-card";
import { InlineCreate } from "./inline-create";
import type { TaskItem, TaskConfig, ReorderInput } from "@shared/task-types";

interface KanbanBoardProps {
  config: TaskConfig;
  items: TaskItem[];
  onReorder: (input: ReorderInput) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onAddTask: (status: string) => void;
  onClickTask: (task: TaskItem) => void;
  inlineCreateStatus: string | null;
  onCreateSubmit: (title: string, status: string) => void;
  onCreateCancel: () => void;
}

function getOrderedItems(items: TaskItem[], status: string, columnOrder: Record<string, string[]>): TaskItem[] {
  const order = columnOrder[status] || [];
  const statusItems = items.filter((i) => i.status === status);
  const ordered: TaskItem[] = [];
  for (const id of order) {
    const item = statusItems.find((i) => i.id === id);
    if (item) ordered.push(item);
  }
  // Append any items not in the order list
  for (const item of statusItems) {
    if (!order.includes(item.id)) ordered.push(item);
  }
  return ordered;
}

export function KanbanBoard({ config, items, onReorder, onStatusChange, onAddTask, onClickTask, inlineCreateStatus, onCreateSubmit, onCreateCancel }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<string, string[]> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const effectiveOrder = localOrder || config.columnOrder;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = items.find((i) => i.id === event.active.id);
    if (task) setActiveTask(task);
    setLocalOrder({ ...config.columnOrder });
  }, [items, config.columnOrder]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !localOrder) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which column the active item is in
    let activeColumn: string | null = null;
    for (const [status, ids] of Object.entries(localOrder)) {
      if (ids.includes(activeId)) { activeColumn = status; break; }
    }

    // Determine target column
    let overColumn: string | null = null;
    if (config.statuses.includes(overId)) {
      overColumn = overId;
    } else {
      for (const [status, ids] of Object.entries(localOrder)) {
        if (ids.includes(overId)) { overColumn = status; break; }
      }
    }

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    // Move between columns
    setLocalOrder((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      next[activeColumn!] = next[activeColumn!].filter((id) => id !== activeId);
      const overIndex = next[overColumn!].indexOf(overId);
      if (overIndex >= 0) {
        next[overColumn!].splice(overIndex, 0, activeId);
      } else {
        next[overColumn!].push(activeId);
      }
      return next;
    });
  }, [localOrder, config.statuses]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !localOrder) {
      setLocalOrder(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find column for active item
    let activeColumn: string | null = null;
    for (const [status, ids] of Object.entries(localOrder)) {
      if (ids.includes(activeId)) { activeColumn = status; break; }
    }

    if (!activeColumn) { setLocalOrder(null); return; }

    // Reorder within column
    if (activeId !== overId && localOrder[activeColumn].includes(overId)) {
      const oldIndex = localOrder[activeColumn].indexOf(activeId);
      const newIndex = localOrder[activeColumn].indexOf(overId);
      const newOrder = { ...localOrder };
      newOrder[activeColumn] = arrayMove(newOrder[activeColumn], oldIndex, newIndex);
      setLocalOrder(newOrder);
      onReorder({ columnOrder: newOrder });
    } else {
      onReorder({ columnOrder: localOrder });
    }

    // Check if status changed
    const originalTask = items.find((i) => i.id === activeId);
    if (originalTask && originalTask.status !== activeColumn) {
      onStatusChange(activeId, activeColumn);
    }

    setLocalOrder(null);
  }, [localOrder, items, onReorder, onStatusChange]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {config.statuses.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            items={getOrderedItems(items, status, effectiveOrder)}
            onAddTask={onAddTask}
            renderCard={(item) => (
              <TaskCard key={item.id} task={item} onClick={() => onClickTask(item)} />
            )}
            inlineCreate={inlineCreateStatus === status ? (
              <InlineCreate status={status} onSubmit={onCreateSubmit} onCancel={onCreateCancel} />
            ) : undefined}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && <TaskCardDragOverlay task={activeTask} />}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/tasks/kanban-board.tsx client/src/components/tasks/kanban-column.tsx package.json package-lock.json
git commit -m "feat(tasks): add kanban board and column components with dnd-kit"
```

---

## Task 11: Task Cards

**Files:**
- Create: `client/src/components/tasks/task-card.tsx`

- [ ] **Step 1: Create rich task card component**

```typescript
// client/src/components/tasks/task-card.tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import type { TaskItem } from "@shared/task-types";

const priorityColors: Record<string, string> = {
  high: "border-l-red-400/70",
  medium: "border-l-amber-400/70",
  low: "border-l-blue-400/70",
};

const priorityBadge: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-blue-500/15 text-blue-400",
};

interface TaskCardProps {
  task: TaskItem;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const preview = task.body?.trim().split("\n")[0]?.slice(0, 80);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 cursor-pointer transition-all",
        "hover:shadow-md hover:border-border/80",
        "border-l-[3px]",
        priorityColors[task.priority || ""] || "border-l-border",
        isDragging && "opacity-40 shadow-lg"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="text-sm font-medium leading-tight">{task.title}</div>

          {/* Parent context */}
          {task.parent && (
            <div className="text-[11px] text-muted-foreground/40 mt-0.5 truncate">{task.parent}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Priority badge */}
          {task.priority && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", priorityBadge[task.priority] || "bg-muted text-muted-foreground")}>
              {task.priority}
            </span>
          )}

          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Description preview */}
      {preview && (
        <div className="text-xs text-muted-foreground/50 mt-1.5 line-clamp-2 leading-relaxed">{preview}</div>
      )}

      {/* Labels + date row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {task.labels?.map((label) => (
          <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{label}</Badge>
        ))}
        {task.created && (
          <span className="text-[10px] text-muted-foreground/30 ml-auto">{task.created}</span>
        )}
      </div>
    </div>
  );
}

export function TaskCardDragOverlay({ task }: { task: TaskItem }) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-3 shadow-xl border-l-[3px] w-72 rotate-2",
      priorityColors[task.priority || ""] || "border-l-border"
    )}>
      <div className="text-sm font-medium">{task.title}</div>
      {task.priority && (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium mt-1 inline-block", priorityBadge[task.priority] || "bg-muted")}>
          {task.priority}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/tasks/task-card.tsx
git commit -m "feat(tasks): add rich task card with drag handle and priority"
```

---

## Task 12: Task Detail Panel

**Files:**
- Create: `client/src/components/tasks/task-detail-panel.tsx`

- [ ] **Step 1: Create slide-out detail panel**

```typescript
// client/src/components/tasks/task-detail-panel.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { TaskItem, TaskConfig } from "@shared/task-types";

interface TaskDetailPanelProps {
  task: TaskItem | null;
  config: TaskConfig;
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Record<string, unknown>) => void;
  onDelete: (taskId: string) => void;
  allItems: TaskItem[];
}

export function TaskDetailPanel({ task, config, open, onClose, onUpdate, onDelete, allItems }: TaskDetailPanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setBody(task.body || "");
      setStatus(task.status);
      setPriority(task.priority || "");
      setType(task.type);
      setParent(task.parent || null);
      setLabels(task.labels || []);
      setDirty(false);
      setConfirmDelete(false);
    }
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    onUpdate(task.id, {
      title,
      body,
      status,
      priority: priority || undefined,
      type,
      parent: parent || null,
      labels: labels.length > 0 ? labels : undefined,
      expectedUpdated: task.updated,
    });
    setDirty(false);
  };

  const handleAddLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setDirty(true);
    }
    setLabelInput("");
  };

  const parentOptions = allItems.filter((i) => i.id !== task.id && i.type !== "task");

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Task Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-2">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="w-full text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
            placeholder="Task title"
          />

          {/* Status + Priority + Type row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
                className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
              >
                {config.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value); setDirty(true); }}
                className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Type</label>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setDirty(true); }}
                className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
              >
                {config.types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Parent */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Parent</label>
            <select
              value={parent || ""}
              onChange={(e) => { setParent(e.target.value || null); setDirty(true); }}
              className="w-full text-sm bg-muted/50 border rounded px-2 py-1.5"
            >
              <option value="">None (top-level)</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.type})</option>)}
            </select>
          </div>

          {/* Labels */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Labels</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs gap-1">
                  {label}
                  <button onClick={() => { setLabels(labels.filter((l) => l !== label)); setDirty(true); }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabel(); } }}
                placeholder="Add label..."
                className="text-sm h-8"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1 block">Description</label>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              className="w-full min-h-[120px] text-sm bg-muted/30 border rounded p-2 resize-y font-mono"
              placeholder="Task description (markdown supported)"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-4 text-[11px] text-muted-foreground/40">
            <span>Created: {task.created}</span>
            <span>Updated: {task.updated}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            {!confirmDelete ? (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => { onDelete(task.id); onClose(); }}>Confirm Delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            )}
            <Button size="sm" disabled={!dirty} onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/tasks/task-detail-panel.tsx
git commit -m "feat(tasks): add slide-out task detail panel"
```

---

## Task 13: Inline Creation + Board Setup

**Files:**
- Create: `client/src/components/tasks/inline-create.tsx`
- Create: `client/src/components/tasks/board-setup.tsx`

- [ ] **Step 1: Create inline task creation component**

```typescript
// client/src/components/tasks/inline-create.tsx
import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface InlineCreateProps {
  status: string;
  onSubmit: (title: string, status: string) => void;
  onCancel: () => void;
}

export function InlineCreate({ status, onSubmit, onCancel }: InlineCreateProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (trimmed) {
      onSubmit(trimmed, status);
      setTitle("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="rounded-lg border bg-card p-2 mx-2 mb-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task title..."
        className="w-full text-sm bg-transparent border-none outline-none p-1"
      />
      <div className="flex justify-between items-center mt-1.5">
        <span className="text-[10px] text-muted-foreground/40">Enter to create, Esc to cancel</span>
        <button onClick={onCancel} className="text-muted-foreground/40 hover:text-muted-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create board setup component**

```typescript
// client/src/components/tasks/board-setup.tsx
import { Button } from "@/components/ui/button";
import { CheckSquare, Settings } from "lucide-react";
import type { TaskConfig } from "@shared/task-types";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";

interface BoardSetupProps {
  projectName: string;
  onAcceptDefaults: () => void;
}

export function BoardSetup({ projectName, onAcceptDefaults }: BoardSetupProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <CheckSquare className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Set up tasks for {projectName}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Create a task board to track work on this project. You'll get default columns
        (backlog, todo, in-progress, review, done) that you can customize anytime.
      </p>
      <div className="flex gap-3">
        <Button onClick={onAcceptDefaults}>
          <CheckSquare className="h-4 w-4 mr-2" />
          Create Board
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/40 mt-4">
        This creates a .claude/tasks/ directory in your project
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tasks/inline-create.tsx client/src/components/tasks/board-setup.tsx
git commit -m "feat(tasks): add inline creation and board setup components"
```

---

## Task 14: Wire Up the Tasks Page

**Files:**
- Modify: `client/src/pages/tasks.tsx`

- [ ] **Step 1: Replace stub with full task board page**

Replace the entire contents of `client/src/pages/tasks.tsx`:

```typescript
// client/src/pages/tasks.tsx
import { useParams, useLocation } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import { useTaskBoard, useCreateTask, useUpdateTask, useDeleteTask, useReorderTasks, useUpdateTaskConfig } from "@/hooks/use-tasks";
import { TaskSidebar } from "@/components/tasks/task-sidebar";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { InlineCreate } from "@/components/tasks/inline-create";
import { BoardSetup } from "@/components/tasks/board-setup";
import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading: loadingProjects } = useEntities<ProjectEntity>("project");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(params.projectId || null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [inlineCreateStatus, setInlineCreateStatus] = useState<string | null>(null);

  // Auto-select first project if none specified
  useEffect(() => {
    if (!selectedProjectId && projects?.length) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Sync URL with selected project
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== params.projectId) {
      setLocation(`/tasks/${selectedProjectId}`);
    }
  }, [selectedProjectId]);

  const { data: board, isLoading: loadingBoard } = useTaskBoard(selectedProjectId || undefined);
  const createTask = useCreateTask(selectedProjectId || "");
  const updateTask = useUpdateTask(selectedProjectId || "");
  const deleteTask = useDeleteTask(selectedProjectId || "");
  const reorderTasks = useReorderTasks(selectedProjectId || "");
  const updateConfig = useUpdateTaskConfig(selectedProjectId || "");

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  // Filter items by selected parent scope
  const visibleItems = board?.items.filter((item) => {
    if (selectedParent === null) return true;
    return item.parent === selectedParent;
  }) || [];

  // Breadcrumb segments
  const breadcrumbs: Array<{ label: string; id: string | null }> = [];
  if (selectedProject) {
    breadcrumbs.push({ label: selectedProject.name, id: null });
  }
  if (selectedParent && board) {
    // Walk up the parent chain
    const chain: TaskItem[] = [];
    let current = board.items.find((i) => i.id === selectedParent);
    while (current) {
      chain.unshift(current);
      current = current.parent ? board.items.find((i) => i.id === current!.parent) : undefined;
    }
    for (const item of chain) {
      breadcrumbs.push({ label: item.title, id: item.id });
    }
  }

  const handleAddTask = (status: string) => {
    setInlineCreateStatus(status);
  };

  const handleCreateTask = (title: string, status: string) => {
    createTask.mutate({
      title,
      status,
      parent: selectedParent || undefined,
    });
    setInlineCreateStatus(null);
  };

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateTask.mutate({ taskId, status: newStatus });
  };

  const handleSetupBoard = () => {
    updateConfig.mutate({});
  };

  if (loadingProjects) {
    return <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>;
  }

  const hasBoard = board && (board.items.length > 0 || board.config.statuses.length > 0);
  const needsSetup = selectedProjectId && board && board.items.length === 0 && Object.keys(board.config.columnOrder).length === 0 && board.config.statuses.length === 5;

  return (
    <div className="flex h-full">
      {/* Task sidebar */}
      <TaskSidebar
        projects={projects || []}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        items={board?.items || []}
        selectedParent={selectedParent}
        onSelectParent={setSelectedParent}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb bar */}
        {selectedProjectId && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />}
                <button
                  onClick={() => setSelectedParent(crumb.id)}
                  className={cn(
                    "hover:text-foreground transition-colors",
                    i === breadcrumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            {board?.malformedCount ? (
              <span className="ml-auto text-[10px] text-amber-500/70">{board.malformedCount} file(s) skipped</span>
            ) : null}
          </div>
        )}

        {/* Board area */}
        <div className="flex-1 overflow-auto p-4">
          {!selectedProjectId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">Select a project to view tasks</div>
          )}

          {selectedProjectId && loadingBoard && (
            <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>
          )}

          {selectedProjectId && !loadingBoard && needsSetup && !hasBoard && (
            <BoardSetup projectName={selectedProject?.name || ""} onAcceptDefaults={handleSetupBoard} />
          )}

          {selectedProjectId && board && hasBoard && (
            <KanbanBoard
              config={board.config}
              items={visibleItems}
              onReorder={(input) => reorderTasks.mutate(input)}
              onStatusChange={handleStatusChange}
              onAddTask={handleAddTask}
              onClickTask={setSelectedTask}
              inlineCreateStatus={inlineCreateStatus}
              onCreateSubmit={handleCreateTask}
              onCreateCancel={() => setInlineCreateStatus(null)}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {board && (
        <TaskDetailPanel
          task={selectedTask}
          config={board.config}
          open={selectedTask !== null}
          onClose={() => setSelectedTask(null)}
          onUpdate={(taskId, updates) => updateTask.mutate({ taskId, ...updates })}
          onDelete={(taskId) => deleteTask.mutate(taskId)}
          allItems={board.items}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: No TypeScript errors (some warnings acceptable for first pass)

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/tasks.tsx
git commit -m "feat(tasks): wire up full task board page with all components"
```

---

## Task 15: Integration Testing

**Files:**
- Modify: `tests/task-routes.test.ts`

- [ ] **Step 1: Add integration tests for the full CRUD flow**

Append to `tests/task-routes.test.ts`:

```typescript
describe("task CRUD flow", () => {
  it("creates, reads, updates, and deletes a task via I/O functions", async () => {
    const { writeConfigFile } = await import("../server/task-io");
    const { generateTaskId, writeTaskFile, parseTaskFile, taskFilename } = await import("../server/task-io");
    const { DEFAULT_TASK_CONFIG } = await import("@shared/task-types");

    // Setup: create tasks directory with config
    const tasksDir = path.join(projectPath, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    writeConfigFile(path.join(tasksDir, "_config.md"), { ...DEFAULT_TASK_CONFIG });

    // Create
    const id = generateTaskId();
    expect(id).toMatch(/^itm-[a-f0-9]{8}$/);

    const filename = taskFilename("task", "Integration Test", id);
    const filePath = path.join(tasksDir, filename);

    writeTaskFile(filePath, {
      id,
      title: "Integration Test",
      type: "task",
      status: "todo",
      priority: "high",
      labels: ["test"],
      created: "2026-04-05",
      updated: "2026-04-05",
      body: "Test body content.",
      filePath,
    });

    // Read
    const task = parseTaskFile(filePath);
    expect(task).not.toBeNull();
    expect(task!.id).toBe(id);
    expect(task!.title).toBe("Integration Test");
    expect(task!.priority).toBe("high");
    expect(task!.body.trim()).toBe("Test body content.");

    // Update
    task!.status = "done";
    task!.updated = "2026-04-06";
    writeTaskFile(filePath, task!);

    const updated = parseTaskFile(filePath);
    expect(updated!.status).toBe("done");
    expect(updated!.updated).toBe("2026-04-06");

    // Delete
    fs.unlinkSync(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("scans project with hierarchy", async () => {
    const { writeConfigFile, writeTaskFile, generateTaskId, taskFilename } = await import("../server/task-io");
    const { scanProjectTasks } = await import("../server/scanner/task-scanner");
    const { DEFAULT_TASK_CONFIG } = await import("@shared/task-types");

    const tasksDir = path.join(projectPath, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    // Config
    const config = { ...DEFAULT_TASK_CONFIG };
    const milestoneId = generateTaskId();
    const taskId = generateTaskId();
    config.columnOrder = { todo: [milestoneId, taskId] };
    writeConfigFile(path.join(tasksDir, "_config.md"), config);

    // Milestone
    writeTaskFile(path.join(tasksDir, taskFilename("milestone", "MVP", milestoneId)), {
      id: milestoneId,
      title: "MVP",
      type: "milestone",
      status: "todo",
      created: "2026-04-05",
      updated: "2026-04-05",
      body: "",
      filePath: path.join(tasksDir, taskFilename("milestone", "MVP", milestoneId)),
    });

    // Task under milestone
    writeTaskFile(path.join(tasksDir, taskFilename("task", "Build auth", taskId)), {
      id: taskId,
      title: "Build auth",
      type: "task",
      status: "todo",
      parent: milestoneId,
      priority: "high",
      created: "2026-04-05",
      updated: "2026-04-05",
      body: "",
      filePath: path.join(tasksDir, taskFilename("task", "Build auth", taskId)),
    });

    const board = scanProjectTasks(projectPath, projectId, "Test Project");
    expect(board.items).toHaveLength(2);

    const milestone = board.items.find((i) => i.type === "milestone");
    const task = board.items.find((i) => i.type === "task");
    expect(milestone).toBeDefined();
    expect(task).toBeDefined();
    expect(task!.parent).toBe(milestoneId);
    expect(board.config.columnOrder.todo).toContain(milestoneId);
    expect(board.config.columnOrder.todo).toContain(taskId);
  });
});
```

- [ ] **Step 2: Run all task tests**

Run: `npx vitest run tests/task-io.test.ts tests/task-scanner.test.ts tests/task-routes.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass, no regressions

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add tests/task-routes.test.ts
git commit -m "test(tasks): add integration tests for full CRUD and hierarchy"
```

---

## Task 16: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on http://localhost:5100

- [ ] **Step 2: Verify navigation**

Open browser to http://localhost:5100. Check:
- Tasks appears as sub-item under Projects in sidebar
- Clicking Tasks navigates to /tasks
- Project picker shows in task sidebar

- [ ] **Step 3: Create a board**

Select a project that has no tasks yet. Verify:
- Board setup screen appears
- Click "Create Board" initializes the .claude/tasks/ directory
- Kanban columns appear (backlog, todo, in-progress, review, done)

- [ ] **Step 4: Create tasks**

Click "+" on a column. Verify:
- Inline form appears with title input
- Enter creates the task, card appears in column
- Task file written to {project}/.claude/tasks/

- [ ] **Step 5: Drag and drop**

Drag a task card between columns. Verify:
- Card moves smoothly
- Status updates in the file
- Column counts update

- [ ] **Step 6: Edit task**

Click a task card. Verify:
- Detail panel slides out
- All fields are editable
- Save writes changes to file

- [ ] **Step 7: Fix any issues found during smoke test**

Address any bugs, styling issues, or UX problems. Commit fixes.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(tasks): task management MVP — kanban board with drag-and-drop"
```
