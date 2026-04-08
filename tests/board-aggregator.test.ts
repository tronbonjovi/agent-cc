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
vi.mock("../server/board/session-enricher", () => ({
  enrichTaskSession: vi.fn(() => null),
}));
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(() => []),
}));

import { aggregateBoardState, mapTaskToBoard, getProjectColor, statusToColumn } from "../server/board/aggregator";
import { storage } from "../server/storage";
import { scanProjectTasks } from "../server/scanner/task-scanner";
import { enrichTaskSession } from "../server/board/session-enricher";
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
