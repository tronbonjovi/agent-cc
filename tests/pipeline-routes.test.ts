import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPipelineRouter } from "../server/routes/pipeline";
import { PipelineEventBus } from "../server/pipeline/events";

vi.mock("../server/db", () => {
  const pipelineConfig = {
    maxClaudeCallsPerTask: 5,
    maxSelfFixAttempts: 3,
    maxCodexRescueAttempts: 1,
    costCeilingPerTaskUsd: 5,
    costCeilingPerMilestoneUsd: 50,
    dailySpendCapUsd: 100,
    maxConcurrentWorkers: 1,
    taskTimeoutMs: 600000,
    model: "sonnet",
    maxTurns: 10,
  };
  const db = { pipelineConfig };
  return {
    getDB: () => db,
    save: vi.fn(),
  };
});

vi.mock("../server/storage", () => ({
  storage: {
    getEntities: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../server/task-io", () => ({
  updateTaskField: vi.fn(),
  taskFileIndex: new Map(),
}));

let app: express.Express;

beforeEach(() => {
  vi.clearAllMocks();
  const events = new PipelineEventBus();
  app = express();
  app.use(express.json());
  app.use(createPipelineRouter(events));
});

describe("GET /api/pipeline/status", () => {
  it("returns null when no milestone running", async () => {
    const res = await request(app).get("/api/pipeline/status");
    expect(res.status).toBe(200);
    expect(res.body.run).toBeNull();
  });
});

describe("GET /api/pipeline/config", () => {
  it("returns default pipeline config", async () => {
    const res = await request(app).get("/api/pipeline/config");
    expect(res.status).toBe(200);
    expect(res.body.maxConcurrentWorkers).toBe(1);
    expect(res.body.costCeilingPerTaskUsd).toBe(5);
  });
});

describe("POST /api/pipeline/milestone/start", () => {
  it("returns 400 without required fields", async () => {
    const res = await request(app)
      .post("/api/pipeline/milestone/start")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown project ID", async () => {
    const res = await request(app)
      .post("/api/pipeline/milestone/start")
      .send({
        milestoneTaskId: "m-1",
        projectId: "unknown-project",
        tasks: [{ id: "t-1", title: "test" }],
        taskOrder: ["t-1"],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unknown project");
  });
});
