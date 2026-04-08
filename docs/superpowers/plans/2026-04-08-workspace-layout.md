# Workspace Layout & Board Column Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify board + projects into a single three-zone workspace, activate all 5 kanban columns, add delete for DB-stored tasks, and clean up test data.

**Architecture:** The board page (`/board`) gains two new zones (project cards on top, archive graveyard at bottom) and becomes the workspace. The projects listing page is removed (detail page stays). The `/work-task` and `/update-task` skills get updated status transitions. A delete API endpoint handles DB-stored task removal.

**Tech Stack:** React, TypeScript, Express, Zustand, React Query, shadcn/ui, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/src/components/board/project-card.tsx` | Project info-radiator card component |
| Create | `client/src/components/board/project-popout.tsx` | Floating popout for project details |
| Create | `client/src/components/board/project-zone.tsx` | Top zone: horizontal scrolling project cards |
| Create | `client/src/components/board/archive-zone.tsx` | Bottom zone: archived milestones graveyard |
| Create | `tests/board-workspace.test.ts` | Tests for workspace layout, project cards, archive zone |
| Create | `tests/board-delete.test.ts` | Tests for delete endpoint |
| Modify | `client/src/pages/board.tsx` | Restructure into three-zone workspace |
| Modify | `client/src/components/layout.tsx` | Nav changes — redirect /projects to /board |
| Modify | `client/src/hooks/use-board.ts` | Add useDeleteTask mutation, useProjects re-export |
| Modify | `server/routes/board.ts` | Add DELETE endpoint, pipeline test cleanup |
| Modify | `server/board/aggregator.ts` | Add deleteTask function |
| Modify | `server/scanner/task-scanner.ts` | Add isDbStoredTask helper |
| Modify | `client/src/components/board/board-side-panel.tsx` | Add delete button for DB-stored tasks |
| Modify | `shared/types.ts` | Add source field to BoardTask |
| Modify | `~/.claude/plugins/.../work-task/SKILL.md` | Column flow: ready + review transitions |
| Modify | `~/.claude/plugins/.../update-task/SKILL.md` | Add ready status to transition table |

---

### Task 1: Delete Pipeline Test Data (Bug Fix)

**Files:**
- Modify: `server/routes/board.ts`
- Create: `tests/board-delete.test.ts`

This is the immediate bug fix — remove the "Pipeline Test" / "Auth System" stale data and add a DELETE endpoint so it doesn't happen again.

- [ ] **Step 1: Write failing test for DELETE endpoint**

In `tests/board-delete.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll test the delete logic at the route level
// The delete endpoint should:
// 1. Only delete DB-stored tasks (itm- prefix)
// 2. Return 404 for unknown tasks
// 3. Return 403 for workflow tasks (non-itm prefix)

describe("DELETE /api/board/tasks/:id", () => {
  it("should reject deletion of workflow tasks", () => {
    // Workflow tasks have IDs like "session-investigation-task001"
    // They should NOT be deletable via this endpoint
    const workflowTaskId = "session-investigation-task001";
    expect(workflowTaskId.startsWith("itm-")).toBe(false);
  });

  it("should accept deletion of DB-stored tasks", () => {
    // DB-stored tasks have itm- prefix IDs
    const dbTaskId = "itm-bb030001";
    expect(dbTaskId.startsWith("itm-")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

Run: `npx vitest run tests/board-delete.test.ts`
Expected: PASS (these are just assertions about ID format — baseline for the pattern)

- [ ] **Step 3: Add isDbStoredTask helper to task-scanner**

Read `server/scanner/task-scanner.ts` and add at the bottom (after exports):

```typescript
/** DB-stored tasks (from /api/board/ingest) have itm- prefix IDs */
export function isDbStoredTask(taskId: string): boolean {
  return taskId.startsWith("itm-");
}
```

- [ ] **Step 4: Add deleteTask function to aggregator**

Read `server/board/aggregator.ts`. Add after the `setArchived` function:

```typescript
import { isDbStoredTask } from "../scanner/task-scanner";
import { deleteTaskFile } from "../scanner/task-io";

export function deleteDbTask(taskId: string): { deleted: boolean; error?: string } {
  if (!isDbStoredTask(taskId)) {
    return { deleted: false, error: "Only DB-stored tasks (itm- prefix) can be deleted" };
  }
  try {
    const deleted = deleteTaskFile(taskId);
    return { deleted };
  } catch (e: any) {
    return { deleted: false, error: e.message };
  }
}
```

Read `server/scanner/task-io.ts` to check if `deleteTaskFile` exists. If not, add it — it should look up the file path from the `taskFileIndex` and delete it with `fs.unlinkSync`.

- [ ] **Step 5: Add DELETE route**

In `server/routes/board.ts`, add before the events endpoint:

```typescript
router.delete("/tasks/:id", (req, res) => {
  const { id } = req.params;
  const result = deleteDbTask(id);
  if (result.error) {
    const status = result.error.includes("Only DB-stored") ? 403 : 404;
    return res.status(status).json({ error: result.error });
  }
  boardEvents.emit("board-refresh", { taskId: id, action: "deleted" });
  res.json({ id, deleted: true });
});
```

- [ ] **Step 6: Write proper integration tests**

Update `tests/board-delete.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isDbStoredTask } from "../server/scanner/task-scanner";

describe("isDbStoredTask", () => {
  it("returns true for itm- prefixed IDs", () => {
    expect(isDbStoredTask("itm-bb030001")).toBe(true);
    expect(isDbStoredTask("itm-aa010001")).toBe(true);
  });

  it("returns false for workflow task IDs", () => {
    expect(isDbStoredTask("session-investigation-task001")).toBe(false);
    expect(isDbStoredTask("dashboard-board-fixes-task002")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDbStoredTask("")).toBe(false);
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `npm run check && npm test`
Expected: All pass including new tests

- [ ] **Step 8: Delete the Pipeline Test data**

Write a one-time cleanup script or use the new DELETE endpoint. Check the task files in `.claude/tasks/` for the agent-cc project, find files with "Pipeline Test" or "Auth System" content, and delete them. Verify the board no longer shows them by hitting `GET /api/board`.

- [ ] **Step 9: Commit**

```bash
git add server/routes/board.ts server/board/aggregator.ts server/scanner/task-scanner.ts server/scanner/task-io.ts tests/board-delete.test.ts
git commit -m "fix: add delete endpoint for DB-stored tasks, remove Pipeline Test data"
```

---

### Task 2: Add Task Source to BoardTask Type

**Files:**
- Modify: `shared/types.ts` (BoardTask interface in `shared/board-types.ts`)
- Modify: `server/board/aggregator.ts`
- Modify: `tests/board-aggregator.test.ts`

The delete button in the popout needs to know if a task is DB-stored or workflow-sourced. Add a `source` field.

- [ ] **Step 1: Write failing test**

In `tests/board-aggregator.test.ts`, add:

```typescript
it("should set source to 'db' for itm- prefixed tasks", () => {
  // After aggregation, tasks with itm- IDs should have source: "db"
  // Workflow tasks should have source: "workflow"
});
```

- [ ] **Step 2: Add source field to BoardTask**

Read `shared/board-types.ts`. Add to the `BoardTask` interface:

```typescript
source: "db" | "workflow";  // "db" = ingested via /api/board/ingest, "workflow" = from .claude/roadmap/
```

- [ ] **Step 3: Set source in aggregator**

Read `server/board/aggregator.ts`. Where tasks are mapped to `BoardTask` objects, set:

```typescript
source: isDbStoredTask(task.id) ? "db" : "workflow",
```

Import `isDbStoredTask` from task-scanner.

- [ ] **Step 4: Run tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add shared/board-types.ts server/board/aggregator.ts tests/board-aggregator.test.ts
git commit -m "feat: add source field to BoardTask for db/workflow distinction"
```

---

### Task 3: Project Info-Radiator Card Component

**Files:**
- Create: `client/src/components/board/project-card.tsx`
- Create: `tests/board-workspace.test.ts`

Build the small project card that shows health, name, progress, sessions, and cost.

- [ ] **Step 1: Write failing test**

Create `tests/board-workspace.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "../client/src/components/board/project-card";

const mockProject = {
  id: "abc123",
  name: "agent-cc",
  description: "Agent Control Center",
  health: "healthy" as const,
  sessionCount: 3,
  totalCost: 12.40,
  milestoneCount: 6,
  taskCount: 15,
  doneTasks: 13,
  inProgressTasks: 2,
  isCurrent: true,
};

describe("ProjectCard", () => {
  it("renders project name", () => {
    render(<ProjectCard project={mockProject} onClick={() => {}} />);
    expect(screen.getByText("agent-cc")).toBeTruthy();
  });

  it("shows current badge for current project", () => {
    render(<ProjectCard project={mockProject} onClick={() => {}} />);
    expect(screen.getByText("current")).toBeTruthy();
  });

  it("shows milestone and task counts", () => {
    render(<ProjectCard project={mockProject} onClick={() => {}} />);
    expect(screen.getByText(/6 milestones/)).toBeTruthy();
    expect(screen.getByText(/15 tasks/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectCard**

Create `client/src/components/board/project-card.tsx`:

```typescript
export interface ProjectCardData {
  id: string;
  name: string;
  description: string;
  health: "healthy" | "warning" | "critical" | "unknown";
  sessionCount: number;
  totalCost: number;
  milestoneCount: number;
  taskCount: number;
  doneTasks: number;
  inProgressTasks: number;
  isCurrent: boolean;
}

interface Props {
  project: ProjectCardData;
  onClick: (e: React.MouseEvent) => void;
}

const healthColors = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-slate-500",
};

export function ProjectCard({ project, onClick }: Props) {
  const pendingTasks = project.taskCount - project.doneTasks - project.inProgressTasks;

  return (
    <div
      className="min-w-[180px] max-w-[200px] bg-card border border-border rounded-md p-2.5 cursor-pointer hover:border-muted-foreground/50 transition-colors flex flex-col gap-1"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--border)" }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${healthColors[project.health]}`} />
        <span className="font-semibold text-xs text-foreground truncate">{project.name}</span>
        {project.isCurrent && (
          <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded ml-auto shrink-0">
            current
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {project.milestoneCount} milestones · {project.taskCount} tasks
      </div>
      {project.taskCount > 0 && (
        <div className="flex gap-0.5 mt-0.5">
          {project.doneTasks > 0 && (
            <div className="h-[3px] bg-emerald-500 rounded-sm" style={{ flex: project.doneTasks }} />
          )}
          {project.inProgressTasks > 0 && (
            <div className="h-[3px] bg-amber-500 rounded-sm" style={{ flex: project.inProgressTasks }} />
          )}
          {pendingTasks > 0 && (
            <div className="h-[3px] bg-muted rounded-sm" style={{ flex: pendingTasks }} />
          )}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/70">
        {project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""} · ${project.totalCost.toFixed(2)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/board/project-card.tsx tests/board-workspace.test.ts
git commit -m "feat: project info-radiator card component"
```

---

### Task 4: Project Popout Component

**Files:**
- Create: `client/src/components/board/project-popout.tsx`
- Modify: `tests/board-workspace.test.ts`

Reuse the `computePopoutPosition` pattern from `board-side-panel.tsx`.

- [ ] **Step 1: Write failing test**

Add to `tests/board-workspace.test.ts`:

```typescript
import { ProjectPopout } from "../client/src/components/board/project-popout";

describe("ProjectPopout", () => {
  it("renders project name and description", () => {
    const anchor = { top: 100, left: 200, width: 180, height: 80 };
    render(
      <ProjectPopout
        project={mockProject}
        anchorRect={anchor}
        onClose={() => {}}
        onNavigate={() => {}}
      />
    );
    expect(screen.getByText("agent-cc")).toBeTruthy();
    expect(screen.getByText("Agent Control Center")).toBeTruthy();
  });

  it("shows 'View Details' link", () => {
    const anchor = { top: 100, left: 200, width: 180, height: 80 };
    render(
      <ProjectPopout
        project={mockProject}
        anchorRect={anchor}
        onClose={() => {}}
        onNavigate={() => {}}
      />
    );
    expect(screen.getByText(/View Details/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectPopout**

Create `client/src/components/board/project-popout.tsx`. Read `client/src/components/board/board-side-panel.tsx` for the `computePopoutPosition` pattern and reuse it. The popout should show:

- Project name + health badge
- Description
- Milestone list with progress bars
- Active sessions count
- Total cost
- "View Details →" link that calls `onNavigate`
- Close button (X), dismiss on outside click, dismiss on Escape

Structure it as a fixed-position overlay with a backdrop, just like the task popout.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/board/project-popout.tsx tests/board-workspace.test.ts
git commit -m "feat: project detail floating popout component"
```

---

### Task 5: Project Zone Component

**Files:**
- Create: `client/src/components/board/project-zone.tsx`
- Modify: `tests/board-workspace.test.ts`

The top zone: header bar + horizontal scrolling row of project cards.

- [ ] **Step 1: Write failing test**

Add to `tests/board-workspace.test.ts`:

```typescript
import { ProjectZone } from "../client/src/components/board/project-zone";

describe("ProjectZone", () => {
  const projects = [mockProject, { ...mockProject, id: "def456", name: "findash", isCurrent: false }];

  it("renders all project cards", () => {
    render(<ProjectZone projects={projects} onProjectClick={() => {}} />);
    expect(screen.getByText("agent-cc")).toBeTruthy();
    expect(screen.getByText("findash")).toBeTruthy();
  });

  it("shows project count in header", () => {
    render(<ProjectZone projects={projects} onProjectClick={() => {}} />);
    expect(screen.getByText(/2 projects/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement ProjectZone**

Create `client/src/components/board/project-zone.tsx`:

```typescript
import { ProjectCard, type ProjectCardData } from "./project-card";

interface Props {
  projects: ProjectCardData[];
  onProjectClick: (project: ProjectCardData, e: React.MouseEvent) => void;
}

export function ProjectZone({ projects, onProjectClick }: Props) {
  return (
    <div className="flex flex-col border-b border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span className="font-semibold text-foreground">Projects</span>
        <span className="bg-muted px-1.5 rounded-full text-[10px]">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2 flex gap-2 items-stretch">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onClick={(e) => onProjectClick(p, e)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/project-zone.tsx tests/board-workspace.test.ts
git commit -m "feat: project zone — horizontal scrolling project cards"
```

---

### Task 6: Archive Zone Component

**Files:**
- Create: `client/src/components/board/archive-zone.tsx`
- Modify: `tests/board-workspace.test.ts`

The bottom zone: archived milestone list.

- [ ] **Step 1: Write failing test**

Add to `tests/board-workspace.test.ts`:

```typescript
import { ArchiveZone } from "../client/src/components/board/archive-zone";

const mockArchived = [
  { id: "ms-1", title: "pipeline-removal", project: "agent-cc", totalTasks: 5, doneTasks: 5, completedAt: "2026-04-07" },
  { id: "ms-2", title: "workflow-bridge", project: "agent-cc", totalTasks: 4, doneTasks: 4, completedAt: "2026-04-08" },
];

describe("ArchiveZone", () => {
  it("renders archived milestones", () => {
    render(<ArchiveZone milestones={mockArchived} />);
    expect(screen.getByText("pipeline-removal")).toBeTruthy();
    expect(screen.getByText("workflow-bridge")).toBeTruthy();
  });

  it("shows archive count in header", () => {
    render(<ArchiveZone milestones={mockArchived} />);
    expect(screen.getByText(/2 milestones/)).toBeTruthy();
  });

  it("shows task counts per milestone", () => {
    render(<ArchiveZone milestones={mockArchived} />);
    expect(screen.getByText(/5\/5 tasks/)).toBeTruthy();
    expect(screen.getByText(/4\/4 tasks/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement ArchiveZone**

Create `client/src/components/board/archive-zone.tsx`:

```typescript
export interface ArchivedMilestone {
  id: string;
  title: string;
  project: string;
  totalTasks: number;
  doneTasks: number;
  completedAt?: string;
}

interface Props {
  milestones: ArchivedMilestone[];
}

export function ArchiveZone({ milestones }: Props) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span className="font-semibold text-foreground">Archive</span>
        <span className="bg-muted px-1.5 rounded-full text-[10px]">
          {milestones.length} milestone{milestones.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {milestones.map((ms) => (
          <div
            key={ms.id}
            className="bg-muted/20 border border-border/50 rounded px-3 py-2 flex items-center gap-3 opacity-70"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="text-xs font-medium text-muted-foreground">{ms.title}</div>
              <div className="text-[10px] text-muted-foreground/60">
                {ms.doneTasks}/{ms.totalTasks} tasks{ms.completedAt ? ` · completed ${ms.completedAt}` : ""}
              </div>
            </div>
            <div className="ml-auto text-[10px] text-muted-foreground/50">{ms.project}</div>
          </div>
        ))}
        {milestones.length === 0 && (
          <div className="text-xs text-muted-foreground/50 py-4 text-center">
            No archived milestones
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/board-workspace.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/archive-zone.tsx tests/board-workspace.test.ts
git commit -m "feat: archive zone — completed milestones graveyard"
```

---

### Task 7: Restructure Board Page into Three-Zone Workspace

**Files:**
- Modify: `client/src/pages/board.tsx`
- Modify: `client/src/hooks/use-board.ts`
- Modify: `tests/board-workspace.test.ts`

This is the big integration task. Restructure the board page into the three-zone layout.

- [ ] **Step 1: Write failing test for workspace structure**

Add to `tests/board-workspace.test.ts`:

```typescript
describe("Workspace Layout", () => {
  it("renders project zone at top", () => {
    // The workspace should have a project zone element
    // Test that ProjectZone is rendered
  });

  it("renders board zone in middle", () => {
    // Kanban columns should be in the middle zone
  });

  it("renders archive zone at bottom", () => {
    // Archive zone should be at the bottom
  });

  it("workspace fills viewport height without page scroll", () => {
    // The root element should have h-full and overflow-hidden
  });
});
```

- [ ] **Step 2: Add useProjects to use-board hook**

Read `client/src/hooks/use-board.ts`. Add a hook that fetches project data and transforms it into `ProjectCardData[]`:

```typescript
import { useProjects } from "./use-projects";

export function useBoardProjects(): ProjectCardData[] {
  const { data: projects } = useProjects();
  const { data: boardState } = useBoardState();
  // Transform projects into ProjectCardData, merging board milestone/task counts
  // ...
}
```

Also add `useDeleteTask` mutation:

```typescript
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/board/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["board-stats"] });
    },
  });
}
```

- [ ] **Step 3: Restructure board.tsx**

Read `client/src/pages/board.tsx` fully. Replace the current layout with:

```tsx
return (
  <div className="flex flex-col h-full overflow-hidden">
    {/* TOP: Project Zone (35%) */}
    <div className="shrink-0" style={{ height: "35%" }}>
      <ProjectZone
        projects={boardProjects}
        onProjectClick={handleProjectClick}
      />
    </div>

    {/* MIDDLE: Kanban Board (35%) */}
    <div className="shrink-0 flex flex-col border-b border-border overflow-hidden" style={{ height: "35%" }}>
      <BoardHeader stats={stats} filter={filter} onFilterChange={setFilter} ... />
      <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-0 px-2">
        {BOARD_COLUMNS.map((col) => (
          /* existing column rendering */
        ))}
      </div>
    </div>

    {/* BOTTOM: Archive Zone (30%) */}
    <div className="flex-1 min-h-0">
      <ArchiveZone milestones={archivedMilestones} />
    </div>

    {/* Popouts */}
    {selectedTaskId && <BoardSidePanel ... />}
    {selectedProject && <ProjectPopout ... />}
  </div>
);
```

Remove the old inline archive section (the archivable milestones + collapsible archived section). That's now handled by ArchiveZone.

- [ ] **Step 4: Add project card click handling**

Add state and handlers for project popout:

```typescript
const [selectedProject, setSelectedProject] = useState<ProjectCardData | null>(null);
const [projectAnchorRect, setProjectAnchorRect] = useState<DOMRect | null>(null);

const handleProjectClick = (project: ProjectCardData, e: React.MouseEvent) => {
  if (project.isCurrent) {
    navigate(`/projects/${project.id}`);
    return;
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setSelectedProject(project);
  setProjectAnchorRect(rect);
};
```

- [ ] **Step 5: Run tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/board.tsx client/src/hooks/use-board.ts client/src/components/board/project-zone.tsx client/src/components/board/project-popout.tsx client/src/components/board/archive-zone.tsx tests/board-workspace.test.ts
git commit -m "feat: restructure board into three-zone workspace layout"
```

---

### Task 8: Add Delete Button to Task Popout

**Files:**
- Modify: `client/src/components/board/board-side-panel.tsx`

- [ ] **Step 1: Write failing test**

Add to `tests/board-ui.test.ts`:

```typescript
describe("Delete button visibility", () => {
  it("shows delete button for DB-stored tasks", () => {
    // Task with source: "db" should show delete button
  });

  it("hides delete button for workflow tasks", () => {
    // Task with source: "workflow" should not show delete button
  });
});
```

- [ ] **Step 2: Add delete button to popout**

Read `client/src/components/board/board-side-panel.tsx`. In the footer section, add a delete button that only renders when `task.source === "db"`:

```tsx
{task.source === "db" && (
  <button
    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
    onClick={() => {
      if (confirm("Delete this task? This cannot be undone.")) {
        deleteTask.mutate(task.id);
        onClose();
      }
    }}
  >
    <Trash2 className="w-3 h-3" /> Delete
  </button>
)}
```

Import `useDeleteTask` from `use-board` and call it.

- [ ] **Step 3: Run tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add client/src/components/board/board-side-panel.tsx tests/board-ui.test.ts
git commit -m "feat: add delete button for DB-stored tasks in popout"
```

---

### Task 9: Navigation Changes

**Files:**
- Modify: `client/src/components/layout.tsx`
- Modify: `client/src/pages/projects.tsx` (or router config)

- [ ] **Step 1: Update nav sidebar**

Read `client/src/components/layout.tsx`. In the nav sections array:

- Keep "Board" under Overview — no change needed, the page just has more zones now
- For "Projects" under Entities: change the route to redirect to `/board`, or remove it and let the project cards in the workspace serve as the listing

Read the router config to understand how routes are set up. Add a redirect from `/projects` to `/board`. Keep `/projects/:id` routes intact.

- [ ] **Step 2: Run tests**

Run: `npm run check && npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout.tsx
git commit -m "feat: redirect /projects listing to workspace, keep detail routes"
```

---

### Task 10: Update /work-task Column Flow

**Files:**
- Modify: `~/.claude/plugins/cache/claude-workflow-dev/claude-workflow/0.4.0/skills/work-task/SKILL.md`
- Modify: `~/.claude/plugins/cache/claude-workflow-dev/claude-workflow/0.4.0/skills/update-task/SKILL.md`

These are skill files (markdown), not TypeScript.

- [ ] **Step 1: Update work-task Step 5a (pre-dispatch)**

Read the work-task SKILL.md. Find Step 5a and change from:

```
### 5a. Pre-dispatch
- Mark task `in_progress` (cascade update to TASK.md, MILESTONE.md, ROADMAP.md)
- Read the full task contract file
```

To:

```
### 5a. Pre-dispatch
- Move all sibling `pending` tasks in the same milestone to `ready` (cascade update to TASK.md, MILESTONE.md, ROADMAP.md). This signals that the milestone is scheduled and its tasks are queued.
- Mark the dispatched task `in_progress` (cascade update)
- Read the full task contract file
```

- [ ] **Step 2: Update work-task Step 6a (review)**

Find Step 6a and verify it already says:

```
### 6a. Mark for review
- Update task status to `review` (cascade update)
```

This is correct — no change needed. The `review` status already exists in the update-task transition table.

- [ ] **Step 3: Update update-task valid transitions**

Read the update-task SKILL.md. Find the status transition table and verify `ready` is included. Add if missing:

```
| From | To |
|------|-----|
| `pending` | `ready`, `in_progress`, `cancelled` |
| `ready` | `in_progress`, `pending`, `cancelled` |
| `in_progress` | `blocked`, `review`, `cancelled` |
| `blocked` | `in_progress`, `cancelled` |
| `review` | `completed`, `in_progress` |
| `completed` | (terminal) |
| `cancelled` | `pending` (reactivation) |
```

- [ ] **Step 4: Verify update-task status mapping**

Check that the `statusToColumn` mapping in `server/board/aggregator.ts` already handles `"ready"` → `"ready"` column. It does (line ~70: `"ready"` maps to `"ready"`). No code change needed.

- [ ] **Step 5: Commit**

```bash
# These files are outside the git repo (plugin cache), so no git commit
# But verify the changes are saved
```

---

### Task 11: Final Integration Test & Cleanup

**Files:**
- Modify: `tests/board-workspace.test.ts`

- [ ] **Step 1: Add integration tests**

Add comprehensive tests to `tests/board-workspace.test.ts`:

```typescript
describe("Workspace integration", () => {
  it("project zone, board zone, and archive zone all render", () => {
    // Full page render test
  });

  it("project filter syncs board and archive zones", () => {
    // Changing project filter should update both board tasks and archive milestones
  });

  it("delete mutation removes task from board", () => {
    // After delete, task should not appear
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm run check && npm test`
Expected: All pass, no regressions

- [ ] **Step 3: Verify Pipeline Test data is gone**

Run: `curl -s http://localhost:5100/api/board | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print([t['title'] for t in d['tasks'] if t.get('projectName')=='Pipeline Test'])"`
Expected: `[]` (empty list)

- [ ] **Step 4: Final commit**

```bash
git add tests/board-workspace.test.ts
git commit -m "test: workspace integration tests and final cleanup"
```
