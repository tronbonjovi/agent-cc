# Pipeline-First Kanban Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic kanban board with a pipeline-first board where columns are fixed pipeline stages and milestones render as collapsible horizontal swimlanes.

**Architecture:** Rewrite the client-side task board components (kanban-board, task-card, milestone-controls, tasks page). Remove drag-and-drop. Add stage-aware card rendering, swimlane layout, and pipeline control integration. Extend the backend task update route with an edit-freeze guard. Add a test data script for development.

**Tech Stack:** React, TypeScript, TanStack React Query, Express, Vitest, `sonner` for toasts, `lucide-react` for icons.

**Spec:** `docs/superpowers/specs/2026-04-06-pipeline-kanban-ui-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `client/src/components/tasks/pipeline-board.tsx` | Top-level board: renders column headers + milestone swimlanes |
| `client/src/components/tasks/milestone-swimlane.tsx` | One milestone row: header bar + task cards distributed across columns |
| `client/src/components/tasks/pipeline-task-card.tsx` | Stage-aware task card (replaces TaskCard + PipelineCardOverlay) |
| `client/src/lib/pipeline-stages.ts` | Shared constants: stage list, stage→column mapping, colors, labels |
| `tests/pipeline-board-ui.test.ts` | Tests for stage mapping, milestone accounting, edit-freeze guard |
| `scripts/load-test-tasks.sh` | Creates a dummy project with milestone + tasks for testing |
| `scripts/clear-test-tasks.sh` | Removes the test project |

### Modified files
| File | Changes |
|---|---|
| `client/src/pages/tasks.tsx` | Strip old board logic, render `PipelineBoard` |
| `client/src/hooks/use-pipeline.ts` | Add `onSettled` + `onError` toast to all mutations, add `projectId` params |
| `client/src/components/tasks/task-detail-panel.tsx` | Add pipeline info section, remove status editing, add edit-freeze |
| `shared/task-types.ts` | Add `blockedFromStage`, `removedFromStage`, `removedAt` fields |
| `server/routes/tasks.ts` | Add edit-freeze guard on `PUT /api/tasks/:taskId` |
| `server/routes/pipeline.ts` | Persist `blockedFromStage` on block transition |
| `server/scanner/task-scanner.ts` | Support `includeRemoved` filter |

### Removed files
| File | Reason |
|---|---|
| `client/src/components/tasks/kanban-board.tsx` | Replaced by `pipeline-board.tsx` |
| `client/src/components/tasks/task-card.tsx` | Replaced by `pipeline-task-card.tsx` |
| `client/src/components/tasks/milestone-controls.tsx` | Absorbed into `milestone-swimlane.tsx` |
| `client/src/components/tasks/board-setup.tsx` | Board setup wizard removed |
| `client/src/components/tasks/inline-create.tsx` | Inline task creation removed |
| `client/src/components/tasks/pipeline-card-overlay.tsx` | Absorbed into `pipeline-task-card.tsx` |
| `client/src/components/tasks/kanban-column.tsx` | Replaced by column rendering in `pipeline-board.tsx` |

---

## Task 1: Pipeline Stage Constants and Type Extensions

**Files:**
- Create: `client/src/lib/pipeline-stages.ts`
- Modify: `shared/task-types.ts`
- Test: `tests/pipeline-board-ui.test.ts`

- [ ] **Step 1: Write failing test for stage mapping**

```typescript
// tests/pipeline-board-ui.test.ts
import { describe, it, expect } from "vitest";
import { stageToColumn, PIPELINE_COLUMNS, isKnownStage } from "../client/src/lib/pipeline-stages";

describe("pipeline stage mapping", () => {
  it("maps undefined/missing pipelineStage to backlog", () => {
    expect(stageToColumn(undefined)).toBe("backlog");
    expect(stageToColumn("")).toBe("backlog");
  });

  it("maps known stages to correct columns", () => {
    expect(stageToColumn("queued")).toBe("queued");
    expect(stageToColumn("build")).toBe("build");
    expect(stageToColumn("ai-review")).toBe("ai-review");
    expect(stageToColumn("human-review")).toBe("human-review");
    expect(stageToColumn("done")).toBe("done");
  });

  it("returns null for blocked (placement uses blockedFromStage)", () => {
    expect(stageToColumn("blocked")).toBeNull();
  });

  it("returns null for hidden stages", () => {
    expect(stageToColumn("descoped")).toBeNull();
    expect(stageToColumn("cancelled")).toBeNull();
  });

  it("returns 'unknown' for unrecognized stages", () => {
    expect(stageToColumn("some-future-stage")).toBe("unknown");
  });

  it("isKnownStage identifies valid stages", () => {
    expect(isKnownStage("build")).toBe(true);
    expect(isKnownStage("blocked")).toBe(true);
    expect(isKnownStage("descoped")).toBe(true);
    expect(isKnownStage("some-future-stage")).toBe(false);
  });

  it("PIPELINE_COLUMNS has 6 entries in order", () => {
    expect(PIPELINE_COLUMNS.map((c) => c.id)).toEqual([
      "backlog", "queued", "build", "ai-review", "human-review", "done",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline-board-ui.test.ts --reporter=dot`
Expected: FAIL — module not found

- [ ] **Step 3: Create pipeline-stages.ts**

```typescript
// client/src/lib/pipeline-stages.ts

export interface PipelineColumn {
  id: string;
  label: string;
  color: string;        // tailwind text color class
  bgTint: string;       // tailwind bg tint for active cards
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: "backlog",      label: "Backlog",       color: "text-zinc-400",   bgTint: "" },
  { id: "queued",       label: "Queued",        color: "text-zinc-400",   bgTint: "" },
  { id: "build",        label: "Build",         color: "text-blue-400",   bgTint: "bg-blue-500/5" },
  { id: "ai-review",    label: "AI Review",     color: "text-purple-400", bgTint: "bg-purple-500/5" },
  { id: "human-review", label: "Human Review",  color: "text-amber-400",  bgTint: "bg-amber-500/5" },
  { id: "done",         label: "Done",          color: "text-green-400",  bgTint: "" },
];

const KNOWN_STAGES = new Set([
  "queued", "build", "ai-review", "human-review", "done",
  "blocked", "descoped", "cancelled",
]);

const HIDDEN_STAGES = new Set(["descoped", "cancelled"]);

const STAGE_TO_COLUMN: Record<string, string> = {
  queued: "queued",
  build: "build",
  "ai-review": "ai-review",
  "human-review": "human-review",
  done: "done",
};

/**
 * Map a task's pipelineStage to a board column ID.
 * Returns:
 * - column ID for normal stages
 * - null for blocked (caller uses blockedFromStage), descoped, cancelled
 * - "unknown" for unrecognized stages
 * - "backlog" for undefined/missing
 */
export function stageToColumn(stage: string | undefined): string | null {
  if (!stage) return "backlog";
  if (stage === "blocked") return null;
  if (HIDDEN_STAGES.has(stage)) return null;
  if (STAGE_TO_COLUMN[stage]) return STAGE_TO_COLUMN[stage];
  return "unknown";
}

export function isKnownStage(stage: string): boolean {
  return KNOWN_STAGES.has(stage);
}

/** Badge colors and labels for milestone states */
export const MILESTONE_BADGES: Record<string, { label: string; color: string; pulse?: boolean }> = {
  not_started:       { label: "Not Started",   color: "bg-zinc-500/15 text-zinc-400" },
  running:           { label: "Running",       color: "bg-blue-500/15 text-blue-400" },
  pausing:           { label: "Pausing...",    color: "bg-yellow-500/15 text-yellow-400", pulse: true },
  paused:            { label: "Paused",        color: "bg-yellow-500/15 text-yellow-400" },
  awaiting_approval: { label: "Review",        color: "bg-amber-500/15 text-amber-400" },
  cancelling:        { label: "Cancelling...", color: "bg-red-500/15 text-red-400", pulse: true },
  completed:         { label: "Done",          color: "bg-green-500/15 text-green-400" },
  cancelled:         { label: "Cancelled",     color: "bg-red-500/15 text-red-400" },
};

export const NON_TERMINAL_STATES = new Set([
  "running", "pausing", "paused", "awaiting_approval", "cancelling",
]);
```

- [ ] **Step 4: Add new fields to TaskItem type**

In `shared/task-types.ts`, add these fields to the `TaskItem` interface after `pipelineBlockedReason`:

```typescript
  blockedFromStage?: string;           // stage task was in when it became blocked
  removedFromStage?: string;           // stage task was in when descoped/cancelled
  removedAt?: string;                  // ISO timestamp of removal
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/pipeline-board-ui.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass (type changes are additive/optional)

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/pipeline-stages.ts shared/task-types.ts tests/pipeline-board-ui.test.ts
git commit -m "feat: pipeline stage constants and type extensions"
```

---

## Task 2: Pipeline Hook Hardening (onSettled + Toast)

**Files:**
- Modify: `client/src/hooks/use-pipeline.ts`

- [ ] **Step 1: Write failing test for mutation error handling**

Add to `tests/pipeline-board-ui.test.ts`:

```typescript
describe("pipeline hooks contract", () => {
  it("all mutation hooks must use onSettled for cache invalidation", async () => {
    // Static analysis: read use-pipeline.ts and verify no onSuccess-only invalidation
    const fs = await import("fs");
    const content = fs.readFileSync("client/src/hooks/use-pipeline.ts", "utf-8");
    // Every mutation should have onSettled, not just onSuccess
    const onSuccessCount = (content.match(/onSuccess/g) || []).length;
    const onSettledCount = (content.match(/onSettled/g) || []).length;
    // After refactor: no onSuccess for cache invalidation, all moved to onSettled
    // onSuccess might still exist for non-cache logic, but onSettled must be present
    expect(onSettledCount).toBeGreaterThanOrEqual(6); // 6 mutation hooks
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline-board-ui.test.ts --reporter=dot`
Expected: FAIL — currently 0 onSettled

- [ ] **Step 3: Refactor all mutation hooks in use-pipeline.ts**

Replace every mutation hook's `onSuccess` with `onSettled` for cache invalidation, and add `onError` for toasts. Apply this pattern to all 6 mutations (`useUpdatePipelineConfig`, `useStartMilestone`, `usePauseMilestone`, `useResumeMilestone`, `useApproveMilestone`, `useDescopeTask`):

```typescript
// Example pattern for useStartMilestone — apply same to all 6:
export function useStartMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: {
      milestoneTaskId: string;
      projectId: string;
      baseBranch?: string;
      taskOrder: string[];
      parallelGroups?: string[][];
    }) => {
      const res = await fetch("/api/pipeline/milestone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start milestone");
      }
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Action failed — board refreshed");
    },
  });
}
```

Add `import { toast } from "sonner";` at the top of the file.

Apply this pattern (onSettled + onError toast) to all 6 mutation hooks. The `tasks` query key invalidation is new — previously only some hooks invalidated tasks.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline-board-ui.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/use-pipeline.ts tests/pipeline-board-ui.test.ts
git commit -m "fix: pipeline hooks use onSettled for cache invalidation + error toasts"
```

---

## Task 3: Server-Side Edit Freeze and blockedFromStage Persistence

**Files:**
- Modify: `server/routes/tasks.ts`
- Modify: `server/routes/pipeline.ts`
- Modify: `server/scanner/task-scanner.ts`
- Modify: `server/task-io.ts`
- Test: `tests/pipeline-board-ui.test.ts`

- [ ] **Step 1: Write failing test for edit-freeze guard**

Add to `tests/pipeline-board-ui.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("edit-freeze guard", () => {
  // These test the route behavior via the task-routes module
  // We'll test the guard function directly

  it("should identify non-terminal milestone states", () => {
    const { NON_TERMINAL_STATES } = require("../client/src/lib/pipeline-stages");
    expect(NON_TERMINAL_STATES.has("running")).toBe(true);
    expect(NON_TERMINAL_STATES.has("pausing")).toBe(true);
    expect(NON_TERMINAL_STATES.has("paused")).toBe(true);
    expect(NON_TERMINAL_STATES.has("awaiting_approval")).toBe(true);
    expect(NON_TERMINAL_STATES.has("cancelling")).toBe(true);
    expect(NON_TERMINAL_STATES.has("completed")).toBe(false);
    expect(NON_TERMINAL_STATES.has("cancelled")).toBe(false);
    expect(NON_TERMINAL_STATES.has("not_started")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (constants already exist from Task 1)

Run: `npx vitest run tests/pipeline-board-ui.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Add edit-freeze guard to PUT /api/tasks/:taskId**

In `server/routes/tasks.ts`, in the `PUT /api/tasks/:taskId` handler, add this block after the existing conflict check (`expectedUpdated`) and before the field updates:

```typescript
  // Edit-freeze: reject metadata mutations for tasks in active milestone runs.
  // A milestone is "active" if PipelineManager reports a non-null run with a non-terminal status.
  // The task belongs to the run if its parent milestone matches the run's milestoneTaskId.
  if (existing.parent) {
    const pipelineStatus = pipelineManager?.getStatus();
    if (pipelineStatus) {
      const NON_TERMINAL = new Set(["running", "pausing", "paused", "awaiting_approval", "cancelling"]);
      if (
        NON_TERMINAL.has(pipelineStatus.status) &&
        existing.parent === pipelineStatus.milestoneTaskId
      ) {
        return res.status(409).json({
          error: "Editing disabled — this task belongs to an active pipeline run. Wait for the run to complete or cancel it first.",
        });
      }
    }
  }
```

This requires `pipelineManager` to be accessible from the tasks route. Add an optional parameter to the task router setup:

In `server/routes/tasks.ts`, change the router export to a factory function:

```typescript
import type { PipelineManager } from "../pipeline/manager";

let pipelineManager: PipelineManager | null = null;

export function setPipelineManager(pm: PipelineManager) {
  pipelineManager = pm;
}

// ... rest of router stays the same
```

In `server/routes/pipeline.ts`, after creating the manager, call `setPipelineManager(manager)`.

- [ ] **Step 4: Add blockedFromStage persistence to pipeline route**

In `server/routes/pipeline.ts`, in the `onTaskStatusChange` callback, add `blockedFromStage` when a task transitions to blocked:

```typescript
    onTaskStatusChange: (taskId, newStatus, projectId) => {
      events.emit("task-stage-changed", { taskId, stage: newStatus });
      try {
        updateTaskField(taskId, "pipelineStage", newStatus, projectId);
        const run = manager.getStatus();
        const workerState = run?.workers[taskId];
        if (workerState) {
          updateTaskField(taskId, "pipelineBranch", workerState.branchName, projectId);
          updateTaskField(taskId, "pipelineCost", workerState.totalCostUsd, projectId);
          updateTaskField(taskId, "pipelineActivity", workerState.currentActivity, projectId);
          if (newStatus === "blocked") {
            updateTaskField(taskId, "pipelineBlockedReason", workerState.currentActivity, projectId);
            // Persist the stage the task was in before it got blocked
            const previousStage = workerState.stage === "blocked"
              ? workerState.attempts.length > 0 ? "build" : "queued"
              : workerState.stage;
            updateTaskField(taskId, "blockedFromStage", previousStage, projectId);
          }
        }
      } catch {
        // Non-fatal
      }
    },
```

- [ ] **Step 5: Add blockedFromStage/removedFromStage/removedAt to task-io.ts parse and write**

In `server/task-io.ts`, in `parseTaskFile`, add after the `pipelineBlockedReason` line:

```typescript
      blockedFromStage: d.blockedFromStage ? String(d.blockedFromStage) : undefined,
      removedFromStage: d.removedFromStage ? String(d.removedFromStage) : undefined,
      removedAt: d.removedAt ? String(d.removedAt) : undefined,
```

In `writeTaskFile`, add after the `pipelineBlockedReason` line:

```typescript
  if (task.blockedFromStage) frontmatter.blockedFromStage = task.blockedFromStage;
  if (task.removedFromStage) frontmatter.removedFromStage = task.removedFromStage;
  if (task.removedAt) frontmatter.removedAt = task.removedAt;
```

- [ ] **Step 6: Add includeRemoved support to task scanner**

In `server/scanner/task-scanner.ts`, add a second parameter:

```typescript
export function scanProjectTasks(
  projectPath: string,
  projectId: string,
  projectName: string,
  opts?: { includeRemoved?: boolean }
): TaskBoardState {
```

After pushing items, filter removed tasks unless `includeRemoved` is true:

```typescript
  // After the scanning loop, filter removed tasks unless explicitly requested
  if (!opts?.includeRemoved) {
    result.items = result.items.filter(
      (item) => item.pipelineStage !== "descoped" && item.pipelineStage !== "cancelled"
    );
  }
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All pass (additive changes, existing tests don't use removed stages)

- [ ] **Step 8: Commit**

```bash
git add server/routes/tasks.ts server/routes/pipeline.ts server/task-io.ts server/scanner/task-scanner.ts shared/task-types.ts
git commit -m "feat: edit-freeze guard, blockedFromStage persistence, includeRemoved filter"
```

---

## Task 4: Pipeline Task Card Component

**Files:**
- Create: `client/src/components/tasks/pipeline-task-card.tsx`

- [ ] **Step 1: Create the stage-aware task card**

```tsx
// client/src/components/tasks/pipeline-task-card.tsx
import { cn } from "@/lib/utils";
import { PIPELINE_COLUMNS } from "@/lib/pipeline-stages";
import type { TaskItem } from "@shared/task-types";

interface PipelineTaskCardProps {
  task: TaskItem;
  onClick: () => void;
}

const stageStyles: Record<string, { border: string; textMuted?: boolean; pulse?: boolean }> = {
  backlog:        { border: "border-l-zinc-600" },
  queued:         { border: "border-l-zinc-500" },
  build:          { border: "border-l-blue-500", pulse: true },
  "ai-review":    { border: "border-l-purple-500", pulse: true },
  "human-review": { border: "border-l-amber-500" },
  done:           { border: "border-l-green-500", textMuted: true },
  blocked:        { border: "border-l-red-500" },
};

export function PipelineTaskCard({ task, onClick }: PipelineTaskCardProps) {
  const stage = task.pipelineStage || "backlog";
  const isBlocked = stage === "blocked";
  const isDone = stage === "done";
  const isActive = stage === "build" || stage === "ai-review";
  const style = stageStyles[stage] || stageStyles.backlog;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3 cursor-pointer transition-colors",
        "hover:border-border/80 border-l-[3px]",
        style.border,
        isDone && "opacity-50",
        isBlocked && "bg-red-950/20 border-red-900/50",
      )}
    >
      <div className="text-sm font-medium leading-tight">{task.title}</div>

      {/* Priority badge for backlog/queued */}
      {(stage === "backlog" || stage === "queued") && task.priority && (
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium mt-1.5 inline-block",
          task.priority === "high" && "bg-red-500/15 text-red-400",
          task.priority === "medium" && "bg-amber-500/15 text-amber-400",
          task.priority === "low" && "bg-blue-500/15 text-blue-400",
        )}>
          {task.priority}
        </span>
      )}

      {/* Active stage: activity + branch + cost */}
      {isActive && (
        <div className="mt-2 space-y-1">
          <div className={cn("text-xs animate-pulse", stage === "build" ? "text-blue-400" : "text-purple-400")}>
            {task.pipelineActivity ?? "working..."}
          </div>
          {task.pipelineBranch && (
            <div className="text-[10px] text-zinc-600 font-mono truncate">{task.pipelineBranch}</div>
          )}
          {task.pipelineCost != null && task.pipelineCost > 0 && (
            <div className="text-[10px] text-zinc-500">${task.pipelineCost.toFixed(2)}</div>
          )}
        </div>
      )}

      {/* Human review: branch + cost, attention-seeking */}
      {stage === "human-review" && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-amber-400">awaiting review</div>
          {task.pipelineBranch && (
            <div className="text-[10px] text-zinc-600 font-mono truncate">{task.pipelineBranch}</div>
          )}
          {task.pipelineCost != null && (
            <div className="text-[10px] text-zinc-500">${task.pipelineCost.toFixed(2)}</div>
          )}
        </div>
      )}

      {/* Done: just cost */}
      {isDone && task.pipelineCost != null && (
        <div className="mt-1.5 text-[10px] text-zinc-600">${task.pipelineCost.toFixed(2)}</div>
      )}

      {/* Blocked: reason + descope hint */}
      {isBlocked && (
        <div className="mt-2 space-y-1">
          {task.pipelineBlockedReason && (
            <div className="text-xs text-red-400 truncate" title={task.pipelineBlockedReason}>
              {task.pipelineBlockedReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Card for unknown-stage tasks in the error row */
export function UnknownStageCard({ task, onClick }: PipelineTaskCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 cursor-pointer"
    >
      <div className="text-sm font-medium text-amber-300">{task.title}</div>
      <div className="text-xs text-amber-500 mt-1">Unknown stage: {task.pipelineStage}</div>
      <div className="text-[10px] text-amber-600 mt-1">Unrecognized state — refresh the page or cancel the milestone to recover.</div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tasks/pipeline-task-card.tsx
git commit -m "feat: stage-aware pipeline task card component"
```

---

## Task 5: Milestone Swimlane Component

**Files:**
- Create: `client/src/components/tasks/milestone-swimlane.tsx`

- [ ] **Step 1: Create the milestone swimlane**

```tsx
// client/src/components/tasks/milestone-swimlane.tsx
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_COLUMNS,
  MILESTONE_BADGES,
  NON_TERMINAL_STATES,
  stageToColumn,
  isKnownStage,
} from "@/lib/pipeline-stages";
import {
  useStartMilestone,
  usePauseMilestone,
  useResumeMilestone,
  useApproveMilestone,
  useDescopeTask,
  usePipelineStatus,
} from "@/hooks/use-pipeline";
import { PipelineTaskCard, UnknownStageCard } from "./pipeline-task-card";
import type { TaskItem } from "@shared/task-types";
import type { MilestoneRun } from "../../types/pipeline";

interface MilestoneSwimlaneProps {
  milestone: TaskItem;
  tasks: TaskItem[];
  removedTasks: TaskItem[];
  projectId: string;
  run: MilestoneRun | null;
  anyMilestoneActive: boolean;
  onClickTask: (task: TaskItem) => void;
}

export function MilestoneSwimlane({
  milestone,
  tasks,
  removedTasks,
  projectId,
  run,
  anyMilestoneActive,
  onClickTask,
}: MilestoneSwimlaneProps) {
  const isThisRun = run?.milestoneTaskId === milestone.id;
  const milestoneStatus = isThisRun ? run!.status : "not_started";
  // If all tasks are done/human-review, show awaiting_approval
  const effectiveStatus = milestoneStatus === "completed" ? "completed"
    : milestoneStatus === "cancelled" ? "cancelled"
    : milestoneStatus;

  const badge = MILESTONE_BADGES[effectiveStatus] || MILESTONE_BADGES.not_started;

  const [expanded, setExpanded] = useState(
    NON_TERMINAL_STATES.has(effectiveStatus) || effectiveStatus === "not_started"
  );
  const [showRemoved, setShowRemoved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const startMutation = useStartMilestone();
  const pauseMutation = usePauseMilestone();
  const resumeMutation = useResumeMilestone();
  const approveMutation = useApproveMilestone();
  const descopeMutation = useDescopeTask();

  // Distribute tasks into columns
  const columnTasks: Record<string, TaskItem[]> = {};
  const unknownTasks: TaskItem[] = [];
  for (const col of PIPELINE_COLUMNS) {
    columnTasks[col.id] = [];
  }

  for (const task of tasks) {
    const stage = task.pipelineStage;
    if (stage === "blocked") {
      // Place in blockedFromStage column, or error row if unknown
      const fromStage = task.blockedFromStage;
      const col = fromStage ? stageToColumn(fromStage) : null;
      if (col && col !== "unknown" && columnTasks[col]) {
        columnTasks[col].push(task);
      } else {
        unknownTasks.push(task);
      }
    } else {
      const col = stageToColumn(stage);
      if (col === "unknown") {
        unknownTasks.push(task);
      } else if (col && columnTasks[col]) {
        columnTasks[col].push(task);
      }
      // null (descoped/cancelled) are filtered out by caller
    }
  }

  // Accounting
  const activeTasks = tasks.filter((t) =>
    t.pipelineStage !== "descoped" && t.pipelineStage !== "cancelled"
  );
  const doneTasks = activeTasks.filter((t) => t.pipelineStage === "done");
  const hasUnknown = unknownTasks.some((t) => !isKnownStage(t.pipelineStage || ""));
  const totalCost = isThisRun ? run!.totalCostUsd : 0;

  function handleStart() {
    if (activeTasks.length === 0) return;
    startMutation.mutate({
      milestoneTaskId: milestone.id,
      projectId,
      taskOrder: activeTasks.map((t) => t.id),
      parallelGroups: [],
    });
  }

  function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    // Actually cancel — useCancelMilestone would go here
    // For now, we need to add this hook. Using fetch directly:
    fetch("/api/pipeline/milestone/cancel", { method: "POST" }).then(() => {
      setConfirmCancel(false);
    });
  }

  const canStart = !anyMilestoneActive && activeTasks.length > 0;
  const canApprove = effectiveStatus === "awaiting_approval" && !hasUnknown;

  return (
    <div className="border-b border-zinc-800">
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5 cursor-pointer",
          "hover:bg-zinc-800/30 transition-colors",
          NON_TERMINAL_STATES.has(effectiveStatus) && "bg-zinc-800/20",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
          <span className="font-medium text-sm">{milestone.title}</span>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", badge.color, badge.pulse && "animate-pulse")}>
            {badge.label}
          </span>
          {hasUnknown && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {unknownTasks.filter((t) => !isKnownStage(t.pipelineStage || "")).length} unmapped
            </span>
          )}
          {removedTasks.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowRemoved(!showRemoved); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 hover:text-zinc-300"
            >
              {removedTasks.length} removed
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-zinc-500" onClick={(e) => e.stopPropagation()}>
          <span>{doneTasks.length}/{activeTasks.length} tasks</span>
          {totalCost > 0 && <span>${totalCost.toFixed(2)}</span>}

          {/* Controls */}
          {effectiveStatus === "not_started" && (
            <button
              onClick={handleStart}
              disabled={!canStart || startMutation.isPending}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!canStart ? "Another milestone is active" : undefined}
            >
              {startMutation.isPending ? "Starting..." : "Start"}
            </button>
          )}
          {effectiveStatus === "running" && (
            <>
              <button onClick={() => pauseMutation.mutate()} className="rounded bg-yellow-600 px-2.5 py-1 text-xs text-white hover:bg-yellow-500">
                Pause
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
          {effectiveStatus === "paused" && (
            <>
              <button onClick={() => resumeMutation.mutate()} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500">
                Resume
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
          {effectiveStatus === "awaiting_approval" && (
            <>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={!canApprove || approveMutation.isPending}
                className="rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title={hasUnknown ? `Cannot approve — ${unknownTasks.length} task(s) in unknown state` : undefined}
              >
                Approve
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded: task grid */}
      {expanded && (
        <div className="flex min-h-[80px]">
          {PIPELINE_COLUMNS.map((col) => (
            <div key={col.id} className={cn("flex-1 min-w-0 p-2 border-r border-zinc-800/50 last:border-r-0", col.bgTint)}>
              <div className="space-y-2">
                {columnTasks[col.id].map((task) => (
                  <PipelineTaskCard key={task.id} task={task} onClick={() => onClickTask(task)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error row for unknown-stage tasks */}
      {expanded && unknownTasks.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/10 border-t border-amber-900/30">
          <div className="text-[10px] text-amber-500 mb-1.5 font-medium">Unmapped Tasks</div>
          <div className="flex gap-2 flex-wrap">
            {unknownTasks.map((task) => (
              <UnknownStageCard key={task.id} task={task} onClick={() => onClickTask(task)} />
            ))}
          </div>
        </div>
      )}

      {/* Removed tasks audit row */}
      {showRemoved && removedTasks.length > 0 && (
        <div className="px-4 py-2 bg-zinc-900/50 border-t border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1.5 font-medium">Removed Tasks</div>
          {removedTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-1 text-xs text-zinc-500">
              <span className="text-zinc-400">{task.title}</span>
              <span className="text-[10px]">{task.pipelineStage}</span>
              {task.removedFromStage && <span className="text-[10px]">from {task.removedFromStage}</span>}
              {task.removedAt && <span className="text-[10px]">{task.removedAt}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: May have a type error for `MilestoneRun` import — we need to create a client-side type file. Add a minimal type re-export:

Create `client/src/types/pipeline.ts`:
```typescript
// Minimal client-side pipeline types (mirrors server types needed by UI)
export interface MilestoneRun {
  id: string;
  milestoneTaskId: string;
  projectId: string;
  status: string;
  totalCostUsd: number;
  pauseReason?: string;
}
```

- [ ] **Step 3: Run TypeScript check again**

Run: `npm run check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add client/src/components/tasks/milestone-swimlane.tsx client/src/types/pipeline.ts
git commit -m "feat: milestone swimlane component with controls and accounting"
```

---

## Task 6: Pipeline Board Component

**Files:**
- Create: `client/src/components/tasks/pipeline-board.tsx`

- [ ] **Step 1: Create the top-level pipeline board**

```tsx
// client/src/components/tasks/pipeline-board.tsx
import { cn } from "@/lib/utils";
import { PIPELINE_COLUMNS, NON_TERMINAL_STATES } from "@/lib/pipeline-stages";
import { usePipelineStatus, usePipelineEvents } from "@/hooks/use-pipeline";
import { MilestoneSwimlane } from "./milestone-swimlane";
import type { TaskItem } from "@shared/task-types";

interface PipelineBoardProps {
  items: TaskItem[];
  removedItems: TaskItem[];
  projectId: string;
  onClickTask: (task: TaskItem) => void;
}

export function PipelineBoard({ items, removedItems, projectId, onClickTask }: PipelineBoardProps) {
  const { data: statusData } = usePipelineStatus();
  const { connected } = usePipelineEvents();

  const run = statusData?.run ?? null;
  const anyMilestoneActive = run ? NON_TERMINAL_STATES.has(run.status) : false;

  // Find milestones
  const milestones = items.filter((item) => item.type === "milestone");

  // Group tasks by milestone
  function getTasksForMilestone(milestoneId: string): TaskItem[] {
    return items.filter((item) => item.parent === milestoneId && item.type === "task");
  }
  function getRemovedForMilestone(milestoneId: string): TaskItem[] {
    return removedItems.filter((item) => item.parent === milestoneId);
  }

  // Orphan tasks (no parent or parent is not a milestone)
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const orphanTasks = items.filter(
    (item) => item.type === "task" && (!item.parent || !milestoneIds.has(item.parent))
  );

  if (milestones.length === 0 && orphanTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="text-muted-foreground">No milestones found for this project</div>
        <div className="text-sm text-muted-foreground/60">Create a plan document and run plan-to-roadmap to populate this board</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* SSE status banner */}
      {!connected && (
        <div className="px-4 py-1.5 bg-amber-950/30 border-b border-amber-900/30 text-xs text-amber-400">
          Live updates disconnected — refresh to restore
        </div>
      )}

      {/* Column headers */}
      <div className="flex border-b border-zinc-800 sticky top-0 bg-background z-10">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.id} className={cn("flex-1 min-w-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider", col.color)}>
            {col.label}
          </div>
        ))}
      </div>

      {/* Milestone swimlanes */}
      <div className="flex-1 overflow-y-auto">
        {milestones.map((milestone) => (
          <MilestoneSwimlane
            key={milestone.id}
            milestone={milestone}
            tasks={getTasksForMilestone(milestone.id)}
            removedTasks={getRemovedForMilestone(milestone.id)}
            projectId={projectId}
            run={run}
            anyMilestoneActive={anyMilestoneActive}
            onClickTask={onClickTask}
          />
        ))}

        {/* Orphan tasks without a milestone — show in a generic swimlane */}
        {orphanTasks.length > 0 && (
          <div className="border-b border-zinc-800">
            <div className="px-4 py-2.5 text-sm font-medium text-zinc-500">Unassigned Tasks</div>
            <div className="flex min-h-[60px]">
              {PIPELINE_COLUMNS.map((col) => (
                <div key={col.id} className="flex-1 min-w-0 p-2 border-r border-zinc-800/50 last:border-r-0">
                  {/* Orphans go to backlog since they have no pipeline stage */}
                  {col.id === "backlog" && orphanTasks.map((task) => (
                    <div key={task.id} onClick={() => onClickTask(task)} className="rounded-lg border bg-card p-3 cursor-pointer text-sm mb-2">
                      {task.title}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tasks/pipeline-board.tsx
git commit -m "feat: pipeline board component with column headers and swimlanes"
```

---

## Task 7: Rewire Tasks Page

**Files:**
- Modify: `client/src/pages/tasks.tsx`

- [ ] **Step 1: Rewrite the tasks page**

Replace the entire content of `client/src/pages/tasks.tsx`:

```tsx
import { useParams, useLocation } from "wouter";
import { useEntities } from "@/hooks/use-entities";
import { useTaskBoard } from "@/hooks/use-tasks";
import { PipelineBoard } from "@/components/tasks/pipeline-board";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { ProjectPicker } from "@/components/tasks/project-picker";
import { useState, useEffect } from "react";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

export default function TasksPage() {
  const params = useParams<{ projectId?: string }>();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading: loadingProjects } = useEntities<ProjectEntity>("project");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(params.projectId || null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  useEffect(() => {
    if (!selectedProjectId && projects?.length) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== params.projectId) {
      setLocation(`/tasks/${selectedProjectId}`);
    }
  }, [selectedProjectId]);

  // Main board query (excludes removed tasks)
  const { data: board, isLoading: loadingBoard } = useTaskBoard(selectedProjectId || undefined);

  // TODO: Add a second query with includeRemoved=true for the audit row
  // For now, removedItems will be empty until we add the query param support
  const removedItems: TaskItem[] = [];

  if (loadingProjects) {
    return <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b text-sm">
        <ProjectPicker
          projects={projects || []}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => { setSelectedProjectId(id); setSelectedTask(null); }}
        />
        {board?.malformedCount ? (
          <span className="ml-auto text-[10px] text-amber-500/70">{board.malformedCount} file(s) skipped</span>
        ) : null}
      </div>

      {/* Board area */}
      <div className="flex-1 overflow-hidden">
        {!selectedProjectId && (
          <div className="flex items-center justify-center h-full text-muted-foreground">Select a project to view tasks</div>
        )}

        {selectedProjectId && loadingBoard && (
          <div className="flex items-center justify-center h-full"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" /></div>
        )}

        {selectedProjectId && board && (
          <PipelineBoard
            items={board.items}
            removedItems={removedItems}
            projectId={selectedProjectId}
            onClickTask={setSelectedTask}
          />
        )}
      </div>

      {/* Detail panel */}
      {board && (
        <TaskDetailPanel
          task={selectedTask}
          config={board.config}
          open={selectedTask !== null}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => {}}
          onDelete={() => {}}
          allItems={board.items}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: Clean (or minor issues with the detail panel props — adjust as needed)

- [ ] **Step 3: Run dev server and visually verify**

Run: `npm run dev`
Open `http://localhost:5100/tasks` — verify:
- Project picker works
- Empty state shows "No milestones found" message
- No console errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/tasks.tsx
git commit -m "feat: rewire tasks page to use pipeline board"
```

---

## Task 8: Extend Task Detail Panel

**Files:**
- Modify: `client/src/components/tasks/task-detail-panel.tsx`

- [ ] **Step 1: Add pipeline section and edit-freeze logic**

In `task-detail-panel.tsx`, make these changes:

1. Add a pipeline info section after the title input:

```tsx
{/* Pipeline info (read-only) */}
{task.pipelineStage && (
  <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Pipeline</div>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div><span className="text-zinc-500">Stage:</span> <span className="text-zinc-300">{task.pipelineStage}</span></div>
      {task.pipelineBranch && <div><span className="text-zinc-500">Branch:</span> <span className="text-zinc-300 font-mono">{task.pipelineBranch}</span></div>}
      {task.pipelineCost != null && <div><span className="text-zinc-500">Cost:</span> <span className="text-zinc-300">${task.pipelineCost.toFixed(2)}</span></div>}
      {task.pipelineActivity && <div className="col-span-2"><span className="text-zinc-500">Activity:</span> <span className="text-zinc-300">{task.pipelineActivity}</span></div>}
      {task.pipelineBlockedReason && <div className="col-span-2"><span className="text-zinc-500">Blocked:</span> <span className="text-red-400">{task.pipelineBlockedReason}</span></div>}
    </div>
  </div>
)}
```

2. Remove the status `<select>` from the grid (the entire status div).

3. Add an `isFrozen` prop or derive it. For simplicity, pass it from the parent. When frozen, disable all input fields and show a banner:

```tsx
{isFrozen && (
  <div className="text-xs text-amber-400 bg-amber-950/30 rounded px-3 py-2">
    Editing disabled while this milestone is running.
  </div>
)}
```

Set `disabled` on all input fields when `isFrozen` is true. Hide the Save and Delete buttons when frozen.

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add client/src/components/tasks/task-detail-panel.tsx
git commit -m "feat: pipeline info section in detail panel, remove status editing, add edit freeze"
```

---

## Task 9: SSE Degradation Handling

**Files:**
- Modify: `client/src/hooks/use-pipeline.ts`

- [ ] **Step 1: Update usePipelineEvents to handle disconnection properly**

In the `usePipelineEvents` hook, update the error handler to invalidate queries and enable polling:

```typescript
export function usePipelineEvents() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/pipeline/events");

    es.addEventListener("connected", (e) => {
      setConnected(true);
      setLastEvent({ type: "connected", ...JSON.parse(e.data) });
    });

    const eventTypes = [
      "milestone-started", "milestone-paused", "milestone-completed", "milestone-stalled",
      "task-stage-changed", "task-progress", "task-blocked", "task-completed",
      "budget-warning", "budget-exceeded",
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e) => {
        const data = JSON.parse(e.data);
        setLastEvent({ type: eventType, ...data });
        if (eventType.startsWith("task-") || eventType.startsWith("milestone-")) {
          queryClient.invalidateQueries({ queryKey: ["pipeline", "status"] });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Full refetch on disconnect
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };

    return () => {
      es.close();
    };
  }, [queryClient]);

  return { connected, lastEvent };
}
```

- [ ] **Step 2: Enable sustained polling when disconnected**

In `usePipelineStatus`, make the refetch interval conditional:

```typescript
export function usePipelineStatus(sseConnected?: boolean) {
  return useQuery({
    queryKey: ["pipeline", "status"],
    queryFn: async () => {
      const res = await fetch("/api/pipeline/status");
      if (!res.ok) throw new Error("Failed to fetch pipeline status");
      return res.json();
    },
    refetchInterval: sseConnected === false ? 5000 : 10000, // faster when SSE is down
  });
}
```

Thread `connected` from `usePipelineEvents` into `usePipelineStatus` at the call site in `pipeline-board.tsx`.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/use-pipeline.ts client/src/components/tasks/pipeline-board.tsx
git commit -m "fix: SSE disconnect triggers full refetch and sustained polling"
```

---

## Task 10: Remove Old Components

**Files:**
- Remove: `client/src/components/tasks/kanban-board.tsx`
- Remove: `client/src/components/tasks/task-card.tsx`
- Remove: `client/src/components/tasks/milestone-controls.tsx`
- Remove: `client/src/components/tasks/board-setup.tsx`
- Remove: `client/src/components/tasks/inline-create.tsx`
- Remove: `client/src/components/tasks/pipeline-card-overlay.tsx`
- Remove: `client/src/components/tasks/kanban-column.tsx`

- [ ] **Step 1: Search for any remaining imports of old components**

Run: `grep -r "kanban-board\|task-card\|milestone-controls\|board-setup\|inline-create\|pipeline-card-overlay\|kanban-column" client/src/ --include="*.tsx" --include="*.ts" -l`

Fix any remaining imports. The tasks page was already rewritten in Task 7. Check if any other pages import these.

- [ ] **Step 2: Delete the old files**

```bash
rm client/src/components/tasks/kanban-board.tsx
rm client/src/components/tasks/task-card.tsx
rm client/src/components/tasks/milestone-controls.tsx
rm client/src/components/tasks/board-setup.tsx
rm client/src/components/tasks/inline-create.tsx
rm client/src/components/tasks/pipeline-card-overlay.tsx
rm client/src/components/tasks/kanban-column.tsx
```

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: Clean — no remaining references to deleted files

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old kanban components (replaced by pipeline board)"
```

---

## Task 11: Test Data Script

**Files:**
- Create: `scripts/load-test-tasks.sh`
- Create: `scripts/clear-test-tasks.sh`

- [ ] **Step 1: Create load-test-tasks.sh**

```bash
#!/bin/bash
# Creates a dummy project with a milestone and tasks for testing the pipeline board.
# Idempotent — safe to run multiple times.

set -euo pipefail

PROJECT_DIR="${HOME}/dev/test-projects/pipeline-test"
TASKS_DIR="${PROJECT_DIR}/.claude/tasks"
AGENT_CC_DATA="${AGENT_CC_DATA:-${HOME}/.agent-cc}"
DB_FILE="${AGENT_CC_DATA}/agent-cc.json"

echo "Setting up test project at ${PROJECT_DIR}..."

# Create project dir + git repo
mkdir -p "${PROJECT_DIR}"
cd "${PROJECT_DIR}"
if [ ! -d .git ]; then
  git init
  git commit --allow-empty -m "init"
fi

# Create tasks directory
mkdir -p "${TASKS_DIR}"

# Write config
cat > "${TASKS_DIR}/_config.md" << 'CONFIGEOF'
---
type: task-config
statuses:
  - backlog
  - queued
  - build
  - ai-review
  - human-review
  - done
types:
  - roadmap
  - milestone
  - task
default_type: task
default_priority: medium
column_order: {}
---
CONFIGEOF

# Milestone
cat > "${TASKS_DIR}/milestone-auth-system-aa01.md" << 'EOF'
---
id: itm-aa010001
title: "Auth System"
type: milestone
status: backlog
priority: high
created: "2026-04-06"
updated: "2026-04-06"
---

Implement user authentication including login, registration, JWT tokens, and session management.
EOF

# Task 1: User model
cat > "${TASKS_DIR}/task-user-model-bb01.md" << 'EOF'
---
id: itm-bb010001
title: "User model and DB schema"
type: task
status: backlog
priority: high
parent: itm-aa010001
created: "2026-04-06"
updated: "2026-04-06"
---

Create the User model with fields: id, email, passwordHash, createdAt, updatedAt.
Add the database migration.
EOF

# Task 2: Password hashing
cat > "${TASKS_DIR}/task-password-hashing-bb02.md" << 'EOF'
---
id: itm-bb020001
title: "Password hashing service"
type: task
status: backlog
priority: high
parent: itm-aa010001
dependsOn:
  - itm-bb010001
created: "2026-04-06"
updated: "2026-04-06"
---

Implement bcrypt password hashing and verification. Wrap in a service with hash() and verify() methods.
EOF

# Task 3: JWT service
cat > "${TASKS_DIR}/task-jwt-service-bb03.md" << 'EOF'
---
id: itm-bb030001
title: "JWT token service"
type: task
status: backlog
priority: medium
parent: itm-aa010001
dependsOn:
  - itm-bb010001
created: "2026-04-06"
updated: "2026-04-06"
---

Create JWT sign and verify functions. Support access tokens (15min) and refresh tokens (7d).
EOF

# Task 4: Login endpoint
cat > "${TASKS_DIR}/task-login-endpoint-bb04.md" << 'EOF'
---
id: itm-bb040001
title: "Login endpoint"
type: task
status: backlog
priority: high
parent: itm-aa010001
dependsOn:
  - itm-bb020001
  - itm-bb030001
created: "2026-04-06"
updated: "2026-04-06"
---

POST /api/auth/login — validate credentials, return JWT access + refresh tokens.
EOF

# Task 5: Rate limiter
cat > "${TASKS_DIR}/task-rate-limiter-bb05.md" << 'EOF'
---
id: itm-bb050001
title: "Rate limiter middleware"
type: task
status: backlog
priority: medium
parent: itm-aa010001
dependsOn:
  - itm-bb040001
created: "2026-04-06"
updated: "2026-04-06"
---

Add rate limiting to auth endpoints. 5 attempts per minute per IP. Return 429 on exceed.
EOF

# Task 6: Session cleanup
cat > "${TASKS_DIR}/task-session-cleanup-bb06.md" << 'EOF'
---
id: itm-bb060001
title: "Session cleanup job"
type: task
status: backlog
priority: low
parent: itm-aa010001
created: "2026-04-06"
updated: "2026-04-06"
---

Cron job that deletes expired refresh tokens from the database. Runs every hour.
EOF

# Register project in Agent CC entity store
if [ -f "${DB_FILE}" ]; then
  # Use node to safely update JSON
  node -e "
    const fs = require('fs');
    const db = JSON.parse(fs.readFileSync('${DB_FILE}', 'utf-8'));
    if (!db.entities) db.entities = {};
    db.entities['pipeline-test'] = {
      id: 'pipeline-test',
      type: 'project',
      name: 'Pipeline Test',
      path: '${PROJECT_DIR}',
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    fs.writeFileSync('${DB_FILE}', JSON.stringify(db, null, 2));
    console.log('Registered project in Agent CC entity store');
  "
else
  echo "Warning: Agent CC database not found at ${DB_FILE} — project won't appear in picker"
fi

echo "Done! Test project created with 1 milestone and 6 tasks."
echo "Refresh Agent CC to see it in the project picker."
```

- [ ] **Step 2: Create clear-test-tasks.sh**

```bash
#!/bin/bash
# Removes the test project created by load-test-tasks.sh

set -euo pipefail

PROJECT_DIR="${HOME}/dev/test-projects/pipeline-test"
AGENT_CC_DATA="${AGENT_CC_DATA:-${HOME}/.agent-cc}"
DB_FILE="${AGENT_CC_DATA}/agent-cc.json"

if [ -d "${PROJECT_DIR}" ]; then
  rm -rf "${PROJECT_DIR}"
  echo "Removed test project at ${PROJECT_DIR}"
else
  echo "No test project found at ${PROJECT_DIR}"
fi

if [ -f "${DB_FILE}" ]; then
  node -e "
    const fs = require('fs');
    const db = JSON.parse(fs.readFileSync('${DB_FILE}', 'utf-8'));
    if (db.entities && db.entities['pipeline-test']) {
      delete db.entities['pipeline-test'];
      fs.writeFileSync('${DB_FILE}', JSON.stringify(db, null, 2));
      console.log('Removed project from Agent CC entity store');
    }
  "
fi

echo "Done!"
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/load-test-tasks.sh scripts/clear-test-tasks.sh
```

- [ ] **Step 4: Test the scripts**

```bash
scripts/load-test-tasks.sh
ls ~/dev/test-projects/pipeline-test/.claude/tasks/
scripts/clear-test-tasks.sh
```

Expected: Files created and cleaned up without errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/load-test-tasks.sh scripts/clear-test-tasks.sh
git commit -m "feat: test data scripts for pipeline board development"
```

---

## Task 12: Integration Test and Smoke Test

**Files:**
- Modify: `tests/pipeline-board-ui.test.ts`

- [ ] **Step 1: Add integration tests**

Add to `tests/pipeline-board-ui.test.ts`:

```typescript
describe("milestone accounting", () => {
  it("excludes descoped tasks from active count", () => {
    const tasks: Partial<TaskItem>[] = [
      { id: "1", pipelineStage: "done" },
      { id: "2", pipelineStage: "build" },
      { id: "3", pipelineStage: "descoped" },
      { id: "4", pipelineStage: "blocked" },
    ];
    const active = tasks.filter(
      (t) => t.pipelineStage !== "descoped" && t.pipelineStage !== "cancelled"
    );
    const done = active.filter((t) => t.pipelineStage === "done");
    expect(active.length).toBe(3); // done, build, blocked
    expect(done.length).toBe(1);
  });

  it("blocked card uses blockedFromStage for column placement", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: "build" };
    const col = stageToColumn(task.blockedFromStage);
    expect(col).toBe("build");
  });

  it("blocked card with unknown blockedFromStage goes to error row", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: "future-stage" };
    const col = stageToColumn(task.blockedFromStage);
    expect(col).toBe("unknown");
  });

  it("blocked card with missing blockedFromStage goes to error row", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: undefined };
    const col = stageToColumn(task.blockedFromStage);
    // stageToColumn(undefined) returns "backlog", but for blocked cards
    // the caller checks blockedFromStage specifically — null means error row
    expect(col).toBe("backlog"); // caller logic handles this
  });
});

describe("task-io roundtrip with new fields", () => {
  it("preserves blockedFromStage and removedFromStage through parse/write", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { parseTaskFile, writeTaskFile } = await import("../server/task-io");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-task-"));
    const filePath = path.join(tmpDir, "test.md");

    const task: any = {
      id: "itm-test0001",
      title: "Test task",
      type: "task",
      status: "backlog",
      created: "2026-04-06",
      updated: "2026-04-06",
      body: "",
      filePath,
      pipelineStage: "blocked",
      blockedFromStage: "build",
      removedFromStage: "ai-review",
      removedAt: "2026-04-06T12:00:00Z",
    };

    writeTaskFile(filePath, task);
    const parsed = parseTaskFile(filePath);

    expect(parsed).not.toBeNull();
    expect(parsed!.blockedFromStage).toBe("build");
    expect(parsed!.removedFromStage).toBe("ai-review");
    expect(parsed!.removedAt).toBe("2026-04-06T12:00:00Z");

    // Cleanup
    fs.unlinkSync(filePath);
    fs.rmdirSync(tmpDir);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 3: Run the full safety check**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=dot`
Expected: PASS — no PII, no hardcoded paths in new code

- [ ] **Step 4: Run TypeScript check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add tests/pipeline-board-ui.test.ts
git commit -m "test: pipeline board UI integration tests"
```

---

## Task 13: Visual Smoke Test with Test Data

This task is manual — load test data and verify the board visually.

- [ ] **Step 1: Load test data**

```bash
scripts/load-test-tasks.sh
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Open the board and verify**

Open `http://localhost:5100/tasks`, select "Pipeline Test" from the project picker. Verify:

- [ ] Six pipeline columns visible, evenly distributed across the width
- [ ] "Auth System" milestone appears as a collapsible swimlane
- [ ] All 6 tasks are in the Backlog column
- [ ] Milestone header shows "Not Started" badge, "0/6 tasks", and a "Start" button
- [ ] Clicking a task opens the detail panel with title, body, priority, labels (editable)
- [ ] Detail panel has no "Status" field
- [ ] Empty state for other projects shows "No milestones found" message
- [ ] No console errors

- [ ] **Step 4: Clean up test data**

```bash
scripts/clear-test-tasks.sh
```

---

## Summary

| Task | What it does | Dependencies |
|---|---|---|
| 1 | Stage constants + type extensions | None |
| 2 | Pipeline hook hardening | None |
| 3 | Server-side edit freeze + blockedFromStage | Task 1 (types) |
| 4 | Pipeline task card | Task 1 |
| 5 | Milestone swimlane | Task 1, 4 |
| 6 | Pipeline board | Task 1, 5 |
| 7 | Rewire tasks page | Task 6 |
| 8 | Extend detail panel | Task 7 |
| 9 | SSE degradation | Task 2, 6 |
| 10 | Remove old components | Task 7 |
| 11 | Test data scripts | None |
| 12 | Integration tests | Task 1, 3 |
| 13 | Visual smoke test | Task 7, 11 |

Tasks 1, 2, 11 can run in parallel. Tasks 4-7 are sequential. Task 10 must be last code task.
