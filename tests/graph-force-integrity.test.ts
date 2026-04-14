import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import type { Entity, EntityType } from "@shared/types";

// Isolate the DB to a temp dir before importing storage.
const tmpDir = path.join(
  os.tmpdir(),
  "cc-force-integrity-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
);
process.env.AGENT_CC_DATA = tmpDir;

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => [],
  getCachedStats: () => ({ totalCount: 0, totalSize: 0, activeCount: 0, emptyCount: 0 }),
}));

vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedExecutions: () => [],
  getCachedAgentStats: () => ({ totalDefinitions: 0, totalExecutions: 0, sessionsWithAgents: 0, byType: {}, byModel: {} }),
}));

vi.mock("../server/scanner/cost-indexer", () => ({
  queryCosts: () => [],
}));

const { Storage } = await import("../server/storage");
const { getDB } = await import("../server/db");
const { buildSystemScope, buildSessionsScope } = await import("../server/routes/graph");
const { buildRelationships } = await import("../server/scanner/relationships");

function makeEntity(id: string, type: EntityType, extra?: Partial<Entity>): Entity {
  return {
    id,
    type,
    name: extra?.name ?? `Entity ${id}`,
    path: extra?.path ?? `/test/${id}`,
    description: extra?.description ?? null,
    lastModified: extra?.lastModified ?? null,
    tags: extra?.tags ?? [],
    health: extra?.health ?? "ok",
    data: extra?.data ?? {},
    scannedAt: extra?.scannedAt ?? new Date().toISOString(),
  };
}

function resetDB(): void {
  const db = getDB();
  for (const key of Object.keys(db.entities)) delete db.entities[key];
  db.relationships = [];
  db.nextRelId = 1;
  db.markdownBackups = [];
  db.nextBackupId = 1;
  db.discoveryCache = {};
  db.customNodes = [];
  db.customEdges = [];
  db.entityOverrides = {};
}

describe("buildSystemScope — structural integrity", () => {
  let storage: InstanceType<typeof Storage>;

  beforeEach(() => {
    const dbPath = path.join(tmpDir, "agent-cc.json");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    resetDB();
    storage = new Storage();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("every edge references nodes that exist in the same response", () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Project One" }));
    storage.upsertEntity(makeEntity("p2", "project", { name: "Project Two" }));
    storage.upsertEntity(makeEntity("m1", "mcp", { name: "MCP A" }));
    storage.upsertEntity(makeEntity("s1", "skill", { name: "Skill A" }));
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "m1",
      targetType: "mcp",
      relation: "uses_mcp",
    });
    storage.addRelationship({
      sourceId: "p2",
      sourceType: "project",
      targetId: "s1",
      targetType: "skill",
      relation: "has_skill",
    });

    const data = buildSystemScope();
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    for (const edge of data.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
    expect(data.edges).toHaveLength(2);
  });

  it("drops relationships whose endpoints are missing from storage", () => {
    storage.upsertEntity(makeEntity("p1", "project"));
    // Orphan relationship — target doesn't exist
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "ghost",
      targetType: "mcp",
      relation: "uses_mcp",
    });

    const data = buildSystemScope();
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    for (const edge of data.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
    expect(data.edges).toHaveLength(0);
  });
});

describe("buildRelationships — global MCP pool", () => {
  let storage: InstanceType<typeof Storage>;

  beforeEach(() => {
    resetDB();
    storage = new Storage();
  });

  it("collapses unconnected global MCPs into a single pool node", () => {
    // Three projects, no direct MCP references
    const projects: Entity[] = [
      makeEntity("proj-a", "project", { name: "A", path: "/work/a", data: { dirName: "a" } }),
      makeEntity("proj-b", "project", { name: "B", path: "/work/b", data: { dirName: "b" } }),
      makeEntity("proj-c", "project", { name: "C", path: "/work/c", data: { dirName: "c" } }),
    ];
    // Two global MCPs — sourceFile outside any project dir, command has no project ref
    const mcps: Entity[] = [
      makeEntity("mcp-x", "mcp", {
        name: "GlobalX",
        path: "/home/u/.mcp.json",
        data: { sourceFile: "/home/u/.mcp.json", command: "node", args: [] },
      }),
      makeEntity("mcp-y", "mcp", {
        name: "GlobalY",
        path: "/home/u/.mcp.json",
        data: { sourceFile: "/home/u/.mcp.json", command: "python", args: [] },
      }),
    ];
    for (const p of projects) storage.upsertEntity(p);
    for (const m of mcps) storage.upsertEntity(m);

    buildRelationships(projects, mcps, [], [], []);

    const data = buildSystemScope();
    const poolNode = data.nodes.find((n) => n.id === "mcp-pool-global");
    expect(poolNode).toBeDefined();
    expect(poolNode?.type).toBe("mcp");

    // Pool edges: one per global MCP, zero fan-out to projects
    const poolEdges = data.edges.filter((e) => e.source === "mcp-pool-global");
    expect(poolEdges).toHaveLength(2);

    // No project→MCP uses_mcp edges should have been created
    const projectMcpEdges = data.edges.filter(
      (e) => e.relation === "uses_mcp" && projects.some((p) => p.id === e.source),
    );
    expect(projectMcpEdges).toHaveLength(0);
  });
});
