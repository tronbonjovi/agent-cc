# Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pipeline-first board with a human-operated, centralized kanban board that aggregates tasks across all projects.

**Architecture:** New `/api/board` routes aggregate tasks from all projects into a single board. The UI is a new board page with header (filters, stats, milestones), draggable columns (Backlog/Ready/In Progress/Review/Done), rich task cards with project colors and live activity, and a side panel for drill-in. Dependency validation flags tasks on column move. An ingest system parses roadmap files into board tasks.

**Tech Stack:** Express.js routes, React + TanStack Query, existing `task-io.ts` file I/O, `gray-matter` frontmatter parsing, existing SSE event bus, shadcn/ui components, wouter routing.

**Spec:** `docs/superpowers/specs/2026-04-07-kanban-board-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `shared/board-types.ts` | Board-specific types: `BoardColumn`, `BoardTask`, `BoardState`, `BoardStats`, `BoardFilter`, `MoveTaskInput` |
| `server/routes/board.ts` | `/api/board/*` REST endpoints — aggregated board state, move with validation, stats, ingest, SSE events |
| `server/board/aggregator.ts` | Cross-project task aggregation — scans all projects, maps TaskItem → BoardTask, applies project colors |
| `server/board/validator.ts` | Dependency validation — checks prereqs on column move, returns flag info |
| `server/board/ingest.ts` | Roadmap parser — reads markdown roadmap files, extracts tasks/milestones/dependencies, creates task files |
| `server/board/events.ts` | Board event bus — extends existing SSE pattern for board-level events (task-moved, task-flagged, etc.) |
| `client/src/pages/board.tsx` | Board page — header area + board area + side panel |
| `client/src/components/board/board-header.tsx` | Filter bar, quick stats, milestone progress indicators |
| `client/src/components/board/board-columns.tsx` | The 5-column kanban grid with drag-and-drop |
| `client/src/components/board/board-task-card.tsx` | Task card — project color border, tags, activity line, progress, cost, flag indicator |
| `client/src/components/board/board-side-panel.tsx` | Slide-out panel — session messages, files changed, cost, controls, "Open Full Detail" link |
| `client/src/components/board/board-filters.tsx` | Filter controls — project, milestone, priority, status, assignee dropdowns |
| `client/src/hooks/use-board.ts` | React Query hooks for `/api/board/*` endpoints + SSE subscription |
| `client/src/lib/board-columns.ts` | Column definitions, column utilities |
| `tests/board-types.test.ts` | Type validation tests |
| `tests/board-aggregator.test.ts` | Cross-project aggregation tests |
| `tests/board-validator.test.ts` | Dependency validation tests |
| `tests/board-ingest.test.ts` | Roadmap ingest parser tests |
| `tests/board-routes.test.ts` | API endpoint tests |
| `tests/board-events.test.ts` | SSE event tests |
| `tests/board-ui.test.ts` | Column mapping, filter logic, card rendering logic tests |

### Modified Files
| File | Change |
|------|--------|
| `shared/task-types.ts` | Add `flagged`, `flagReason`, `assignee`, `projectColor` fields to `TaskItem` |
| `server/task-io.ts` | Read/write new frontmatter fields (flagged, flagReason, assignee) |
| `server/db.ts` | Add `boardConfig` to `DBData` (project colors, filter presets) |
| `client/src/App.tsx` | Add `/board` route |
| `client/src/components/layout.tsx` | Promote "Board" to top-level nav item (replace Tasks as child) |

---

## Task 1: Board Types and Column Definitions

**Files:**
- Create: `shared/board-types.ts`
- Create: `client/src/lib/board-columns.ts`
- Modify: `shared/task-types.ts`
- Test: `tests/board-types.test.ts`

- [ ] **Step 1: Write failing tests for board types and columns**

```typescript
// tests/board-types.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";

describe("board-columns", () => {
  it("defines exactly 5 columns in order", () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual([
      "backlog", "ready", "in-progress", "review", "done",
    ]);
  });

  it("each column has id, label, and color", () => {
    for (const col of BOARD_COLUMNS) {
      expect(col).toHaveProperty("id");
      expect(col).toHaveProperty("label");
      expect(col).toHaveProperty("color");
    }
  });

  it("columnOrder returns numeric index", () => {
    expect(columnOrder("backlog")).toBe(0);
    expect(columnOrder("done")).toBe(4);
    expect(columnOrder("unknown")).toBe(-1);
  });

  it("isValidColumn validates column names", () => {
    expect(isValidColumn("backlog")).toBe(true);
    expect(isValidColumn("ready")).toBe(true);
    expect(isValidColumn("in-progress")).toBe(true);
    expect(isValidColumn("review")).toBe(true);
    expect(isValidColumn("done")).toBe(true);
    expect(isValidColumn("build")).toBe(false);
    expect(isValidColumn("")).toBe(false);
  });
});

describe("board-types", () => {
  it("BoardTask has required fields", () => {
    // Type-level test — import the type and verify it compiles
    const task: import("../shared/board-types").BoardTask = {
      id: "itm-abc12345",
      title: "Test task",
      description: "A test",
      column: "backlog",
      project: "proj-1",
      projectName: "My Project",
      projectColor: "#3b82f6",
      priority: "medium",
      dependsOn: [],
      tags: [],
      flagged: false,
      createdAt: "2026-04-07",
      updatedAt: "2026-04-07",
    };
    expect(task.id).toBe("itm-abc12345");
    expect(task.flagged).toBe(false);
  });

  it("BoardColumn type matches column ids", () => {
    const col: import("../shared/board-types").BoardColumn = "backlog";
    expect(col).toBe("backlog");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-types.test.ts --reporter=verbose`
Expected: FAIL — modules not found

- [ ] **Step 3: Add new fields to TaskItem**

In `shared/task-types.ts`, add these optional fields to the `TaskItem` interface:

```typescript
// Add after the existing dependsOn/parallelGroup fields:
  flagged?: boolean;
  flagReason?: string;
  assignee?: string;             // human name or "ai"
```

- [ ] **Step 4: Create board types**

```typescript
// shared/board-types.ts

export type BoardColumn = "backlog" | "ready" | "in-progress" | "review" | "done";

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  column: BoardColumn;
  project: string;              // project entity ID
  projectName: string;          // display name
  projectColor: string;         // hex color
  milestone?: string;           // milestone task title (not ID — for display)
  milestoneId?: string;         // milestone task ID (for filtering)
  priority: "high" | "medium" | "low";
  dependsOn: string[];          // task IDs
  tags: string[];
  assignee?: string;
  sessionId?: string;
  flagged: boolean;
  flagReason?: string;
  activity?: string;
  cost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  color: string;
}

export interface MilestoneMeta {
  id: string;
  title: string;
  project: string;
  totalTasks: number;
  doneTasks: number;
}

export interface BoardState {
  tasks: BoardTask[];
  columns: BoardColumn[];
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
}

export interface BoardStats {
  totalTasks: number;
  byColumn: Record<BoardColumn, number>;
  activeAgents: number;
  totalSpend: number;
  flaggedCount: number;
}

export interface BoardFilter {
  projects?: string[];
  milestones?: string[];
  priorities?: string[];
  columns?: BoardColumn[];
  assignee?: "human" | "ai" | "unassigned";
  flagged?: boolean;
}

export interface MoveTaskInput {
  column: BoardColumn;
  force?: boolean;              // skip dependency validation
}
```

- [ ] **Step 5: Create board column definitions**

```typescript
// client/src/lib/board-columns.ts

import type { BoardColumn } from "@shared/board-types";

export interface BoardColumnDef {
  id: BoardColumn;
  label: string;
  color: string;         // tailwind color class for column header accent
  description: string;
}

export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: "backlog",     label: "Backlog",     color: "bg-slate-400",  description: "Known work, not yet prioritized" },
  { id: "ready",       label: "Ready",       color: "bg-blue-400",   description: "Prioritized, ready to pick up" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-400",  description: "Someone is actively working" },
  { id: "review",      label: "Review",      color: "bg-purple-400", description: "Work done, needs human eyes" },
  { id: "done",        label: "Done",        color: "bg-emerald-400",description: "Approved and complete" },
];

export function columnOrder(column: string): number {
  const idx = BOARD_COLUMNS.findIndex(c => c.id === column);
  return idx;
}

export function isValidColumn(column: string): column is BoardColumn {
  return BOARD_COLUMNS.some(c => c.id === column);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/board-types.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add shared/board-types.ts shared/task-types.ts client/src/lib/board-columns.ts tests/board-types.test.ts
git commit -m "feat: board types and column definitions"
```

---

## Task 2: Cross-Project Aggregator

**Files:**
- Create: `server/board/aggregator.ts`
- Modify: `server/db.ts`
- Test: `tests/board-aggregator.test.ts`

- [ ] **Step 1: Write failing tests for the aggregator**

```typescript
// tests/board-aggregator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage and task-scanner before importing aggregator
vi.mock("../server/storage", () => ({
  storage: {
    getEntity: vi.fn(),
    getAllEntities: vi.fn(() => []),
  },
}));
vi.mock("../server/scanner/task-scanner", () => ({
  scanProjectTasks: vi.fn(() => ({ items: [], config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} }, malformedCount: 0, projectId: "", projectName: "", projectPath: "" })),
}));

import { aggregateBoardState, mapTaskToBoard, getProjectColor } from "../server/board/aggregator";
import { storage } from "../server/storage";
import { scanProjectTasks } from "../server/scanner/task-scanner";
import type { TaskItem } from "../shared/task-types";

describe("aggregator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProjectColor", () => {
    it("returns a consistent color for the same project", () => {
      const c1 = getProjectColor("proj-1", 0);
      const c2 = getProjectColor("proj-1", 0);
      expect(c1).toBe(c2);
    });

    it("returns different colors for different indices", () => {
      const c1 = getProjectColor("proj-1", 0);
      const c2 = getProjectColor("proj-2", 1);
      expect(c1).not.toBe(c2);
    });
  });

  describe("mapTaskToBoard", () => {
    it("maps a TaskItem to a BoardTask", () => {
      const task: TaskItem = {
        id: "itm-abc12345",
        title: "Build auth",
        type: "task",
        status: "backlog",
        priority: "high",
        labels: ["backend"],
        created: "2026-04-07",
        updated: "2026-04-07",
        body: "Implement authentication",
        filePath: "/tmp/tasks/task-build-auth-abc12345.md",
        dependsOn: ["itm-def67890"],
      };

      const result = mapTaskToBoard(task, "proj-1", "My Project", "#3b82f6", []);
      expect(result.id).toBe("itm-abc12345");
      expect(result.column).toBe("backlog");
      expect(result.project).toBe("proj-1");
      expect(result.projectName).toBe("My Project");
      expect(result.projectColor).toBe("#3b82f6");
      expect(result.priority).toBe("high");
      expect(result.dependsOn).toEqual(["itm-def67890"]);
      expect(result.tags).toEqual(["backend"]);
      expect(result.flagged).toBe(false);
    });

    it("maps pipeline stages to board columns", () => {
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "build",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
        pipelineStage: "build",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result.column).toBe("in-progress");
    });

    it("maps human-review to review column", () => {
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "human-review",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
        pipelineStage: "human-review",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result.column).toBe("review");
    });

    it("skips milestone and roadmap type items", () => {
      const task: TaskItem = {
        id: "itm-1", title: "M", type: "milestone", status: "backlog",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      // milestones should return null (filtered at aggregation level)
      expect(result).toBeNull();
    });

    it("preserves flagged state", () => {
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "in-progress",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
        flagged: true, flagReason: "Depends on itm-2 which is not done",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.flagged).toBe(true);
      expect(result!.flagReason).toBe("Depends on itm-2 which is not done");
    });
  });

  describe("aggregateBoardState", () => {
    it("returns empty state when no projects exist", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([]);
      const result = aggregateBoardState();
      expect(result.tasks).toEqual([]);
      expect(result.projects).toEqual([]);
      expect(result.milestones).toEqual([]);
      expect(result.columns).toEqual(["backlog", "ready", "in-progress", "review", "done"]);
    });

    it("aggregates tasks from multiple projects", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
        { id: "p2", name: "Beta", type: "project", path: "/tmp/beta" },
      ] as any);

      vi.mocked(scanProjectTasks)
        .mockReturnValueOnce({
          projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
          config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
          items: [
            { id: "itm-1", title: "Task A", type: "task", status: "backlog", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/alpha/.claude/tasks/t.md" },
          ],
          malformedCount: 0,
        })
        .mockReturnValueOnce({
          projectId: "p2", projectName: "Beta", projectPath: "/tmp/beta",
          config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
          items: [
            { id: "itm-2", title: "Task B", type: "task", status: "ready", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/beta/.claude/tasks/t.md" },
          ],
          malformedCount: 0,
        });

      const result = aggregateBoardState();
      expect(result.tasks).toHaveLength(2);
      expect(result.projects).toHaveLength(2);
      expect(result.tasks[0].projectName).toBe("Alpha");
      expect(result.tasks[1].projectName).toBe("Beta");
    });

    it("extracts milestones from task parent relationships", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      ] as any);

      vi.mocked(scanProjectTasks).mockReturnValue({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "itm-m1", title: "v1.0 Release", type: "milestone", status: "backlog", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
          { id: "itm-1", title: "Task A", type: "task", status: "backlog", parent: "itm-m1", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
          { id: "itm-2", title: "Task B", type: "task", status: "done", parent: "itm-m1", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        ],
        malformedCount: 0,
      });

      const result = aggregateBoardState();
      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0].title).toBe("v1.0 Release");
      expect(result.milestones[0].totalTasks).toBe(2);
      expect(result.milestones[0].doneTasks).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-aggregator.test.ts --reporter=verbose`
Expected: FAIL — modules not found

- [ ] **Step 3: Add `getAllEntities` to storage if missing, add `boardConfig` to DB**

In `server/db.ts`, add to `DBData` interface:

```typescript
  boardConfig: { projectColors: Record<string, string> };
```

Add to `defaultData()`:

```typescript
  boardConfig: { projectColors: {} },
```

Add to the existence checks in the try block:

```typescript
  if (!data.boardConfig) data.boardConfig = { projectColors: {} };
```

In `server/storage.ts`, ensure `getAllEntities()` exists. If it doesn't, add:

```typescript
getAllEntities(): Entity[] {
  return Object.values(getDB().entities);
}
```

- [ ] **Step 4: Implement the aggregator**

```typescript
// server/board/aggregator.ts

import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { getDB, save } from "../db";
import type { TaskItem } from "@shared/task-types";
import type { BoardTask, BoardState, BoardColumn, ProjectMeta, MilestoneMeta, BoardStats } from "@shared/board-types";

// 10 distinct project colors — visually separated, accessible on light/dark
const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
];

/** Get or assign a color for a project. Persisted in DB. */
export function getProjectColor(projectId: string, index: number): string {
  const db = getDB();
  if (db.boardConfig.projectColors[projectId]) {
    return db.boardConfig.projectColors[projectId];
  }
  const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
  db.boardConfig.projectColors[projectId] = color;
  save();
  return color;
}

/** Map a status string to a board column. */
function statusToColumn(status: string, pipelineStage?: string): BoardColumn {
  // Pipeline stage takes precedence if set
  const effective = pipelineStage || status;

  switch (effective) {
    case "backlog":
      return "backlog";
    case "todo":
    case "ready":
    case "queued":
      return "ready";
    case "in-progress":
    case "build":
    case "ai-review":
    case "brainstorm":
    case "plan":
      return "in-progress";
    case "review":
    case "human-review":
      return "review";
    case "done":
      return "done";
    default:
      return "backlog";
  }
}

/** Map a TaskItem to a BoardTask. Returns null for non-task types (milestone, roadmap). */
export function mapTaskToBoard(
  task: TaskItem,
  projectId: string,
  projectName: string,
  projectColor: string,
  milestones: TaskItem[],
): BoardTask | null {
  // Skip milestones and roadmaps — they're metadata, not board cards
  if (task.type === "milestone" || task.type === "roadmap") return null;

  const milestone = task.parent
    ? milestones.find(m => m.id === task.parent)
    : undefined;

  return {
    id: task.id,
    title: task.title,
    description: task.body,
    column: statusToColumn(task.status, task.pipelineStage),
    project: projectId,
    projectName,
    projectColor,
    milestone: milestone?.title,
    milestoneId: milestone?.id,
    priority: (task.priority as "high" | "medium" | "low") || "medium",
    dependsOn: task.dependsOn || [],
    tags: task.labels || [],
    assignee: task.assignee,
    sessionId: task.pipelineSessionIds?.[0],
    flagged: task.flagged || false,
    flagReason: task.flagReason,
    activity: task.pipelineActivity,
    cost: task.pipelineCost,
    createdAt: task.created,
    updatedAt: task.updated,
  };
}

/** Aggregate tasks from all projects into a single BoardState. */
export function aggregateBoardState(filterProjects?: string[]): BoardState {
  const allEntities = storage.getAllEntities();
  const projectEntities = allEntities.filter(e => e.type === "project");

  const tasks: BoardTask[] = [];
  const projects: ProjectMeta[] = [];
  const milestoneMap = new Map<string, MilestoneMeta>();

  for (let i = 0; i < projectEntities.length; i++) {
    const entity = projectEntities[i];
    if (filterProjects && !filterProjects.includes(entity.id)) continue;

    const color = getProjectColor(entity.id, i);
    projects.push({ id: entity.id, name: entity.name, color });

    let board;
    try {
      board = scanProjectTasks(entity.path, entity.id, entity.name);
    } catch {
      continue; // Skip projects that fail to scan
    }

    // Extract milestones for parent resolution
    const milestoneItems = board.items.filter(t => t.type === "milestone");

    // Build milestone progress metadata
    for (const ms of milestoneItems) {
      const children = board.items.filter(t => t.parent === ms.id && t.type === "task");
      milestoneMap.set(ms.id, {
        id: ms.id,
        title: ms.title,
        project: entity.id,
        totalTasks: children.length,
        doneTasks: children.filter(t => statusToColumn(t.status, t.pipelineStage) === "done").length,
      });
    }

    // Map tasks to board format
    for (const item of board.items) {
      const boardTask = mapTaskToBoard(item, entity.id, entity.name, color, milestoneItems);
      if (boardTask) tasks.push(boardTask);
    }
  }

  return {
    tasks,
    columns: ["backlog", "ready", "in-progress", "review", "done"],
    projects,
    milestones: Array.from(milestoneMap.values()),
  };
}

/** Compute quick stats from board state. */
export function computeBoardStats(state: BoardState): BoardStats {
  const byColumn: Record<BoardColumn, number> = {
    "backlog": 0, "ready": 0, "in-progress": 0, "review": 0, "done": 0,
  };
  let activeAgents = 0;
  let totalSpend = 0;
  let flaggedCount = 0;

  for (const task of state.tasks) {
    byColumn[task.column]++;
    if (task.assignee === "ai" && task.column === "in-progress") activeAgents++;
    if (task.cost) totalSpend += task.cost;
    if (task.flagged) flaggedCount++;
  }

  return {
    totalTasks: state.tasks.length,
    byColumn,
    activeAgents,
    totalSpend,
    flaggedCount,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/board-aggregator.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/board/aggregator.ts server/db.ts server/storage.ts tests/board-aggregator.test.ts
git commit -m "feat: cross-project board aggregator"
```

---

## Task 3: Dependency Validator

**Files:**
- Create: `server/board/validator.ts`
- Test: `tests/board-validator.test.ts`

- [ ] **Step 1: Write failing tests for dependency validation**

```typescript
// tests/board-validator.test.ts
import { describe, it, expect } from "vitest";
import { validateMove, checkAutoUnflag } from "../server/board/validator";
import type { BoardTask } from "../shared/board-types";

function makeTask(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "itm-1", title: "T", description: "", column: "backlog",
    project: "p1", projectName: "P", projectColor: "#000",
    priority: "medium", dependsOn: [], tags: [], flagged: false,
    createdAt: "2026-04-07", updatedAt: "2026-04-07",
    ...overrides,
  };
}

describe("validateMove", () => {
  it("allows move with no dependencies", () => {
    const task = makeTask({ id: "itm-1" });
    const allTasks = [task];
    const result = validateMove(task, "in-progress", allTasks);
    expect(result.allowed).toBe(true);
    expect(result.flag).toBeUndefined();
  });

  it("allows move when all dependencies are done", () => {
    const dep = makeTask({ id: "itm-dep", column: "done" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep]);
    expect(result.allowed).toBe(true);
  });

  it("flags task when dependency is not done", () => {
    const dep = makeTask({ id: "itm-dep", column: "ready" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep]);
    expect(result.allowed).toBe(true); // move is allowed, just flagged
    expect(result.flag).toBeDefined();
    expect(result.flag!.flagged).toBe(true);
    expect(result.flag!.reason).toContain("itm-dep");
  });

  it("flags when multiple dependencies are unfinished", () => {
    const dep1 = makeTask({ id: "itm-d1", title: "Dep 1", column: "backlog" });
    const dep2 = makeTask({ id: "itm-d2", title: "Dep 2", column: "in-progress" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-d1", "itm-d2"] });
    const result = validateMove(task, "in-progress", [task, dep1, dep2]);
    expect(result.flag!.reason).toContain("Dep 1");
    expect(result.flag!.reason).toContain("Dep 2");
  });

  it("does not flag when moving to backlog or ready", () => {
    const dep = makeTask({ id: "itm-dep", column: "backlog" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "ready", [task, dep]);
    expect(result.flag).toBeUndefined();
  });

  it("skips validation when force=true", () => {
    const dep = makeTask({ id: "itm-dep", column: "backlog" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep], true);
    expect(result.allowed).toBe(true);
    expect(result.flag).toBeUndefined();
  });

  it("ignores missing dependencies gracefully", () => {
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-ghost"] });
    const result = validateMove(task, "in-progress", [task]);
    // Missing deps are treated as unmet — flag it
    expect(result.flag).toBeDefined();
    expect(result.flag!.reason).toContain("itm-ghost");
  });
});

describe("checkAutoUnflag", () => {
  it("returns unflag=true when all deps are now done", () => {
    const dep = makeTask({ id: "itm-dep", column: "done" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"], flagged: true, flagReason: "..." });
    const result = checkAutoUnflag(task, [task, dep]);
    expect(result).toBe(true);
  });

  it("returns unflag=false when deps still not done", () => {
    const dep = makeTask({ id: "itm-dep", column: "review" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"], flagged: true });
    const result = checkAutoUnflag(task, [task, dep]);
    expect(result).toBe(false);
  });

  it("returns false for tasks that aren't flagged", () => {
    const task = makeTask({ id: "itm-1", dependsOn: [], flagged: false });
    const result = checkAutoUnflag(task, [task]);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-validator.test.ts --reporter=verbose`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the validator**

```typescript
// server/board/validator.ts

import type { BoardTask, BoardColumn } from "@shared/board-types";

interface MoveValidation {
  allowed: boolean;
  flag?: { flagged: boolean; reason: string };
}

// Columns that trigger dependency validation
const WORK_COLUMNS: Set<BoardColumn> = new Set(["in-progress", "review", "done"]);

/** Validate a task move. Returns allowed + optional flag info. */
export function validateMove(
  task: BoardTask,
  targetColumn: BoardColumn,
  allTasks: BoardTask[],
  force = false,
): MoveValidation {
  // Always allow the move — we flag, not block
  const result: MoveValidation = { allowed: true };

  // Only validate dependencies for work columns (not backlog/ready)
  if (force || !WORK_COLUMNS.has(targetColumn) || task.dependsOn.length === 0) {
    return result;
  }

  // Find unfinished dependencies
  const unfinished: string[] = [];
  for (const depId of task.dependsOn) {
    const dep = allTasks.find(t => t.id === depId);
    if (!dep || dep.column !== "done") {
      unfinished.push(dep?.title || depId);
    }
  }

  if (unfinished.length > 0) {
    result.flag = {
      flagged: true,
      reason: `Waiting on: ${unfinished.join(", ")}`,
    };
  }

  return result;
}

/** Check if a flagged task's dependencies are now all done. */
export function checkAutoUnflag(task: BoardTask, allTasks: BoardTask[]): boolean {
  if (!task.flagged || task.dependsOn.length === 0) return false;

  return task.dependsOn.every(depId => {
    const dep = allTasks.find(t => t.id === depId);
    return dep?.column === "done";
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-validator.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/board/validator.ts tests/board-validator.test.ts
git commit -m "feat: dependency validation with flagging"
```

---

## Task 4: Board Event Bus

**Files:**
- Create: `server/board/events.ts`
- Test: `tests/board-events.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/board-events.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BoardEventBus } from "../server/board/events";
import type { BoardEventType } from "../server/board/events";

describe("BoardEventBus", () => {
  let bus: BoardEventBus;

  beforeEach(() => {
    bus = new BoardEventBus();
  });

  it("registers and emits to clients", () => {
    const send = vi.fn();
    bus.addClient(send);
    bus.emit("task-moved", { taskId: "itm-1", column: "ready" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toContain("event: task-moved");
    expect(send.mock.calls[0][0]).toContain('"taskId":"itm-1"');
  });

  it("removes client on cleanup", () => {
    const send = vi.fn();
    const cleanup = bus.addClient(send);
    cleanup();
    bus.emit("task-moved", { taskId: "itm-1" });
    expect(send).not.toHaveBeenCalled();
  });

  it("emits to multiple clients", () => {
    const send1 = vi.fn();
    const send2 = vi.fn();
    bus.addClient(send1);
    bus.addClient(send2);
    bus.emit("task-flagged", { taskId: "itm-1" });
    expect(send1).toHaveBeenCalledOnce();
    expect(send2).toHaveBeenCalledOnce();
  });

  it("removes clients that throw on send", () => {
    const badSend = vi.fn(() => { throw new Error("disconnected"); });
    const goodSend = vi.fn();
    bus.addClient(badSend);
    bus.addClient(goodSend);
    bus.emit("task-moved", { taskId: "itm-1" });
    expect(bus.clientCount).toBe(1);
    expect(goodSend).toHaveBeenCalledOnce();
  });

  it("tracks client count", () => {
    expect(bus.clientCount).toBe(0);
    const cleanup = bus.addClient(vi.fn());
    expect(bus.clientCount).toBe(1);
    cleanup();
    expect(bus.clientCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-events.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Implement the board event bus**

```typescript
// server/board/events.ts

type SendFn = (data: string) => void;

export type BoardEventType =
  | "task-moved"
  | "task-created"
  | "task-updated"
  | "task-deleted"
  | "task-flagged"
  | "task-unflagged"
  | "board-refresh";

export class BoardEventBus {
  private clients = new Set<SendFn>();

  addClient(send: SendFn): () => void {
    this.clients.add(send);
    return () => { this.clients.delete(send); };
  }

  emit(event: BoardEventType, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const send of Array.from(this.clients)) {
      try {
        send(payload);
      } catch {
        this.clients.delete(send);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const boardEvents = new BoardEventBus();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-events.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/board/events.ts tests/board-events.test.ts
git commit -m "feat: board SSE event bus"
```

---

## Task 5: Board API Routes

**Files:**
- Create: `server/routes/board.ts`
- Test: `tests/board-routes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/board-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getEntity: vi.fn(),
    getAllEntities: vi.fn(() => []),
  },
}));
vi.mock("../server/scanner/task-scanner", () => ({
  scanProjectTasks: vi.fn(() => ({
    items: [], config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
    malformedCount: 0, projectId: "", projectName: "", projectPath: "",
  })),
}));
vi.mock("../server/task-io", () => ({
  parseTaskFile: vi.fn(),
  writeTaskFile: vi.fn(),
  taskFileIndex: new Map(),
  updateTaskField: vi.fn(),
}));
vi.mock("../server/db", () => ({
  getDB: vi.fn(() => ({ boardConfig: { projectColors: {} } })),
  save: vi.fn(),
}));

import express from "express";
import request from "supertest";
import { createBoardRouter } from "../server/routes/board";
import { BoardEventBus } from "../server/board/events";

describe("board routes", () => {
  let app: express.Express;
  let events: BoardEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new BoardEventBus();
    app = express();
    app.use(express.json());
    app.use(createBoardRouter(events));
  });

  it("GET /api/board returns board state", async () => {
    const res = await request(app).get("/api/board");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tasks");
    expect(res.body).toHaveProperty("columns");
    expect(res.body).toHaveProperty("projects");
    expect(res.body).toHaveProperty("milestones");
    expect(res.body.columns).toEqual(["backlog", "ready", "in-progress", "review", "done"]);
  });

  it("GET /api/board/stats returns stats", async () => {
    const res = await request(app).get("/api/board/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalTasks");
    expect(res.body).toHaveProperty("byColumn");
    expect(res.body).toHaveProperty("activeAgents");
    expect(res.body).toHaveProperty("totalSpend");
    expect(res.body).toHaveProperty("flaggedCount");
  });

  it("POST /api/board/tasks/:id/move validates column", async () => {
    const res = await request(app)
      .post("/api/board/tasks/itm-1/move")
      .send({ column: "invalid-column" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid column");
  });

  it("POST /api/board/tasks/:id/move returns 404 for missing task", async () => {
    const res = await request(app)
      .post("/api/board/tasks/itm-nonexistent/move")
      .send({ column: "ready" });
    expect(res.status).toBe(404);
  });

  it("GET /api/board/events sets SSE headers", async () => {
    const res = await request(app).get("/api/board/events").buffer(false);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toBe("no-cache");
    // Close the connection
    res.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-routes.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Implement board routes**

```typescript
// server/routes/board.ts

import { Router } from "express";
import { aggregateBoardState, computeBoardStats } from "../board/aggregator";
import { validateMove, checkAutoUnflag } from "../board/validator";
import { isValidColumn } from "../../client/src/lib/board-columns";
import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { updateTaskField, taskFileIndex } from "../task-io";
import type { BoardEventBus } from "../board/events";
import type { MoveTaskInput, BoardColumn } from "@shared/board-types";

export function createBoardRouter(events: BoardEventBus): Router {
  const router = Router();

  // GET /api/board — full aggregated board state
  router.get("/api/board", (req, res) => {
    const filterProjects = req.query.projects
      ? (req.query.projects as string).split(",")
      : undefined;
    const state = aggregateBoardState(filterProjects);
    return res.json(state);
  });

  // GET /api/board/stats — quick stats
  router.get("/api/board/stats", (_req, res) => {
    const state = aggregateBoardState();
    const stats = computeBoardStats(state);
    return res.json(stats);
  });

  // POST /api/board/tasks/:id/move — move task to column with validation
  router.post("/api/board/tasks/:id/move", (req, res) => {
    const { id } = req.params;
    const { column, force }: MoveTaskInput = req.body;

    if (!column || !isValidColumn(column)) {
      return res.status(400).json({ error: `Invalid column: ${column}` });
    }

    // Find the task across all projects
    const state = aggregateBoardState();
    const task = state.tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Validate dependencies
    const validation = validateMove(task, column, state.tasks, force);

    // Map board column back to task status for storage
    const statusMap: Record<BoardColumn, string> = {
      "backlog": "backlog",
      "ready": "ready",
      "in-progress": "in-progress",
      "review": "review",
      "done": "done",
    };

    try {
      // Update the task status
      updateTaskField(id, "status", statusMap[column], task.project);

      // Update flag state
      if (validation.flag) {
        updateTaskField(id, "flagged", true, task.project);
        updateTaskField(id, "flagReason", validation.flag.reason, task.project);
      } else if (task.flagged) {
        // Clear flag if previously flagged and now valid
        updateTaskField(id, "flagged", false, task.project);
        updateTaskField(id, "flagReason", undefined, task.project);
      }

      // Check if any other flagged tasks should auto-unflag
      if (column === "done") {
        for (const other of state.tasks) {
          if (other.flagged && checkAutoUnflag({ ...other }, [...state.tasks.filter(t => t.id !== id), { ...task, column }])) {
            updateTaskField(other.id, "flagged", false, other.project);
            updateTaskField(other.id, "flagReason", undefined, other.project);
            events.emit("task-unflagged", { taskId: other.id });
          }
        }
      }
    } catch (err) {
      return res.status(500).json({ error: "Failed to update task" });
    }

    // Emit event
    events.emit("task-moved", { taskId: id, column, flagged: !!validation.flag });
    if (validation.flag) {
      events.emit("task-flagged", { taskId: id, reason: validation.flag.reason });
    }

    return res.json({
      id,
      column,
      flagged: !!validation.flag,
      flagReason: validation.flag?.reason,
    });
  });

  // GET /api/board/events — SSE stream
  router.get("/api/board/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connected event
    res.write("event: connected\ndata: {}\n\n");

    const cleanup = events.addClient((data: string) => {
      res.write(data);
    });

    req.on("close", cleanup);
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-routes.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/board.ts tests/board-routes.test.ts
git commit -m "feat: board API routes with move validation and SSE"
```

---

## Task 6: Roadmap Ingest Parser

**Files:**
- Create: `server/board/ingest.ts`
- Test: `tests/board-ingest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/board-ingest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRoadmapMarkdown } from "../server/board/ingest";

describe("parseRoadmapMarkdown", () => {
  it("parses a roadmap with milestones and tasks", () => {
    const content = `---
project: my-app
status: active
---

# Roadmap

## Milestones

### MILE-001: Core API
Priority: high

Tasks:
- TASK-001: Set up Express server [priority: high]
- TASK-002: Add auth middleware [priority: high, depends: TASK-001]
- TASK-003: Write API tests [priority: medium, depends: TASK-001]

### MILE-002: Frontend
Priority: medium

Tasks:
- TASK-004: Scaffold React app [priority: high]
- TASK-005: Build login page [priority: high, depends: TASK-004, TASK-002]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.project).toBe("my-app");
    expect(result.milestones).toHaveLength(2);
    expect(result.milestones[0].title).toBe("Core API");
    expect(result.milestones[0].id).toBe("MILE-001");
    expect(result.milestones[0].priority).toBe("high");
    expect(result.tasks).toHaveLength(5);
    expect(result.tasks[0].title).toBe("Set up Express server");
    expect(result.tasks[0].milestone).toBe("MILE-001");
    expect(result.tasks[0].priority).toBe("high");
    expect(result.tasks[1].dependsOn).toEqual(["TASK-001"]);
    expect(result.tasks[4].dependsOn).toEqual(["TASK-004", "TASK-002"]);
  });

  it("handles minimal roadmap with just tasks", () => {
    const content = `---
project: simple
---

# Tasks
- TASK-001: Do the thing [priority: low]
- TASK-002: Do another thing [priority: medium]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.project).toBe("simple");
    expect(result.milestones).toHaveLength(0);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].milestone).toBeUndefined();
  });

  it("returns empty when content has no parseable structure", () => {
    const result = parseRoadmapMarkdown("Just some random markdown");
    expect(result.project).toBe("");
    expect(result.milestones).toHaveLength(0);
    expect(result.tasks).toHaveLength(0);
  });

  it("parses task metadata in brackets", () => {
    const content = `---
project: test
---
- TASK-001: Build API [priority: high, depends: TASK-000]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.tasks[0].priority).toBe("high");
    expect(result.tasks[0].dependsOn).toEqual(["TASK-000"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-ingest.test.ts --reporter=verbose`
Expected: FAIL

- [ ] **Step 3: Implement the ingest parser**

```typescript
// server/board/ingest.ts

import matter from "gray-matter";

export interface ParsedMilestone {
  id: string;
  title: string;
  priority: string;
}

export interface ParsedTask {
  id: string;
  title: string;
  milestone?: string;
  priority: string;
  dependsOn: string[];
}

export interface ParsedRoadmap {
  project: string;
  milestones: ParsedMilestone[];
  tasks: ParsedTask[];
}

/**
 * Parse a roadmap markdown file into structured milestones and tasks.
 *
 * Expected format:
 * - YAML frontmatter with `project` field
 * - ### MILE-NNN: Title sections for milestones with Priority: line
 * - Task lines: `- TASK-NNN: Title [priority: x, depends: TASK-A, TASK-B]`
 */
export function parseRoadmapMarkdown(content: string): ParsedRoadmap {
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  try {
    const parsed = matter(content);
    frontmatter = parsed.data;
    body = parsed.content;
  } catch {
    // No valid frontmatter — use raw content
  }

  const project = (frontmatter.project as string) || "";
  const milestones: ParsedMilestone[] = [];
  const tasks: ParsedTask[] = [];

  let currentMilestone: string | undefined;
  let currentMilestonePriority = "medium";

  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match milestone headers: ### MILE-001: Core API
    const milestoneMatch = line.match(/^###?\s+(MILE-\d+):\s*(.+)/);
    if (milestoneMatch) {
      currentMilestone = milestoneMatch[1];
      const title = milestoneMatch[2].trim();
      currentMilestonePriority = "medium";

      // Look ahead for Priority: line
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && /^Priority:\s*/i.test(nextLine)) {
        currentMilestonePriority = nextLine.replace(/^Priority:\s*/i, "").trim().toLowerCase();
        i++; // Skip the priority line
      }

      milestones.push({ id: currentMilestone, title, priority: currentMilestonePriority });
      continue;
    }

    // Match task lines: - TASK-001: Title [priority: high, depends: TASK-000]
    const taskMatch = line.match(/^-\s+(TASK-\d+):\s*(.+)/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      let titleAndMeta = taskMatch[2];

      let priority = "medium";
      let dependsOn: string[] = [];

      // Extract bracket metadata: [priority: high, depends: TASK-001, TASK-002]
      const bracketMatch = titleAndMeta.match(/\[([^\]]+)\]\s*$/);
      if (bracketMatch) {
        titleAndMeta = titleAndMeta.slice(0, bracketMatch.index).trim();
        const meta = bracketMatch[1];

        const priorityMatch = meta.match(/priority:\s*(\w+)/i);
        if (priorityMatch) priority = priorityMatch[1].toLowerCase();

        const dependsMatch = meta.match(/depends?:\s*([\w\s,-]+)/i);
        if (dependsMatch) {
          dependsOn = dependsMatch[1]
            .split(/[,\s]+/)
            .map(s => s.trim())
            .filter(s => /^TASK-\d+$/.test(s));
        }
      }

      tasks.push({
        id: taskId,
        title: titleAndMeta,
        milestone: currentMilestone,
        priority,
        dependsOn,
      });
    }
  }

  return { project, milestones, tasks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/board-ingest.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/board/ingest.ts tests/board-ingest.test.ts
git commit -m "feat: roadmap ingest parser"
```

---

## Task 7: Wire Board Routes into Server and Add Ingest Endpoint

**Files:**
- Modify: `server/routes/board.ts` (add ingest endpoint)
- Modify: server entry file (register board router)
- Test: `tests/board-routes.test.ts` (add ingest test)

- [ ] **Step 1: Write failing test for ingest endpoint**

Add to `tests/board-routes.test.ts`:

```typescript
import { storage } from "../server/storage";
import { writeTaskFile } from "../server/task-io";
import fs from "fs";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});

describe("ingest endpoint", () => {
  it("POST /api/board/ingest parses roadmap and returns created items", async () => {
    vi.mocked(storage.getEntity).mockReturnValue({
      id: "p1", name: "Test", type: "project", path: "/tmp/test",
    } as any);

    const roadmapContent = `---
project: test
---
- TASK-001: Build API [priority: high]
- TASK-002: Add tests [priority: medium, depends: TASK-001]
`;

    const res = await request(app)
      .post("/api/board/ingest")
      .send({ projectId: "p1", content: roadmapContent });

    expect(res.status).toBe(201);
    expect(res.body.tasksCreated).toBe(2);
    expect(res.body.milestonesCreated).toBe(0);
  });

  it("POST /api/board/ingest returns 400 without projectId", async () => {
    const res = await request(app)
      .post("/api/board/ingest")
      .send({ content: "some roadmap" });
    expect(res.status).toBe(400);
  });

  it("POST /api/board/ingest returns 404 for unknown project", async () => {
    vi.mocked(storage.getEntity).mockReturnValue(undefined as any);
    const res = await request(app)
      .post("/api/board/ingest")
      .send({ projectId: "p-bad", content: "roadmap" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-routes.test.ts --reporter=verbose`
Expected: FAIL for ingest tests

- [ ] **Step 3: Add ingest endpoint to board router**

Add to `server/routes/board.ts` before the `return router` line:

```typescript
  // POST /api/board/ingest — bulk import from roadmap
  router.post("/api/board/ingest", (req, res) => {
    const { projectId, content } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    if (!content) return res.status(400).json({ error: "content is required" });

    const entity = storage.getEntity(projectId);
    if (!entity || entity.type !== "project") {
      return res.status(404).json({ error: "Project not found" });
    }

    const parsed = parseRoadmapMarkdown(content);

    const tasksDir = path.join(entity.path, ".claude", "tasks").replace(/\\/g, "/");
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true, mode: 0o775 });
    }

    // Create milestone tasks
    let milestonesCreated = 0;
    const milestoneIdMap = new Map<string, string>(); // MILE-001 → itm-xxx
    for (const ms of parsed.milestones) {
      const id = generateTaskId();
      milestoneIdMap.set(ms.id, id);
      const task: TaskItem = {
        id,
        title: ms.title,
        type: "milestone",
        status: "backlog",
        priority: ms.priority,
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
        body: "",
        filePath: path.join(tasksDir, taskFilename("milestone", ms.title, id)).replace(/\\/g, "/"),
      };
      writeTaskFile(task.filePath, task);
      milestonesCreated++;
    }

    // Create task items
    let tasksCreated = 0;
    const taskIdMap = new Map<string, string>(); // TASK-001 → itm-xxx
    // First pass: generate all IDs
    for (const t of parsed.tasks) {
      taskIdMap.set(t.id, generateTaskId());
    }
    // Second pass: create with resolved dependencies
    for (const t of parsed.tasks) {
      const id = taskIdMap.get(t.id)!;
      const deps = t.dependsOn
        .map(d => taskIdMap.get(d))
        .filter((d): d is string => !!d);

      const task: TaskItem = {
        id,
        title: t.title,
        type: "task",
        status: "backlog",
        priority: t.priority,
        parent: t.milestone ? milestoneIdMap.get(t.milestone) : undefined,
        dependsOn: deps.length > 0 ? deps : undefined,
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
        body: "",
        filePath: path.join(tasksDir, taskFilename("task", t.title, id)).replace(/\\/g, "/"),
      };
      writeTaskFile(task.filePath, task);
      tasksCreated++;
    }

    events.emit("board-refresh", { projectId });

    return res.status(201).json({
      tasksCreated,
      milestonesCreated,
      taskIdMap: Object.fromEntries(taskIdMap),
      milestoneIdMap: Object.fromEntries(milestoneIdMap),
    });
  });
```

Add these imports to the top of `server/routes/board.ts`:

```typescript
import path from "path";
import fs from "fs";
import { parseRoadmapMarkdown } from "../board/ingest";
import { writeTaskFile, generateTaskId, taskFilename } from "../task-io";
import type { TaskItem } from "@shared/task-types";
```

- [ ] **Step 4: Wire board router into the server**

Find the server entry file (likely `server/index.ts` or where other routers are registered). Add:

```typescript
import { createBoardRouter } from "./routes/board";
import { boardEvents } from "./board/events";

// After other app.use() calls:
app.use(createBoardRouter(boardEvents));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/board-routes.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/board.ts tests/board-routes.test.ts
git commit -m "feat: ingest endpoint and server wiring"
```

---

## Task 8: React Query Hooks for Board

**Files:**
- Create: `client/src/hooks/use-board.ts`
- Test: `tests/board-ui.test.ts`

- [ ] **Step 1: Write failing tests for hook utilities**

```typescript
// tests/board-ui.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";
import type { BoardTask, BoardFilter } from "../shared/board-types";

// Test the filter logic that will live in the hook or a utility
function applyFilters(tasks: BoardTask[], filter: BoardFilter): BoardTask[] {
  return tasks.filter(t => {
    if (filter.projects?.length && !filter.projects.includes(t.project)) return false;
    if (filter.milestones?.length && (!t.milestoneId || !filter.milestones.includes(t.milestoneId))) return false;
    if (filter.priorities?.length && !filter.priorities.includes(t.priority)) return false;
    if (filter.columns?.length && !filter.columns.includes(t.column)) return false;
    if (filter.flagged !== undefined && t.flagged !== filter.flagged) return false;
    if (filter.assignee === "human" && (!t.assignee || t.assignee === "ai")) return false;
    if (filter.assignee === "ai" && t.assignee !== "ai") return false;
    if (filter.assignee === "unassigned" && t.assignee) return false;
    return true;
  });
}

function makeTask(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "itm-1", title: "T", description: "", column: "backlog",
    project: "p1", projectName: "P", projectColor: "#000",
    priority: "medium", dependsOn: [], tags: [], flagged: false,
    createdAt: "2026-04-07", updatedAt: "2026-04-07",
    ...overrides,
  };
}

describe("board-ui filter logic", () => {
  const tasks = [
    makeTask({ id: "t1", project: "p1", column: "backlog", priority: "high" }),
    makeTask({ id: "t2", project: "p2", column: "in-progress", priority: "medium", assignee: "ai" }),
    makeTask({ id: "t3", project: "p1", column: "done", priority: "low", flagged: true }),
    makeTask({ id: "t4", project: "p2", column: "review", milestoneId: "m1" }),
  ];

  it("filters by project", () => {
    const result = applyFilters(tasks, { projects: ["p1"] });
    expect(result.map(t => t.id)).toEqual(["t1", "t3"]);
  });

  it("filters by column", () => {
    const result = applyFilters(tasks, { columns: ["backlog", "done"] });
    expect(result.map(t => t.id)).toEqual(["t1", "t3"]);
  });

  it("filters by priority", () => {
    const result = applyFilters(tasks, { priorities: ["high"] });
    expect(result.map(t => t.id)).toEqual(["t1"]);
  });

  it("filters by assignee=ai", () => {
    const result = applyFilters(tasks, { assignee: "ai" });
    expect(result.map(t => t.id)).toEqual(["t2"]);
  });

  it("filters by flagged", () => {
    const result = applyFilters(tasks, { flagged: true });
    expect(result.map(t => t.id)).toEqual(["t3"]);
  });

  it("combines multiple filters", () => {
    const result = applyFilters(tasks, { projects: ["p2"], columns: ["review"] });
    expect(result.map(t => t.id)).toEqual(["t4"]);
  });

  it("returns all tasks with empty filter", () => {
    const result = applyFilters(tasks, {});
    expect(result).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/board-ui.test.ts --reporter=verbose`
Expected: PASS (these are pure logic tests with inline implementation). If the imports fail, fix them.

- [ ] **Step 3: Create the React Query hooks**

```typescript
// client/src/hooks/use-board.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { BoardState, BoardStats, BoardFilter, BoardTask, MoveTaskInput, BoardColumn } from "@shared/board-types";

const BOARD_KEY = ["/api/board"];
const STATS_KEY = ["/api/board/stats"];

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Fetch full board state. */
export function useBoardState(filterProjects?: string[]) {
  const params = filterProjects?.length
    ? `?projects=${filterProjects.join(",")}`
    : "";
  return useQuery<BoardState>({
    queryKey: [...BOARD_KEY, filterProjects],
    queryFn: () => apiFetch(`/api/board${params}`),
  });
}

/** Fetch board stats. */
export function useBoardStats() {
  return useQuery<BoardStats>({
    queryKey: STATS_KEY,
    queryFn: () => apiFetch("/api/board/stats"),
  });
}

/** Move a task to a column. */
export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, column, force }: { taskId: string; column: BoardColumn; force?: boolean }) =>
      apiFetch(`/api/board/tasks/${taskId}/move`, {
        method: "POST",
        body: JSON.stringify({ column, force } satisfies MoveTaskInput),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Ingest a roadmap into a project. */
export function useIngestRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content }: { projectId: string; content: string }) =>
      apiFetch("/api/board/ingest", {
        method: "POST",
        body: JSON.stringify({ projectId, content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Subscribe to board SSE events. Invalidates queries on events. */
export function useBoardEvents() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/board/events");

    es.addEventListener("connected", () => setConnected(true));

    const eventTypes = [
      "task-moved", "task-created", "task-updated", "task-deleted",
      "task-flagged", "task-unflagged", "board-refresh",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        setLastEvent(type);
        qc.invalidateQueries({ queryKey: BOARD_KEY });
        qc.invalidateQueries({ queryKey: STATS_KEY });
      });
    }

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [qc]);

  return { connected, lastEvent };
}

/** Client-side filter logic. */
export function applyBoardFilters(tasks: BoardTask[], filter: BoardFilter): BoardTask[] {
  return tasks.filter(t => {
    if (filter.projects?.length && !filter.projects.includes(t.project)) return false;
    if (filter.milestones?.length && (!t.milestoneId || !filter.milestones.includes(t.milestoneId))) return false;
    if (filter.priorities?.length && !filter.priorities.includes(t.priority)) return false;
    if (filter.columns?.length && !filter.columns.includes(t.column)) return false;
    if (filter.flagged !== undefined && t.flagged !== filter.flagged) return false;
    if (filter.assignee === "human" && (!t.assignee || t.assignee === "ai")) return false;
    if (filter.assignee === "ai" && t.assignee !== "ai") return false;
    if (filter.assignee === "unassigned" && t.assignee) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/board-ui.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/use-board.ts tests/board-ui.test.ts
git commit -m "feat: board React Query hooks and filter logic"
```

---

## Task 9: Board Page Layout and Header

**Files:**
- Create: `client/src/pages/board.tsx`
- Create: `client/src/components/board/board-header.tsx`
- Create: `client/src/components/board/board-filters.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout.tsx`

- [ ] **Step 1: Create the board filters component**

```typescript
// client/src/components/board/board-filters.tsx

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, X } from "lucide-react";
import type { BoardFilter, ProjectMeta, MilestoneMeta, BoardColumn } from "@shared/board-types";
import { BOARD_COLUMNS } from "@/lib/board-columns";

interface BoardFiltersProps {
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
}

export function BoardFilters({ filter, onFilterChange, projects, milestones }: BoardFiltersProps) {
  const hasFilters = !!(
    filter.projects?.length || filter.milestones?.length ||
    filter.priorities?.length || filter.columns?.length ||
    filter.assignee || filter.flagged !== undefined
  );

  function toggleProject(id: string) {
    const current = filter.projects || [];
    const next = current.includes(id)
      ? current.filter(p => p !== id)
      : [...current, id];
    onFilterChange({ ...filter, projects: next.length ? next : undefined });
  }

  function togglePriority(p: string) {
    const current = filter.priorities || [];
    const next = current.includes(p)
      ? current.filter(x => x !== p)
      : [...current, p];
    onFilterChange({ ...filter, priorities: next.length ? next : undefined });
  }

  function clearFilters() {
    onFilterChange({});
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />

      {/* Project filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Project {filter.projects?.length ? `(${filter.projects.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {projects.map(p => (
            <DropdownMenuCheckboxItem
              key={p.id}
              checked={filter.projects?.includes(p.id)}
              onCheckedChange={() => toggleProject(p.id)}
            >
              <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: p.color }} />
              {p.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Priority {filter.priorities?.length ? `(${filter.priorities.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {["high", "medium", "low"].map(p => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={filter.priorities?.includes(p)}
              onCheckedChange={() => togglePriority(p)}
            >
              {p}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Flagged toggle */}
      <Button
        variant={filter.flagged ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onFilterChange({
          ...filter,
          flagged: filter.flagged === undefined ? true : undefined,
        })}
      >
        Flagged
      </Button>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the board header component**

```typescript
// client/src/components/board/board-header.tsx

import { BoardFilters } from "./board-filters";
import type { BoardStats, BoardFilter, ProjectMeta, MilestoneMeta } from "@shared/board-types";

interface BoardHeaderProps {
  stats?: BoardStats;
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
  sseConnected: boolean;
}

export function BoardHeader({ stats, filter, onFilterChange, projects, milestones, sseConnected }: BoardHeaderProps) {
  return (
    <div className="px-5 py-3 border-b space-y-2.5">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Board</h1>
          {!sseConnected && (
            <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              Reconnecting...
            </span>
          )}
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{stats.totalTasks} tasks</span>
            <span>{stats.byColumn["in-progress"]} active</span>
            {stats.activeAgents > 0 && (
              <span className="text-blue-500">{stats.activeAgents} agent{stats.activeAgents !== 1 ? "s" : ""}</span>
            )}
            {stats.flaggedCount > 0 && (
              <span className="text-amber-500">{stats.flaggedCount} flagged</span>
            )}
            {stats.totalSpend > 0 && (
              <span>${stats.totalSpend.toFixed(2)} spent</span>
            )}
          </div>
        )}
      </div>

      {/* Milestone progress */}
      {milestones.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {milestones.map(m => {
            const pct = m.totalTasks > 0 ? Math.round((m.doneTasks / m.totalTasks) * 100) : 0;
            const project = projects.find(p => p.id === m.project);
            return (
              <div key={m.id} className="flex items-center gap-1.5 text-xs">
                {project && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                )}
                <span className="text-muted-foreground">{m.title}</span>
                <span className="font-mono text-[10px]">{m.doneTasks}/{m.totalTasks}</span>
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <BoardFilters
        filter={filter}
        onFilterChange={onFilterChange}
        projects={projects}
        milestones={milestones}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the board page (shell — columns come in next task)**

```typescript
// client/src/pages/board.tsx

import { Layout } from "@/components/layout";
import { BoardHeader } from "@/components/board/board-header";
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters } from "@/hooks/use-board";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useState, useMemo } from "react";
import type { BoardFilter } from "@shared/board-types";

export default function BoardPage() {
  const [filter, setFilter] = useState<BoardFilter>({});
  const { data: board, isLoading } = useBoardState();
  const { data: stats } = useBoardStats();
  const { connected } = useBoardEvents();

  const filteredTasks = useMemo(
    () => board ? applyBoardFilters(board.tasks, filter) : [],
    [board, filter],
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    for (const col of BOARD_COLUMNS) {
      map[col.id] = filteredTasks.filter(t => t.column === col.id);
    }
    return map;
  }, [filteredTasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <BoardHeader
        stats={stats}
        filter={filter}
        onFilterChange={setFilter}
        projects={board?.projects || []}
        milestones={board?.milestones || []}
        sseConnected={connected}
      />

      {/* Board area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-max">
          {BOARD_COLUMNS.map(col => (
            <div key={col.id} className="w-72 flex flex-col bg-muted/30 rounded-lg border">
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                  {tasksByColumn[col.id]?.length || 0}
                </span>
              </div>

              {/* Cards placeholder — replaced in Task 10 */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasksByColumn[col.id]?.map(task => (
                  <div
                    key={task.id}
                    className="bg-card border rounded-md p-3 text-sm cursor-pointer hover:border-foreground/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-full rounded-full flex-shrink-0"
                        style={{ backgroundColor: task.projectColor }}
                      />
                      <span className="font-medium truncate">{task.title}</span>
                    </div>
                    {task.flagged && (
                      <div className="text-[10px] text-amber-500 mt-1">Flagged: {task.flagReason}</div>
                    )}
                  </div>
                ))}
                {(!tasksByColumn[col.id] || tasksByColumn[col.id].length === 0) && (
                  <div className="text-xs text-muted-foreground/50 text-center py-8">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the board route to App.tsx**

In `client/src/App.tsx`, add a lazy import and route:

```typescript
const BoardPage = lazy(() => import("@/pages/board"));
```

Add the route alongside other routes:

```typescript
<Route path="/board" component={BoardPage} />
```

- [ ] **Step 5: Update nav in layout.tsx**

In `client/src/components/layout.tsx`, add the Board nav item. In the "Overview" section, after Dashboard:

```typescript
{ path: "/board", label: "Board", icon: CheckSquare, countKey: null },
```

Import `Kanban` from lucide-react if available, or reuse `CheckSquare`. Update the import if needed:

```typescript
import { Kanban } from "lucide-react";
```

Then use `Kanban` as the icon for the Board nav item.

- [ ] **Step 6: Run the dev server and verify the page loads**

Run: `npm run check` to verify TypeScript compiles
Run: `npm run dev` and navigate to `/board`
Expected: Page loads with header (empty stats), filter bar, and 5 empty columns

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/board.tsx client/src/components/board/board-header.tsx client/src/components/board/board-filters.tsx client/src/App.tsx client/src/components/layout.tsx
git commit -m "feat: board page with header, filters, and column layout"
```

---

## Task 10: Task Card Component

**Files:**
- Create: `client/src/components/board/board-task-card.tsx`
- Modify: `client/src/pages/board.tsx`

- [ ] **Step 1: Create the task card component**

```typescript
// client/src/components/board/board-task-card.tsx

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, User, DollarSign } from "lucide-react";
import type { BoardTask } from "@shared/board-types";

interface BoardTaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function BoardTaskCard({ task, onClick }: BoardTaskCardProps) {
  return (
    <div
      onClick={() => onClick(task)}
      className="bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group"
    >
      {/* Project color indicator + title */}
      <div className="flex items-start gap-2">
        <div
          className="w-1 h-full min-h-[1.5rem] rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: task.projectColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight truncate">{task.title}</div>

          {/* Project name + milestone */}
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>{task.projectName}</span>
            {task.milestone && (
              <>
                <span className="opacity-40">·</span>
                <span>{task.milestone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tags row */}
      {(task.tags.length > 0 || task.priority !== "medium") && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {task.priority !== "medium" && (
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
              {task.priority}
            </Badge>
          )}
          {task.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Activity line */}
      {task.activity && (
        <div className="mt-2 text-[10px] text-blue-400 truncate">
          {task.activity}
        </div>
      )}

      {/* Bottom row: assignee, cost, flag */}
      <div className="flex items-center gap-2 mt-2">
        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {task.assignee === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {task.assignee === "ai" ? "AI" : task.assignee}
          </span>
        )}
        {task.cost != null && task.cost > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <DollarSign className="h-3 w-3" />
            {task.cost.toFixed(2)}
          </span>
        )}
        {task.flagged && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 ml-auto" title={task.flagReason}>
            <AlertTriangle className="h-3 w-3" />
            Flagged
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace placeholder cards in board.tsx**

In `client/src/pages/board.tsx`, import the card component:

```typescript
import { BoardTaskCard } from "@/components/board/board-task-card";
```

Add state for the selected task (for side panel):

```typescript
const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
```

Replace the placeholder card div in the column render with:

```typescript
{tasksByColumn[col.id]?.map(task => (
  <BoardTaskCard
    key={task.id}
    task={task}
    onClick={setSelectedTask}
  />
))}
```

- [ ] **Step 3: Run type check and dev server**

Run: `npm run check`
Run: `npm run dev` and navigate to `/board`
Expected: Cards render with project colors, priority badges, activity lines

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/board-task-card.tsx client/src/pages/board.tsx
git commit -m "feat: board task card component"
```

---

## Task 11: Side Panel (Quick View)

**Files:**
- Create: `client/src/components/board/board-side-panel.tsx`
- Modify: `client/src/pages/board.tsx`

- [ ] **Step 1: Create the side panel component**

```typescript
// client/src/components/board/board-side-panel.tsx

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Bot, ExternalLink, Clock, DollarSign, GitBranch, FileText } from "lucide-react";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useMoveTask } from "@/hooks/use-board";
import type { BoardTask, BoardColumn } from "@shared/board-types";

interface BoardSidePanelProps {
  task: BoardTask | null;
  open: boolean;
  onClose: () => void;
}

export function BoardSidePanel({ task, open, onClose }: BoardSidePanelProps) {
  const moveTask = useMoveTask();

  if (!task) return null;

  const currentColIdx = BOARD_COLUMNS.findIndex(c => c.id === task.column);

  function handleMove(column: BoardColumn) {
    moveTask.mutate({ taskId: task!.id, column });
  }

  function handleForceUnflag() {
    moveTask.mutate({ taskId: task!.id, column: task!.column, force: true });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          {/* Project color + title */}
          <div className="flex items-start gap-3">
            <div
              className="w-1.5 rounded-full h-8 flex-shrink-0 mt-0.5"
              style={{ backgroundColor: task.projectColor }}
            />
            <div>
              <SheetTitle className="text-base leading-tight">{task.title}</SheetTitle>
              <div className="text-xs text-muted-foreground mt-1">
                {task.projectName}
                {task.milestone && <> · {task.milestone}</>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* Flag warning */}
            {task.flagged && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-500">Flagged</div>
                  <div className="text-xs text-amber-400/80 mt-0.5">{task.flagReason}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs text-amber-500"
                    onClick={handleForceUnflag}
                  >
                    Dismiss flag
                  </Button>
                </div>
              </div>
            )}

            {/* Status + move controls */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Status</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {BOARD_COLUMNS.map((col, idx) => (
                  <Button
                    key={col.id}
                    variant={col.id === task.column ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    disabled={col.id === task.column || task.flagged && idx > currentColIdx}
                    onClick={() => handleMove(col.id)}
                  >
                    {col.label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Priority</span>
                <div className="mt-0.5 font-medium capitalize">{task.priority}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Assignee</span>
                <div className="mt-0.5 font-medium flex items-center gap-1">
                  {task.assignee === "ai" ? <><Bot className="h-3 w-3" /> AI</> : task.assignee || "Unassigned"}
                </div>
              </div>
              {task.cost != null && task.cost > 0 && (
                <div>
                  <span className="text-muted-foreground">Cost</span>
                  <div className="mt-0.5 font-medium flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />${task.cost.toFixed(2)}
                  </div>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Updated</span>
                <div className="mt-0.5 font-medium">{task.updatedAt}</div>
              </div>
            </div>

            {/* Tags */}
            {task.tags.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Dependencies */}
            {task.dependsOn.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Depends On</div>
                  <div className="space-y-1">
                    {task.dependsOn.map(depId => (
                      <div key={depId} className="text-xs font-mono text-muted-foreground">
                        {depId}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Description</div>
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    {task.description}
                  </div>
                </div>
              </>
            )}

            {/* Activity */}
            {task.activity && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Activity</div>
                  <div className="text-xs text-blue-400">{task.activity}</div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <Button variant="ghost" size="sm" className="text-xs w-full justify-start" asChild>
            <a href={`/tasks/${task.project}`}>
              <ExternalLink className="h-3 w-3 mr-2" />
              Open Full Detail
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire side panel into board page**

In `client/src/pages/board.tsx`, import and add:

```typescript
import { BoardSidePanel } from "@/components/board/board-side-panel";
import type { BoardTask } from "@shared/board-types";
```

Add the panel component before the closing `</div>` of the page:

```typescript
<BoardSidePanel
  task={selectedTask}
  open={selectedTask !== null}
  onClose={() => setSelectedTask(null)}
/>
```

- [ ] **Step 3: Run type check and test manually**

Run: `npm run check`
Run: `npm run dev` — click a task card → side panel should slide out

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/board-side-panel.tsx client/src/pages/board.tsx
git commit -m "feat: board side panel with task details and move controls"
```

---

## Task 12: Update task-io for New Fields and Run Full Tests

**Files:**
- Modify: `server/task-io.ts`
- Test: existing test suite

- [ ] **Step 1: Read current task-io.ts to identify where fields are read/written**

Read `server/task-io.ts` fully to find the `parseTaskFile` and `writeTaskFile` functions.

- [ ] **Step 2: Add flagged, flagReason, assignee to parse and write**

In `parseTaskFile`, where frontmatter fields are read into the TaskItem object, add:

```typescript
if (fm.flagged !== undefined) task.flagged = fm.flagged;
if (fm.flagReason) task.flagReason = fm.flagReason;
if (fm.assignee) task.assignee = fm.assignee;
```

In `writeTaskFile`, where TaskItem fields are written to frontmatter, add:

```typescript
if (task.flagged !== undefined) fm.flagged = task.flagged;
if (task.flagReason) fm.flagReason = task.flagReason;
if (task.assignee) fm.assignee = task.assignee;
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: All existing tests pass + all new board tests pass

- [ ] **Step 4: Fix any failures**

Address any import path issues, mock mismatches, or type errors.

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/task-io.ts
git commit -m "feat: persist flagged, flagReason, assignee fields in task files"
```

---

## Task 13: Integration Test — Board End-to-End Flow

**Files:**
- Create: `tests/board-integration.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/board-integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getEntity: vi.fn((id: string) => {
      if (id === "p1") return { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" };
      return undefined;
    }),
    getAllEntities: vi.fn(() => [
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ]),
  },
}));

vi.mock("../server/scanner/task-scanner", () => ({
  scanProjectTasks: vi.fn(() => ({
    projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
    config: { statuses: ["backlog", "ready", "in-progress", "review", "done"], types: ["task", "milestone"], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
    items: [
      { id: "itm-1", title: "Setup DB", type: "task", status: "done", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "Set up database", filePath: "/tmp/t1.md" },
      { id: "itm-2", title: "Build API", type: "task", status: "backlog", priority: "high", dependsOn: ["itm-1"], created: "2026-04-07", updated: "2026-04-07", body: "Build the API", filePath: "/tmp/t2.md" },
      { id: "itm-3", title: "Write tests", type: "task", status: "backlog", priority: "medium", dependsOn: ["itm-2"], created: "2026-04-07", updated: "2026-04-07", body: "Write tests", filePath: "/tmp/t3.md" },
    ],
    malformedCount: 0,
  })),
}));

vi.mock("../server/task-io", () => ({
  parseTaskFile: vi.fn(),
  writeTaskFile: vi.fn(),
  taskFileIndex: new Map(),
  updateTaskField: vi.fn(),
  generateTaskId: vi.fn(() => "itm-new12345"),
  taskFilename: vi.fn((type: string, title: string, id: string) => `${type}-${title}-${id}.md`),
}));

vi.mock("../server/db", () => ({
  getDB: vi.fn(() => ({ boardConfig: { projectColors: {} } })),
  save: vi.fn(),
}));

import express from "express";
import request from "supertest";
import { createBoardRouter } from "../server/routes/board";
import { BoardEventBus } from "../server/board/events";

describe("board integration", () => {
  let app: express.Express;
  let events: BoardEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new BoardEventBus();
    app = express();
    app.use(express.json());
    app.use(createBoardRouter(events));
  });

  it("full flow: get board → move task → check flag → verify stats", async () => {
    // 1. Get the board
    const boardRes = await request(app).get("/api/board");
    expect(boardRes.status).toBe(200);
    expect(boardRes.body.tasks).toHaveLength(3);
    expect(boardRes.body.tasks[0].column).toBe("done");   // itm-1 (done)
    expect(boardRes.body.tasks[1].column).toBe("backlog"); // itm-2 (backlog)
    expect(boardRes.body.tasks[2].column).toBe("backlog"); // itm-3 (backlog)

    // 2. Move itm-2 to in-progress — dep (itm-1) is done, should be fine
    const move1 = await request(app)
      .post("/api/board/tasks/itm-2/move")
      .send({ column: "in-progress" });
    expect(move1.status).toBe(200);
    expect(move1.body.flagged).toBe(false);

    // 3. Move itm-3 to in-progress — dep (itm-2) is NOT done, should flag
    const move2 = await request(app)
      .post("/api/board/tasks/itm-3/move")
      .send({ column: "in-progress" });
    expect(move2.status).toBe(200);
    expect(move2.body.flagged).toBe(true);
    expect(move2.body.flagReason).toContain("Build API");

    // 4. Force-move itm-3 — should succeed without flag
    const move3 = await request(app)
      .post("/api/board/tasks/itm-3/move")
      .send({ column: "in-progress", force: true });
    expect(move3.status).toBe(200);
    expect(move3.body.flagged).toBe(false);

    // 5. Get stats
    const statsRes = await request(app).get("/api/board/stats");
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalTasks).toBe(3);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/board-integration.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass including new board tests

- [ ] **Step 4: Commit**

```bash
git add tests/board-integration.test.ts
git commit -m "test: board end-to-end integration test"
```

---

## Task 14: Run Safety Checks and Final Verification

- [ ] **Step 1: Run new-user-safety test**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=verbose`
Expected: PASS — no hardcoded paths, PII, or user-specific strings in new files

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
1. Navigate to `/board`
2. Verify header shows with filter bar, stats
3. Verify 5 columns render
4. If a project has tasks, verify cards appear with project colors
5. Click a card → side panel opens with details and move controls
6. Test a filter (project or priority)

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address safety check and type issues"
```
