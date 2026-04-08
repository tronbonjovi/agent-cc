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
  generateTaskId: vi.fn(() => "itm-test1234"),
  taskFilename: vi.fn((type: string, title: string, id: string) => `${type}-${id}.md`),
}));
vi.mock("../server/db", () => ({
  getDB: vi.fn(() => ({ boardConfig: { projectColors: {} } })),
  save: vi.fn(),
}));

vi.mock("../server/board/aggregator", () => ({
  aggregateBoardState: vi.fn(() => ({
    tasks: [
      {
        id: "itm-test",
        title: "Test Task",
        description: "A test task",
        column: "ready" as const,
        project: "p1",
        projectName: "Test Project",
        projectColor: "#3b82f6",
        priority: "medium" as const,
        dependsOn: [],
        tags: [],
        flagged: false,
        session: {
          sessionId: "sess-123",
          isActive: true,
          model: "claude-3-5-sonnet-20241022",
          lastActivity: "query",
          lastActivityTs: "2026-04-08T10:30:00Z",
          messageCount: 15,
          costUsd: 0.35,
          inputTokens: 2500,
          outputTokens: 1200,
          healthScore: "good" as const,
          toolErrors: 0,
          durationMinutes: 45,
        },
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-08T10:30:00Z",
      },
    ],
    columns: ["backlog", "ready", "in-progress", "review", "done"],
    projects: [],
    milestones: [
      { id: "itm-m1", title: "v1.0", project: "p1", totalTasks: 3, doneTasks: 3 },
    ],
  })),
  computeBoardStats: vi.fn(() => ({
    totalTasks: 1,
    byColumn: { backlog: 0, ready: 1, "in-progress": 0, review: 0, done: 0 },
    activeAgents: 0,
    totalSpend: 0.35,
    flaggedCount: 0,
  })),
  isArchived: vi.fn(() => false),
  setArchived: vi.fn(),
  getArchivedMilestones: vi.fn(() => []),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, default: { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() }, existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});

import express from "express";
import request from "supertest";
import { createBoardRouter } from "../server/routes/board";
import { BoardEventBus } from "../server/board/events";
import { storage } from "../server/storage";
import { aggregateBoardState, setArchived } from "../server/board/aggregator";

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

  it("GET /api/board/tasks/:id/session returns 404 when task not found", async () => {
    vi.mocked(aggregateBoardState).mockReturnValueOnce({
      tasks: [],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    });
    const res = await request(app).get("/api/board/tasks/itm-nonexistent/session");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Task not found");
  });

  it("GET /api/board/tasks/:id/session returns 404 when task has no session", async () => {
    vi.mocked(aggregateBoardState).mockReturnValueOnce({
      tasks: [
        {
          id: "itm-test",
          title: "Test Task",
          description: "A test task",
          column: "ready" as const,
          project: "p1",
          projectName: "Test Project",
          projectColor: "#3b82f6",
          priority: "medium" as const,
          dependsOn: [],
          tags: [],
          flagged: false,
          session: null,
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-08T10:30:00Z",
        },
      ],
      columns: ["backlog", "ready", "in-progress", "review", "done"],
      projects: [],
      milestones: [],
    });
    const res = await request(app).get("/api/board/tasks/itm-test/session");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No session linked to this task");
  });

  it("GET /api/board/tasks/:id/session returns session enrichment for task with session", async () => {
    const res = await request(app).get("/api/board/tasks/itm-test/session");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sessionId");
    expect(res.body).toHaveProperty("isActive");
    expect(res.body).toHaveProperty("model");
    expect(res.body).toHaveProperty("messageCount");
    expect(res.body).toHaveProperty("costUsd");
    expect(res.body.sessionId).toBe("sess-123");
    expect(res.body.messageCount).toBe(15);
  });
});

describe("archive milestone routes", () => {
  let app: express.Express;
  let events: BoardEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new BoardEventBus();
    app = express();
    app.use(express.json());
    app.use(createBoardRouter(events));
  });

  it("POST /api/board/milestones/:id/archive marks milestone as archived", async () => {
    const res = await request(app)
      .post("/api/board/milestones/itm-m1/archive")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("itm-m1");
    expect(res.body.archived).toBe(true);
    expect(vi.mocked(setArchived)).toHaveBeenCalledWith("itm-m1", true);
  });

  it("POST /api/board/milestones/:id/archive returns 404 for unknown milestone", async () => {
    const res = await request(app)
      .post("/api/board/milestones/itm-nonexistent/archive")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Milestone not found");
  });

  it("GET /api/board passes includeArchived query param to aggregator", async () => {
    await request(app).get("/api/board?includeArchived=true");
    expect(vi.mocked(aggregateBoardState)).toHaveBeenCalledWith(undefined, true);
  });

  it("GET /api/board defaults to excluding archived milestones", async () => {
    await request(app).get("/api/board");
    expect(vi.mocked(aggregateBoardState)).toHaveBeenCalledWith(undefined, false);
  });
});

describe("ingest endpoint", () => {
  let app: express.Express;
  let events: BoardEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new BoardEventBus();
    app = express();
    app.use(express.json());
    app.use(createBoardRouter(events));
  });

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
