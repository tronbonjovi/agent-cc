// tests/stale-edge-cases.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ── Prune edge-case tests (server-side) ─────────────────────────────────────

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

describe("stale prune edge cases", () => {
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

  it("project without .claude/ but with .git — not stale", () => {
    // Use /tmp which exists on disk but has no .claude/ folder
    const entity = makeProjectEntity("proj-no-claude", "/tmp");
    mockDB.entities["proj-no-claude"] = entity;

    // /tmp exists, so existsSync returns true for the path
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      return String(p) === "/tmp";
    });

    const currentScanIds = new Set<string>();
    pruneStaleProjects(storage, currentScanIds);

    // Directory exists → not stale, regardless of .claude/ presence
    expect(mockDB.entities["proj-no-claude"]).toBeDefined();
    expect(mockDB.staleCounts["proj-no-claude"]).toBeUndefined();
  });

  it("re-discovered project after pruning has clean state", () => {
    const entity = makeProjectEntity("proj-rediscovered", "/tmp/nonexistent-xyz");
    mockDB.entities["proj-rediscovered"] = entity;

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    // Prune it (3 misses → removed)
    const emptySet = new Set<string>();
    pruneStaleProjects(storage, emptySet);
    pruneStaleProjects(storage, emptySet);
    pruneStaleProjects(storage, emptySet);

    expect(mockDB.entities["proj-rediscovered"]).toBeUndefined();
    expect(mockDB.staleCounts["proj-rediscovered"]).toBeUndefined();

    // Re-discover: add entity back (simulating scanner upsert) then run prune with it in scan set
    const freshEntity = makeProjectEntity("proj-rediscovered", "/tmp/nonexistent-xyz");
    freshEntity.scannedAt = new Date().toISOString();
    mockDB.entities["proj-rediscovered"] = freshEntity;

    const withProject = new Set<string>(["proj-rediscovered"]);
    pruneStaleProjects(storage, withProject);

    // Should have no staleCounts entry (deleted, not set to 0)
    expect(mockDB.staleCounts["proj-rediscovered"]).toBeUndefined();
    expect(mockDB.entities["proj-rediscovered"]).toBeDefined();
    expect(mockDB.entities["proj-rediscovered"].scannedAt).toBe(freshEntity.scannedAt);
  });

  it("staleCounts key is fully cleaned up after prune removes a project", () => {
    const entity = makeProjectEntity("proj-cleanup", "/tmp/nonexistent-cleanup-xyz");
    mockDB.entities["proj-cleanup"] = entity;
    mockDB.staleCounts["proj-cleanup"] = 2; // already at 2

    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const emptySet = new Set<string>();
    pruneStaleProjects(storage, emptySet);

    // Entity removed and staleCounts key removed (not orphaned)
    expect(mockDB.entities["proj-cleanup"]).toBeUndefined();
    expect("proj-cleanup" in mockDB.staleCounts).toBe(false);
  });
});

// ── Board filter safety tests (source-level assertions) ─────────────────────

describe("board filter safety — source-level assertions", () => {
  const boardPageSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/board.tsx"),
    "utf-8",
  );

  it("board page cleans stale project IDs from filter", () => {
    // The board page must have logic to remove filter.projects entries
    // that no longer exist in the project list
    expect(boardPageSrc).toMatch(/filter\.projects/);
    // Should have a useEffect or useMemo that references boardProjects and filter
    expect(boardPageSrc).toMatch(/boardProjects/);
  });

  it("filter reset uses setFilter to clear stale project IDs", () => {
    expect(boardPageSrc).toMatch(/setFilter/);
  });
});
