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
  isDbStoredTask: vi.fn((id: string) => id.startsWith("itm-")),
}));
vi.mock("../server/board/session-enricher", () => ({
  enrichTaskSession: vi.fn(() => null),
}));
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(() => []),
}));

import { aggregateBoardState, mapTaskToBoard, getProjectColor, statusToColumn, isArchived, setArchived, getArchivedMilestones } from "../server/board/aggregator";
import { storage } from "../server/storage";
import { scanProjectTasks } from "../server/scanner/task-scanner";
import { enrichTaskSession } from "../server/board/session-enricher";
import { getMilestoneColor } from "../shared/milestone-colors";
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
      expect(result!.id).toBe("itm-abc12345");
      expect(result!.column).toBe("backlog");
      expect(result!.project).toBe("proj-1");
      expect(result!.projectName).toBe("My Project");
      expect(result!.projectColor).toBe("#3b82f6");
      expect(result!.priority).toBe("high");
      expect(result!.dependsOn).toEqual(["itm-def67890"]);
      expect(result!.tags).toEqual(["backend"]);
      expect(result!.flagged).toBe(false);
    });

    it("maps blocked status to in-progress column", () => {
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "blocked",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.column).toBe("in-progress");
    });

    it("maps review status to review column", () => {
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "review",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.column).toBe("review");
    });

    it("skips milestone and roadmap type items", () => {
      const task: TaskItem = {
        id: "itm-1", title: "M", type: "milestone", status: "backlog",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
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

    it("populates session enrichment when sessionId exists", () => {
      const mockEnrichment = {
        sessionId: "s-123",
        isActive: true,
        model: "claude-3-5-sonnet",
        lastActivity: null,
        lastActivityTs: "2026-04-07T12:00:00Z",
        messageCount: 10,
        costUsd: 0.50,
        inputTokens: 1000,
        outputTokens: 500,
        healthScore: "good" as const,
        toolErrors: 0,
        durationMinutes: 15,
      };
      vi.mocked(enrichTaskSession).mockReturnValue(mockEnrichment);

      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "in-progress",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
        sessionId: "s-123",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.session).toEqual(mockEnrichment);
      expect(vi.mocked(enrichTaskSession).mock.calls[0][0]).toBe("s-123");
    });

    it("sets session to null when no sessionId", () => {
      vi.mocked(enrichTaskSession).mockReturnValue(null);

      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "in-progress",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.session).toBeNull();
    });
  });

  describe("statusToColumn — workflow status values", () => {
    it("maps 'pending' to 'backlog'", () => {
      expect(statusToColumn("pending")).toBe("backlog");
    });

    it("maps 'in_progress' to 'in-progress'", () => {
      expect(statusToColumn("in_progress")).toBe("in-progress");
    });

    it("maps 'completed' to 'done'", () => {
      expect(statusToColumn("completed")).toBe("done");
    });

    it("maps 'cancelled' to 'done'", () => {
      expect(statusToColumn("cancelled")).toBe("done");
    });

    it("maps 'blocked' to 'in-progress'", () => {
      expect(statusToColumn("blocked")).toBe("in-progress");
    });

    // Existing status values still work
    it("still maps 'backlog' to 'backlog'", () => {
      expect(statusToColumn("backlog")).toBe("backlog");
    });

    it("still maps 'todo' to 'ready'", () => {
      expect(statusToColumn("todo")).toBe("ready");
    });

    it("still maps 'done' to 'done'", () => {
      expect(statusToColumn("done")).toBe("done");
    });
  });

  describe("mapTaskToBoard — milestone color", () => {
    it("includes milestoneColor when task has a milestone parent", () => {
      const milestone: TaskItem = {
        id: "ms-alpha", title: "Alpha", type: "milestone", status: "backlog",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md",
      };
      const task: TaskItem = {
        id: "itm-1", title: "T", type: "task", status: "backlog", parent: "ms-alpha",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", [milestone]);
      expect(result!.milestoneColor).toBe(getMilestoneColor("ms-alpha"));
      expect(typeof result!.milestoneColor).toBe("string");
    });

    it("uses milestoneColorMap when provided", () => {
      const milestone: TaskItem = {
        id: "ms-beta", title: "Beta", type: "milestone", status: "backlog",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md",
      };
      const task: TaskItem = {
        id: "itm-2", title: "T", type: "task", status: "backlog", parent: "ms-beta",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const colorMap = new Map([["ms-beta", "#custom1"]]);
      const result = mapTaskToBoard(task, "p", "P", "#000", [milestone], undefined, colorMap);
      expect(result!.milestoneColor).toBe("#custom1");
    });

    it("milestoneColor is undefined when task has no milestone", () => {
      const task: TaskItem = {
        id: "itm-3", title: "T", type: "task", status: "backlog",
        created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.milestoneColor).toBeUndefined();
    });
  });

  describe("mapTaskToBoard — blocked workflow tasks", () => {
    it("sets flagged: true and flagReason for blocked workflow tasks", () => {
      const task: TaskItem = {
        id: "itm-wf01", title: "Blocked task", type: "task", status: "blocked",
        created: "2026-04-08", updated: "2026-04-08", body: "",
        filePath: "/tmp/project/.claude/roadmap/milestone-1/task-blocked-wf01.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.column).toBe("in-progress");
      expect(result!.flagged).toBe(true);
      expect(result!.flagReason).toBe("Blocked in workflow");
    });

    it("does not override existing flagged state for non-blocked tasks", () => {
      const task: TaskItem = {
        id: "itm-wf02", title: "Normal task", type: "task", status: "in_progress",
        created: "2026-04-08", updated: "2026-04-08", body: "",
        filePath: "/tmp/project/.claude/roadmap/milestone-1/task-normal-wf02.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.flagged).toBe(false);
    });
  });

  describe("mapTaskToBoard — source field", () => {
    it("should set source to 'db' for itm- prefixed tasks", () => {
      const task: TaskItem = {
        id: "itm-abc12345", title: "DB task", type: "task", status: "backlog",
        created: "2026-04-08", updated: "2026-04-08", body: "", filePath: "/tmp/t.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.source).toBe("db");
    });

    it("should set source to 'workflow' for workflow task IDs", () => {
      const task: TaskItem = {
        id: "board-cleanup-task001", title: "Workflow task", type: "task", status: "in_progress",
        created: "2026-04-08", updated: "2026-04-08", body: "",
        filePath: "/tmp/project/.claude/roadmap/milestone/task.md",
      };
      const result = mapTaskToBoard(task, "p", "P", "#000", []);
      expect(result!.source).toBe("workflow");
    });
  });

  describe("milestone archiving", () => {
    it("isArchived returns false for non-archived milestones", () => {
      expect(isArchived("itm-m1")).toBe(false);
    });

    it("setArchived marks a milestone as archived", () => {
      setArchived("itm-m-archive-test", true);
      expect(isArchived("itm-m-archive-test")).toBe(true);
    });

    it("getArchivedMilestones returns all archived IDs", () => {
      setArchived("itm-m-list-1", true);
      setArchived("itm-m-list-2", true);
      const archived = getArchivedMilestones();
      expect(archived).toContain("itm-m-list-1");
      expect(archived).toContain("itm-m-list-2");
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
      // Milestone should have a deterministic color
      expect(result.milestones[0].color).toBe(getMilestoneColor("itm-m1"));
      expect(typeof result.milestones[0].color).toBe("string");
    });

    it("assigns milestoneColor to tasks with a milestone parent", () => {
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
          { id: "itm-3", title: "Orphan Task", type: "task", status: "ready", priority: "low", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t3.md" },
        ],
        malformedCount: 0,
      });

      const result = aggregateBoardState();
      const taskA = result.tasks.find(t => t.id === "itm-1");
      const taskB = result.tasks.find(t => t.id === "itm-2");
      const orphan = result.tasks.find(t => t.id === "itm-3");

      // Tasks with a milestone get milestoneColor
      expect(taskA!.milestoneColor).toBe(getMilestoneColor("itm-m1"));
      expect(taskB!.milestoneColor).toBe(getMilestoneColor("itm-m1"));
      // Orphan task (no milestone) has no milestoneColor
      expect(orphan!.milestoneColor).toBeUndefined();
    });

    it("excludes archived milestones and their tasks by default", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      ] as any);

      vi.mocked(scanProjectTasks).mockReturnValue({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "itm-m-archived", title: "Old Milestone", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
          { id: "itm-archived-child", title: "Old Task", type: "task", status: "done", parent: "itm-m-archived", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
          { id: "itm-m-active", title: "Active Milestone", type: "milestone", status: "backlog", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m2.md" },
          { id: "itm-active-child", title: "Active Task", type: "task", status: "backlog", parent: "itm-m-active", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
          { id: "itm-orphan", title: "No Milestone Task", type: "task", status: "ready", priority: "low", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t3.md" },
        ],
        malformedCount: 0,
      });

      // Archive the old milestone
      setArchived("itm-m-archived", true);

      const result = aggregateBoardState();
      // Should exclude the archived milestone and its child task
      expect(result.milestones.find(m => m.id === "itm-m-archived")).toBeUndefined();
      expect(result.tasks.find(t => t.id === "itm-archived-child")).toBeUndefined();
      // Should include active milestone, its child, and orphan task
      expect(result.milestones.find(m => m.id === "itm-m-active")).toBeDefined();
      expect(result.tasks.find(t => t.id === "itm-active-child")).toBeDefined();
      expect(result.tasks.find(t => t.id === "itm-orphan")).toBeDefined();
    });

    it("does NOT auto-archive fully-completed milestones (manual archive only)", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      ] as any);

      vi.mocked(scanProjectTasks).mockReturnValue({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          // Fully-completed milestone (like pipeline-removal) — all children done
          { id: "pipeline-removal", title: "Pipeline Removal", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m-done.md" },
          { id: "pr-task001", title: "Strip pipeline", type: "task", status: "completed", parent: "pipeline-removal", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t-done1.md" },
          { id: "pr-task002", title: "Remove routes", type: "task", status: "done", parent: "pipeline-removal", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t-done2.md" },
          // Active milestone — has incomplete tasks
          { id: "active-milestone", title: "Active Work", type: "milestone", status: "in-progress", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m-active.md" },
          { id: "active-task", title: "Do thing", type: "task", status: "backlog", parent: "active-milestone", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t-active.md" },
        ],
        malformedCount: 0,
      });

      const result = aggregateBoardState();
      // Fully-completed milestone and its tasks should REMAIN visible (no auto-archive)
      expect(result.milestones.find(m => m.id === "pipeline-removal")).toBeDefined();
      expect(result.tasks.find(t => t.id === "pr-task001")).toBeDefined();
      expect(result.tasks.find(t => t.id === "pr-task002")).toBeDefined();
      // Active milestone and its tasks should still be present
      expect(result.milestones.find(m => m.id === "active-milestone")).toBeDefined();
      expect(result.tasks.find(t => t.id === "active-task")).toBeDefined();
    });

    it("does not auto-archive milestones with any incomplete tasks", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      ] as any);

      vi.mocked(scanProjectTasks).mockReturnValue({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "partial-ms", title: "Partial", type: "milestone", status: "in-progress", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
          { id: "done-child", title: "Done", type: "task", status: "done", parent: "partial-ms", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
          { id: "wip-child", title: "WIP", type: "task", status: "in-progress", parent: "partial-ms", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        ],
        malformedCount: 0,
      });

      const result = aggregateBoardState();
      expect(result.milestones.find(m => m.id === "partial-ms")).toBeDefined();
      expect(result.tasks).toHaveLength(2);
    });

    it("includes archived milestones and their tasks when includeArchived is true", () => {
      vi.mocked(storage.getAllEntities).mockReturnValue([
        { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      ] as any);

      vi.mocked(scanProjectTasks).mockReturnValue({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "itm-m-archived", title: "Old Milestone", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
          { id: "itm-archived-child", title: "Old Task", type: "task", status: "done", parent: "itm-m-archived", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        ],
        malformedCount: 0,
      });

      // itm-m-archived is already archived from the previous test
      const result = aggregateBoardState(undefined, true);
      expect(result.milestones.find(m => m.id === "itm-m-archived")).toBeDefined();
      expect(result.tasks.find(t => t.id === "itm-archived-child")).toBeDefined();
    });
  });
});
