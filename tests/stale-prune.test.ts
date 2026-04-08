// tests/stale-prune.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";

// Mock db module
const mockDB = {
  entities: {} as Record<string, any>,
  relationships: [] as any[],
  nextRelId: 1,
  boardConfig: { projectColors: {} as Record<string, string>, archivedMilestones: [] as string[] },
  staleCounts: {} as Record<string, number>,
};

vi.mock("../server/db", () => ({
  getDB: vi.fn(() => mockDB),
  save: vi.fn(),
}));

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedStats: vi.fn(() => ({ totalCount: 0 })),
}));

vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedAgentStats: vi.fn(() => ({ totalDefinitions: 0 })),
}));

import { pruneStaleProjects } from "../server/scanner/project-scanner";
import { Storage } from "../server/storage";
import { getDB, save } from "../server/db";

function makeProjectEntity(id: string, projectPath: string) {
  return {
    id,
    type: "project" as const,
    name: id,
    path: projectPath,
    description: "test",
    lastModified: null,
    tags: [],
    health: "ok" as const,
    data: { path: projectPath },
    scannedAt: new Date().toISOString(),
  };
}

describe("pruneStaleProjects", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage();
    mockDB.entities = {};
    mockDB.relationships = [];
    mockDB.nextRelId = 1;
    mockDB.boardConfig = { projectColors: {}, archivedMilestones: [] };
    mockDB.staleCounts = {};
    vi.restoreAllMocks();
  });

  it("single miss — not pruned, staleCounts = 1", () => {
    const entity = makeProjectEntity("proj-gone", "/tmp/nonexistent-project-xyz");
    mockDB.entities["proj-gone"] = entity;

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const currentScanIds = new Set<string>();
    pruneStaleProjects(storage, currentScanIds);

    expect(mockDB.entities["proj-gone"]).toBeDefined();
    expect(mockDB.staleCounts["proj-gone"]).toBe(1);
  });

  it("three misses — pruned with cascade", () => {
    const entity = makeProjectEntity("proj-gone", "/tmp/nonexistent-project-xyz");
    mockDB.entities["proj-gone"] = entity;
    mockDB.relationships = [
      { id: 1, sourceId: "proj-gone", targetId: "other", type: "uses" },
      { id: 2, sourceId: "other", targetId: "proj-gone", type: "uses" },
      { id: 3, sourceId: "other", targetId: "other2", type: "uses" },
    ];
    mockDB.boardConfig.projectColors["proj-gone"] = "#ff0000";

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const currentScanIds = new Set<string>();
    pruneStaleProjects(storage, currentScanIds);
    pruneStaleProjects(storage, currentScanIds);
    pruneStaleProjects(storage, currentScanIds);

    expect(mockDB.entities["proj-gone"]).toBeUndefined();
    expect(mockDB.relationships).toHaveLength(1);
    expect(mockDB.relationships[0].id).toBe(3);
    expect(mockDB.boardConfig.projectColors["proj-gone"]).toBeUndefined();
    expect(mockDB.staleCounts["proj-gone"]).toBeUndefined();
  });

  it("reappearance resets counter", () => {
    const entity = makeProjectEntity("proj-flaky", "/tmp/nonexistent-project-xyz");
    mockDB.entities["proj-flaky"] = entity;

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const emptySet = new Set<string>();
    pruneStaleProjects(storage, emptySet);
    pruneStaleProjects(storage, emptySet);

    expect(mockDB.staleCounts["proj-flaky"]).toBe(2);

    // Project reappears in scan
    const withProject = new Set<string>(["proj-flaky"]);
    pruneStaleProjects(storage, withProject);

    expect(mockDB.staleCounts["proj-flaky"]).toBeUndefined();
    expect(mockDB.entities["proj-flaky"]).toBeDefined();
  });

  it("directory exists but not in scan — not stale", () => {
    const entity = makeProjectEntity("proj-exists", "/tmp");
    mockDB.entities["proj-exists"] = entity;

    // /tmp exists on disk
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const currentScanIds = new Set<string>();
    pruneStaleProjects(storage, currentScanIds);

    expect(mockDB.entities["proj-exists"]).toBeDefined();
    expect(mockDB.staleCounts["proj-exists"]).toBeUndefined();
  });

  it("cascade removal cleans relationships and colors", () => {
    const entity = makeProjectEntity("proj-cascade", "/tmp/nonexistent-cascade-xyz");
    mockDB.entities["proj-cascade"] = entity;
    mockDB.relationships = [
      { id: 1, sourceId: "proj-cascade", targetId: "a", type: "uses" },
      { id: 2, sourceId: "b", targetId: "proj-cascade", type: "uses" },
    ];
    mockDB.boardConfig.projectColors["proj-cascade"] = "#00ff00";
    mockDB.staleCounts["proj-cascade"] = 2; // already missed twice

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const currentScanIds = new Set<string>();
    pruneStaleProjects(storage, currentScanIds);

    expect(mockDB.entities["proj-cascade"]).toBeUndefined();
    expect(mockDB.relationships).toHaveLength(0);
    expect(mockDB.boardConfig.projectColors["proj-cascade"]).toBeUndefined();
    expect(mockDB.staleCounts["proj-cascade"]).toBeUndefined();
  });

  it("no false positives — all projects present", () => {
    const entity1 = makeProjectEntity("proj-a", "/tmp");
    const entity2 = makeProjectEntity("proj-b", "/home");
    mockDB.entities["proj-a"] = entity1;
    mockDB.entities["proj-b"] = entity2;

    const currentScanIds = new Set<string>(["proj-a", "proj-b"]);
    pruneStaleProjects(storage, currentScanIds);

    expect(mockDB.entities["proj-a"]).toBeDefined();
    expect(mockDB.entities["proj-b"]).toBeDefined();
    expect(Object.keys(mockDB.staleCounts)).toHaveLength(0);
  });
});
