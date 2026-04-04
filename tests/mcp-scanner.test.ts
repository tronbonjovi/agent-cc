import { describe, it, expect } from "vitest";
import { isMCPServerConfig, extractDbNodesFromMcps } from "../server/scanner/mcp-scanner";
import type { Entity } from "../shared/types";

describe("isMCPServerConfig", () => {
  it("accepts object with command property", () => {
    expect(isMCPServerConfig({ command: "node" })).toBe(true);
  });

  it("accepts object with url property", () => {
    expect(isMCPServerConfig({ url: "http://localhost:3000" })).toBe(true);
  });

  it("accepts object with both command and url", () => {
    expect(isMCPServerConfig({ command: "node", url: "http://localhost:3000" })).toBe(true);
  });

  it("rejects null", () => {
    expect(isMCPServerConfig(null)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isMCPServerConfig(["node"])).toBe(false);
  });

  it("rejects objects without command or url", () => {
    expect(isMCPServerConfig({ name: "test", args: ["--flag"] })).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isMCPServerConfig(undefined)).toBe(false);
  });

  it("rejects string primitives", () => {
    expect(isMCPServerConfig("node")).toBe(false);
  });

  it("rejects number primitives", () => {
    expect(isMCPServerConfig(42)).toBe(false);
  });

  it("rejects boolean primitives", () => {
    expect(isMCPServerConfig(true)).toBe(false);
  });
});

/** Helper to build a minimal MCP entity for testing */
function makeMcpEntity(id: string, env?: Record<string, string>): Entity {
  return {
    id,
    type: "mcp",
    name: `test-mcp-${id}`,
    path: `/test/.mcp.json`,
    description: "test MCP",
    lastModified: null,
    tags: ["stdio"],
    health: "ok",
    data: { env },
    scannedAt: new Date().toISOString(),
  };
}

describe("extractDbNodesFromMcps", () => {
  it("extracts a postgres node from env", () => {
    const entity = makeMcpEntity("mcp1", {
      DATABASE_URL: "postgres://admin:secret@db.host:5432/mydb",
    });
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].label).toContain("PostgreSQL");
    expect(result.nodes[0].label).toContain("mydb");
    expect(result.nodes[0].subType).toBe("database");

    expect(result.edges.length).toBe(1);
    expect(result.edges[0].source).toBe("mcp1");
    expect(result.edges[0].target).toBe(result.nodes[0].id);
    expect(result.edges[0].label).toBe("connects_to");
  });

  it("returns empty for entity with no env", () => {
    const entity = makeMcpEntity("mcp2");
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("returns empty for entity with empty env", () => {
    const entity = makeMcpEntity("mcp3", {});
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("skips redacted values (***)", () => {
    const entity = makeMcpEntity("mcp4", {
      DATABASE_URL: "***",
    });
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("deduplicates same database across MCPs", () => {
    const entity1 = makeMcpEntity("mcp5", {
      DB_URL: "postgres://user1:pass@db.host:5432/shared_db",
    });
    const entity2 = makeMcpEntity("mcp6", {
      DB_URL: "postgres://user2:pass@db.host:5432/shared_db",
    });
    const result = extractDbNodesFromMcps([entity1, entity2]);

    // Only one node for the same host:port/db combo
    expect(result.nodes.length).toBe(1);
    // But two edges — one from each MCP
    expect(result.edges.length).toBe(2);
    expect(result.edges[0].source).toBe("mcp5");
    expect(result.edges[1].source).toBe("mcp6");
  });

  it("extracts multiple database types from one MCP", () => {
    const entity = makeMcpEntity("mcp7", {
      PG_URL: "postgres://user:pass@pg.host:5432/app",
      REDIS_URL: "redis://default:secret@redis.host:6379",
    });
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes.length).toBe(2);
    const labels = result.nodes.map(n => n.label);
    expect(labels.some(l => l.includes("PostgreSQL"))).toBe(true);
    expect(labels.some(l => l.includes("Redis"))).toBe(true);
  });

  it("skips non-database env values", () => {
    const entity = makeMcpEntity("mcp8", {
      NODE_ENV: "production",
      LOG_LEVEL: "debug",
      API_KEY: "test-fake-key-value",
    });
    const result = extractDbNodesFromMcps([entity]);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
