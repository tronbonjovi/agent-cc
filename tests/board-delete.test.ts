// tests/board-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Unit tests for isDbStoredTask (no mocking needed) ---

import { isDbStoredTask } from "../server/scanner/task-scanner";

describe("isDbStoredTask", () => {
  it("returns true for itm- prefixed IDs", () => {
    expect(isDbStoredTask("itm-bb030001")).toBe(true);
    expect(isDbStoredTask("itm-aa010001")).toBe(true);
    expect(isDbStoredTask("itm-12345678")).toBe(true);
  });

  it("returns false for workflow task IDs", () => {
    expect(isDbStoredTask("session-investigation-task001")).toBe(false);
    expect(isDbStoredTask("board-cleanup-task001")).toBe(false);
    expect(isDbStoredTask("pipeline-removal")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDbStoredTask("")).toBe(false);
  });

  it("returns false for IDs that contain itm- but don't start with it", () => {
    expect(isDbStoredTask("pre-itm-1234")).toBe(false);
    expect(isDbStoredTask("task-itm-5678")).toBe(false);
  });
});

// --- Route tests with mocking ---

vi.mock("../server/storage", () => ({
  storage: {
    getEntity: vi.fn(),
    getAllEntities: vi.fn(() => []),
  },
}));
vi.mock("../server/scanner/task-scanner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/scanner/task-scanner")>();
  return {
    ...actual,
    scanProjectTasks: vi.fn(() => ({
      items: [],
      config: { statuses: [], types: [], defaultType: "task", defaultPriority: "medium", columnOrder: {} },
      malformedCount: 0, projectId: "", projectName: "", projectPath: "",
    })),
  };
});
vi.mock("../server/task-io", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/task-io")>();
  return {
    ...actual,
    parseTaskFile: vi.fn(),
    writeTaskFile: vi.fn(),
    updateTaskField: vi.fn(),
    generateTaskId: vi.fn(() => "itm-test1234"),
    taskFilename: vi.fn((type: string, title: string, id: string) => `${type}-${id}.md`),
  };
});
vi.mock("../server/db", () => ({
  getDB: vi.fn(() => ({ boardConfig: { projectColors: {}, archivedMilestones: [] } })),
  save: vi.fn(),
}));
vi.mock("../server/board/aggregator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/board/aggregator")>();
  return {
    ...actual,
    aggregateBoardState: vi.fn(() => ({
      tasks: [
        {
          id: "itm-db001",
          title: "DB Stored Task",
          description: "A DB-stored task",
          column: "ready" as const,
          project: "p1",
          projectName: "Test Project",
          projectColor: "#3b82f6",
          priority: "medium" as const,
          dependsOn: [],
          tags: [],
          flagged: false,
          session: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-08",
        },
        {
          id: "board-cleanup-task001",
          title: "Workflow Task",
          description: "A workflow task",
          column: "in-progress" as const,
          project: "p1",
          projectName: "Test Project",
          projectColor: "#3b82f6",
          priority: "medium" as const,
          dependsOn: [],
          tags: [],
          flagged: false,
          session: null,
          createdAt: "2026-04-01",
          updatedAt: "2026-04-08",
        },
      ],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    })),
    computeBoardStats: vi.fn(() => ({
      totalTasks: 2,
      byColumn: { backlog: 0, ready: 1, "in-progress": 1, review: 0, done: 0 },
      activeAgents: 0,
      totalSpend: 0,
      flaggedCount: 0,
    })),
    setArchived: vi.fn(),
    getArchivedMilestones: vi.fn(() => []),
  };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn(), unlinkSync: vi.fn() },
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

import express from "express";
import request from "supertest";
import { createBoardRouter } from "../server/routes/board";
import { BoardEventBus } from "../server/board/events";
import { deleteDbTask } from "../server/board/aggregator";
import { taskFileIndex } from "../server/task-io";

describe("DELETE /api/board/tasks/:id", () => {
  let app: express.Express;
  let events: BoardEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    taskFileIndex.clear();
    events = new BoardEventBus();
    app = express();
    app.use(express.json());
    app.use(createBoardRouter(events));
  });

  it("rejects workflow tasks with 403", async () => {
    const res = await request(app).delete("/api/board/tasks/board-cleanup-task001");
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Only DB-stored tasks");
  });

  it("accepts DB-stored tasks and returns 200", async () => {
    // Seed the taskFileIndex so deleteDbTask can find the file
    taskFileIndex.set("itm-db001", "/tmp/fake-task.md");

    const res = await request(app).delete("/api/board/tasks/itm-db001");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.id).toBe("itm-db001");
  });

  it("returns 404 for unknown DB-stored task IDs", async () => {
    // Don't seed taskFileIndex — task file not found
    const res = await request(app).delete("/api/board/tasks/itm-nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("emits board-refresh event on successful delete", async () => {
    taskFileIndex.set("itm-db001", "/tmp/fake-task.md");

    const emitSpy = vi.spyOn(events, "emit");
    await request(app).delete("/api/board/tasks/itm-db001");
    expect(emitSpy).toHaveBeenCalledWith("board-refresh", {
      taskId: "itm-db001",
      action: "deleted",
    });
  });
});

describe("deleteDbTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskFileIndex.clear();
  });

  it("rejects non-DB-stored tasks", () => {
    const result = deleteDbTask("board-cleanup-task001");
    expect(result.deleted).toBe(false);
    expect(result.error).toContain("Only DB-stored tasks");
  });

  it("returns not-found for unknown DB-stored tasks", () => {
    const result = deleteDbTask("itm-unknown123");
    expect(result.deleted).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("deletes known DB-stored tasks", () => {
    taskFileIndex.set("itm-known123", "/tmp/fake-task.md");
    const result = deleteDbTask("itm-known123");
    expect(result.deleted).toBe(true);
  });

  it("removes task from taskFileIndex after delete", () => {
    taskFileIndex.set("itm-cleanup", "/tmp/fake-task.md");
    deleteDbTask("itm-cleanup");
    expect(taskFileIndex.has("itm-cleanup")).toBe(false);
  });
});
