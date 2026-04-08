// tests/project-delete.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage
const mockEntities: Record<string, any> = {};
const mockRelationships: any[] = [];
const mockBoardConfig = { projectColors: {} as Record<string, string>, archivedMilestones: [] as string[] };
const mockStaleCounts: Record<string, number> = {};

vi.mock("../server/storage", () => ({
  storage: {
    getEntity: vi.fn((id: string) => mockEntities[id] || null),
    getEntities: vi.fn((type?: string) => {
      const all = Object.values(mockEntities);
      return type ? all.filter((e: any) => e.type === type) : all;
    }),
    getRelationships: vi.fn((id: string) =>
      mockRelationships.filter((r) => r.sourceId === id || r.targetId === id)
    ),
    deleteEntity: vi.fn((id: string) => {
      if (!mockEntities[id]) return false;
      delete mockEntities[id];
      // Cascade relationships
      const remaining = mockRelationships.filter(
        (r) => r.sourceId !== id && r.targetId !== id
      );
      mockRelationships.length = 0;
      mockRelationships.push(...remaining);
      delete mockBoardConfig.projectColors[id];
      delete mockStaleCounts[id];
      return true;
    }),
  },
}));

vi.mock("../server/db", () => ({
  getDB: vi.fn(() => ({
    entities: mockEntities,
    relationships: mockRelationships,
    boardConfig: mockBoardConfig,
    staleCounts: mockStaleCounts,
  })),
  save: vi.fn(),
}));

vi.mock("../server/scanner/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/scanner/utils")>();
  return {
    ...actual,
    encodeProjectKey: actual.encodeProjectKey,
  };
});

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedStats: vi.fn(() => ({ totalCount: 0 })),
}));

vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedAgentStats: vi.fn(() => ({ totalDefinitions: 0 })),
}));

import express from "express";
import request from "supertest";
import projectsRouter from "../server/routes/projects";

const app = express();
app.use(express.json());
app.use(projectsRouter);

function addEntity(id: string, type: string, projectPath: string) {
  mockEntities[id] = {
    id,
    type,
    name: id,
    path: projectPath,
    description: "test",
    lastModified: null,
    tags: [],
    health: "ok",
    data: {},
    scannedAt: new Date().toISOString(),
  };
}

describe("DELETE /api/projects/:id", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockEntities)) delete mockEntities[key];
    mockRelationships.length = 0;
    for (const key of Object.keys(mockBoardConfig.projectColors)) delete mockBoardConfig.projectColors[key];
    for (const key of Object.keys(mockStaleCounts)) delete mockStaleCounts[key];
    vi.clearAllMocks();
  });

  it("returns 200 and removes entity", async () => {
    addEntity("proj-test", "project", "/tmp/test-project");

    const res = await request(app).delete("/api/projects/proj-test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockEntities["proj-test"]).toBeUndefined();
  });

  it("cascade removes relationships and colors", async () => {
    addEntity("proj-cascade", "project", "/tmp/cascade-project");
    mockRelationships.push(
      { id: 1, sourceId: "proj-cascade", targetId: "other", type: "uses" },
      { id: 2, sourceId: "other", targetId: "proj-cascade", type: "uses" },
      { id: 3, sourceId: "a", targetId: "b", type: "uses" },
    );
    mockBoardConfig.projectColors["proj-cascade"] = "#ff0000";
    mockStaleCounts["proj-cascade"] = 2;

    const res = await request(app).delete("/api/projects/proj-cascade");
    expect(res.status).toBe(200);
    expect(mockEntities["proj-cascade"]).toBeUndefined();
    expect(mockRelationships).toHaveLength(1);
    expect(mockBoardConfig.projectColors["proj-cascade"]).toBeUndefined();
    expect(mockStaleCounts["proj-cascade"]).toBeUndefined();
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request(app).delete("/api/projects/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 400 for current project", async () => {
    // The current project is determined by encodeProjectKey(process.cwd())
    const { encodeProjectKey } = await import("../server/scanner/utils");
    const { entityId } = await import("../server/scanner/utils");
    const currentDir = process.cwd();
    const currentKey = `project:${require("path").basename(currentDir)}`;
    const currentId = entityId(currentKey);

    addEntity(currentId, "project", currentDir);

    const res = await request(app).delete(`/api/projects/${currentId}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current project/i);
    // Entity should still exist
    expect(mockEntities[currentId]).toBeDefined();
  });

  it("GET /api/projects no longer includes deleted project", async () => {
    addEntity("proj-gone", "project", "/tmp/gone-project");
    addEntity("proj-stays", "project", "/tmp/stays-project");

    await request(app).delete("/api/projects/proj-gone");

    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).not.toContain("proj-gone");
    expect(ids).toContain("proj-stays");
  });
});
