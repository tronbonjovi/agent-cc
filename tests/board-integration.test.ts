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
