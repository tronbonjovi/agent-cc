// tests/board-aggregation.test.ts
// Tests for hiding completed milestone tasks from kanban columns
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  buildSessionSnapshot: vi.fn(() => null),
  cacheSnapshot: vi.fn(),
  getCachedSnapshot: vi.fn(() => undefined),
}));
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(() => []),
}));

import { aggregateBoardState, computeBoardStats } from "../server/board/aggregator";
import { storage } from "../server/storage";
import { scanProjectTasks } from "../server/scanner/task-scanner";

describe("completed milestone tasks hidden from kanban columns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters tasks of fully-completed milestones from kanban columns", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        // Fully completed milestone — all tasks done
        { id: "ms-done", title: "Done Milestone", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
        { id: "task-d1", title: "Done Task 1", type: "task", status: "completed", parent: "ms-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        { id: "task-d2", title: "Done Task 2", type: "task", status: "done", parent: "ms-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        // Active milestone — has pending tasks
        { id: "ms-active", title: "Active Milestone", type: "milestone", status: "in-progress", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m2.md" },
        { id: "task-a1", title: "Active Task", type: "task", status: "pending", parent: "ms-active", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t3.md" },
      ],
      malformedCount: 0,
    });

    const result = aggregateBoardState();

    // Completed milestone tasks should NOT be in the kanban tasks array
    expect(result.tasks.find(t => t.id === "task-d1")).toBeUndefined();
    expect(result.tasks.find(t => t.id === "task-d2")).toBeUndefined();

    // Active milestone tasks should still be present
    expect(result.tasks.find(t => t.id === "task-a1")).toBeDefined();

    // Both milestones should still be in the milestones array (for the completed zone)
    expect(result.milestones.find(m => m.id === "ms-done")).toBeDefined();
    expect(result.milestones.find(m => m.id === "ms-active")).toBeDefined();
  });

  it("treats mix of done + cancelled tasks as fully completed", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        { id: "ms-mixed", title: "Mixed Milestone", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
        { id: "task-done", title: "Done", type: "task", status: "done", parent: "ms-mixed", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        { id: "task-cancelled", title: "Cancelled", type: "task", status: "cancelled", parent: "ms-mixed", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        { id: "task-completed", title: "Completed", type: "task", status: "completed", parent: "ms-mixed", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t3.md" },
      ],
      malformedCount: 0,
    });

    const result = aggregateBoardState();

    // All tasks from the mixed done/cancelled milestone should be filtered out
    expect(result.tasks.find(t => t.id === "task-done")).toBeUndefined();
    expect(result.tasks.find(t => t.id === "task-cancelled")).toBeUndefined();
    expect(result.tasks.find(t => t.id === "task-completed")).toBeUndefined();

    // Milestone meta should still be present
    const ms = result.milestones.find(m => m.id === "ms-mixed");
    expect(ms).toBeDefined();
    expect(ms!.totalTasks).toBe(3);
    expect(ms!.doneTasks).toBe(3);
  });

  it("keeps tasks from partially-completed milestones in kanban columns", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        { id: "ms-partial", title: "Partial", type: "milestone", status: "in-progress", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
        { id: "task-done", title: "Done", type: "task", status: "done", parent: "ms-partial", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        { id: "task-wip", title: "WIP", type: "task", status: "in-progress", parent: "ms-partial", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
      ],
      malformedCount: 0,
    });

    const result = aggregateBoardState();

    // Both tasks should remain — milestone is not fully completed
    expect(result.tasks.find(t => t.id === "task-done")).toBeDefined();
    expect(result.tasks.find(t => t.id === "task-wip")).toBeDefined();
  });

  it("keeps orphan tasks (no milestone) in kanban columns", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        { id: "ms-done", title: "Done", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
        { id: "task-ms-done", title: "MS Done Task", type: "task", status: "done", parent: "ms-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        { id: "task-orphan", title: "Orphan", type: "task", status: "done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
      ],
      malformedCount: 0,
    });

    const result = aggregateBoardState();

    // Orphan task (no milestone) should remain in kanban
    expect(result.tasks.find(t => t.id === "task-orphan")).toBeDefined();
    // Task from completed milestone should be filtered out
    expect(result.tasks.find(t => t.id === "task-ms-done")).toBeUndefined();
  });

  it("milestone with zero tasks is not considered completed", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        { id: "ms-empty", title: "Empty", type: "milestone", status: "pending", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
      ],
      malformedCount: 0,
    });

    const result = aggregateBoardState();

    // Empty milestone should still be in milestones (not treated as completed)
    const ms = result.milestones.find(m => m.id === "ms-empty");
    expect(ms).toBeDefined();
    expect(ms!.totalTasks).toBe(0);
    expect(ms!.doneTasks).toBe(0);
  });

  it("filters completed milestone tasks across multiple projects", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
      { id: "p2", name: "Beta", type: "project", path: "/tmp/beta" },
    ] as any);

    vi.mocked(scanProjectTasks)
      .mockReturnValueOnce({
        projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "ms-p1-done", title: "P1 Done", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
          { id: "task-p1", title: "P1 Task", type: "task", status: "completed", parent: "ms-p1-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        ],
        malformedCount: 0,
      })
      .mockReturnValueOnce({
        projectId: "p2", projectName: "Beta", projectPath: "/tmp/beta",
        config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
        items: [
          { id: "ms-p2-active", title: "P2 Active", type: "milestone", status: "in-progress", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m2.md" },
          { id: "task-p2", title: "P2 Task", type: "task", status: "pending", parent: "ms-p2-active", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        ],
        malformedCount: 0,
      });

    const result = aggregateBoardState();

    // P1 completed milestone task filtered out
    expect(result.tasks.find(t => t.id === "task-p1")).toBeUndefined();
    // P2 active milestone task remains
    expect(result.tasks.find(t => t.id === "task-p2")).toBeDefined();
  });

  it("board stats exclude completed milestone tasks", () => {
    vi.mocked(storage.getAllEntities).mockReturnValue([
      { id: "p1", name: "Alpha", type: "project", path: "/tmp/alpha" },
    ] as any);

    vi.mocked(scanProjectTasks).mockReturnValue({
      projectId: "p1", projectName: "Alpha", projectPath: "/tmp/alpha",
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      items: [
        { id: "ms-done", title: "Done", type: "milestone", status: "done", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/m.md" },
        { id: "task-d1", title: "Done 1", type: "task", status: "done", parent: "ms-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t1.md" },
        { id: "task-d2", title: "Done 2", type: "task", status: "completed", parent: "ms-done", priority: "medium", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t2.md" },
        { id: "task-active", title: "Active", type: "task", status: "pending", priority: "high", created: "2026-04-07", updated: "2026-04-07", body: "", filePath: "/tmp/t3.md" },
      ],
      malformedCount: 0,
    });

    const state = aggregateBoardState();
    const stats = computeBoardStats(state);

    // Only the active orphan task should count
    expect(stats.totalTasks).toBe(1);
    expect(stats.byColumn["done"]).toBe(0);
    expect(stats.byColumn["queue"]).toBe(1);
  });
});
