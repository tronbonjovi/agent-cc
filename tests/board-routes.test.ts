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
    // Use a raw http request so we can destroy the socket cleanly
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const http = require("http");
        const clientReq = http.request(
          { hostname: "127.0.0.1", port, path: "/api/board/events", method: "GET" },
          (res: import("http").IncomingMessage) => {
            expect(res.headers["content-type"]).toContain("text/event-stream");
            expect(res.headers["cache-control"]).toBe("no-cache");
            res.destroy();
            server.close();
            resolve();
          }
        );
        clientReq.on("error", (err: NodeJS.ErrnoException) => {
          server.close();
          if (err.code === "ECONNRESET") return; // expected after destroy
          reject(err);
        });
        clientReq.end();
      });
    });
  });
});
