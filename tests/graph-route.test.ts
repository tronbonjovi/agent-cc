import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import type { Entity, EntityType, CustomNode, CustomEdge } from "@shared/types";

// Set AGENT_CC_DATA before importing storage/db so the module uses our temp dir
const tmpDir = path.join(os.tmpdir(), "cc-graph-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.AGENT_CC_DATA = tmpDir;

// Mock session-scanner so the graph route doesn't try to read real session files
vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => [],
  getCachedStats: () => ({ totalCount: 0, totalSize: 0, activeCount: 0, emptyCount: 0 }),
}));

// Mock agent-scanner so storage.getScanStatus() doesn't fail
vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedAgentStats: () => ({ totalDefinitions: 0, totalExecutions: 0, sessionsWithAgents: 0, byType: {}, byModel: {} }),
}));

// Dynamic imports after mocks are in place
const { Storage } = await import("../server/storage");
const { getDB } = await import("../server/db");

// Import express and the graph router
const express = (await import("express")).default;
const graphRouter = (await import("../server/routes/graph")).default;

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

/** Create a minimal Express app with just the graph router */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(graphRouter);
  return app;
}

/** Helper: make a request to the Express app and return parsed JSON */
async function request(app: ReturnType<typeof express>, url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        return reject(new Error("Failed to get server address"));
      }
      const port = addr.port;
      fetch(`http://127.0.0.1:${port}${url}`)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("GET /api/graph", () => {
  let storage: InstanceType<typeof Storage>;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    const dbPath = path.join(tmpDir, "agent-cc.json");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const tmpPath = dbPath + ".tmp";
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    resetDB();
    storage = new Storage();
    app = createTestApp();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns valid graph data structure with nodes and edges arrays", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Test Project" }));
    storage.upsertEntity(makeEntity("m1", "mcp", { name: "Test MCP" }));
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "m1",
      targetType: "mcp",
      relation: "uses_mcp",
    });

    const { status, body } = await request(app, "/api/graph");

    expect(status).toBe(200);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.nodes).toHaveLength(2);
    expect(body.edges).toHaveLength(1);
  });

  it("nodes have expected shape (id, type, label, health, position)", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Test Project" }));

    const { body } = await request(app, "/api/graph");

    expect(body.nodes).toHaveLength(1);
    const node = body.nodes[0];
    expect(node.id).toBe("p1");
    expect(node.type).toBe("project");
    expect(node.label).toBe("Test Project");
    expect(node.health).toBe("ok");
    expect(node.position).toBeDefined();
    expect(typeof node.position.x).toBe("number");
    expect(typeof node.position.y).toBe("number");
  });

  it("edges have style properties based on relationship type", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Project" }));
    storage.upsertEntity(makeEntity("m1", "mcp", { name: "MCP" }));
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "m1",
      targetType: "mcp",
      relation: "uses_mcp",
    });

    const { body } = await request(app, "/api/graph");

    expect(body.edges).toHaveLength(1);
    const edge = body.edges[0];
    expect(edge.source).toBe("p1");
    expect(edge.target).toBe("m1");
    expect(edge.label).toBe("uses_mcp");
    expect(edge.style).toBeDefined();
    expect(typeof edge.style.color).toBe("string");
    expect(typeof edge.style.strokeWidth).toBe("number");
    expect(edge.style.animated).toBe(true);
  });

  it("includes custom nodes when type=custom or no type filter", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Project" }));
    storage.upsertCustomNode({
      id: "svc-1",
      subType: "service",
      label: "Redis",
      source: "docker-compose",
    });

    const { body } = await request(app, "/api/graph");

    expect(body.nodes).toHaveLength(2);
    const customNode = body.nodes.find((n: any) => n.id === "svc-1");
    expect(customNode).toBeDefined();
    expect(customNode.type).toBe("custom");
    expect(customNode.label).toBe("Redis");
    expect(customNode.subType).toBe("service");
    expect(customNode.source).toBe("docker-compose");
  });

  it("returns empty graph when no entities exist", async () => {
    const { status, body } = await request(app, "/api/graph");

    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(0);
    expect(body.edges).toHaveLength(0);
  });

  it("filters entities by type parameter", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Project" }));
    storage.upsertEntity(makeEntity("m1", "mcp", { name: "MCP" }));
    storage.upsertEntity(makeEntity("s1", "skill", { name: "Skill" }));

    const { body } = await request(app, "/api/graph?types=project,mcp");

    const types = body.nodes.map((n: any) => n.type);
    expect(types).toContain("project");
    expect(types).toContain("mcp");
    expect(types).not.toContain("skill");
  });

  it("applies entity overrides to node labels and descriptions", async () => {
    storage.upsertEntity(makeEntity("p1", "project", { name: "Project", description: "Original" }));
    storage.setEntityOverride("p1", { label: "Custom Label", description: "Custom Desc" });

    const { body } = await request(app, "/api/graph");

    const node = body.nodes.find((n: any) => n.id === "p1");
    expect(node.label).toBe("Custom Label");
    expect(node.description).toBe("Custom Desc");
  });

  it("only includes edges where both source and target are in the node set", async () => {
    storage.upsertEntity(makeEntity("p1", "project"));
    storage.upsertEntity(makeEntity("m1", "mcp"));
    // Relationship to an entity not in the filtered set
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "s1",
      targetType: "skill",
      relation: "has_skill",
    });
    storage.addRelationship({
      sourceId: "p1",
      sourceType: "project",
      targetId: "m1",
      targetType: "mcp",
      relation: "uses_mcp",
    });

    const { body } = await request(app, "/api/graph?types=project,mcp");

    // Only the project->mcp edge should be present (skill entity is filtered out)
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].label).toBe("uses_mcp");
  });
});
