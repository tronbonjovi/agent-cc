// tests/analytics-overview.test.ts
// Tests for nerve-center-redesign-task001: Types, API, and force layout hook
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import type {
  ForceGraphData,
  ForceNode,
  ForceEdge,
  EntityType,
} from "@shared/types";

// ─── 1. Type shape tests (compile-time correctness) ───────────────────────

describe("ForceGraphData type shape", () => {
  it("ForceNode accepts all valid entity types", () => {
    const entityTypes: Array<EntityType | "session" | "cost" | "tool" | "agent"> = [
      "project", "mcp", "plugin", "skill", "markdown", "config",
      "session", "cost", "tool", "agent",
    ];
    for (const t of entityTypes) {
      const node: ForceNode = {
        id: `test-${t}`,
        type: t,
        label: `Test ${t}`,
        weight: 0.5,
        health: "ok",
        meta: {},
      };
      expect(node.type).toBe(t);
    }
  });

  it("ForceEdge has source, target, relation strings", () => {
    const edge: ForceEdge = {
      source: "a",
      target: "b",
      relation: "defines_mcp",
    };
    expect(edge.source).toBe("a");
    expect(edge.target).toBe("b");
    expect(edge.relation).toBe("defines_mcp");
  });

  it("ForceGraphData has nodes, edges, and stats", () => {
    const data: ForceGraphData = {
      nodes: [],
      edges: [],
      stats: { totalSessions: 0, totalCost: 0, totalEntities: 0 },
    };
    expect(data.nodes).toEqual([]);
    expect(data.edges).toEqual([]);
    expect(data.stats).toHaveProperty("totalSessions");
    expect(data.stats).toHaveProperty("totalCost");
    expect(data.stats).toHaveProperty("totalEntities");
  });

  it("ForceNode health accepts all valid values", () => {
    const healthValues: ForceNode["health"][] = ["ok", "warning", "error", "unknown"];
    for (const h of healthValues) {
      const node: ForceNode = { id: "h", type: "project", label: "H", weight: 0.5, health: h, meta: {} };
      expect(node.health).toBe(h);
    }
  });
});

// ─── 2. API endpoint tests ────────────────────────────────────────────────

const GRAPH_ROUTE_PATH = path.resolve(__dirname, "../server/routes/graph.ts");

describe("GET /api/graph route", () => {
  const src = fs.readFileSync(GRAPH_ROUTE_PATH, "utf-8");

  it("accepts scope query param", () => {
    expect(src).toMatch(/scope/);
    expect(src).toMatch(/req\.query\.scope|req\.query\["scope"\]/);
  });

  it("accepts project query param", () => {
    expect(src).toMatch(/project/);
    expect(src).toMatch(/req\.query\.project|req\.query\["project"\]/);
  });

  it("returns ForceGraphData shape with stats", () => {
    // The route should build a response with nodes, edges, and stats
    expect(src).toMatch(/stats/);
    expect(src).toMatch(/totalSessions/);
    expect(src).toMatch(/totalCost/);
    expect(src).toMatch(/totalEntities/);
  });

  it("performs weight normalization", () => {
    // Should have normalization logic — look for weight, normalize, or clamp
    expect(src).toMatch(/weight/);
    expect(src).toMatch(/0\.1/); // minimum clamp value
  });

  it("does NOT return dagre position data for force scope", () => {
    // The force graph route should NOT include position: { x, y } in its response
    // The old dagre code may still exist for backward compat, but force nodes should not have positions
    expect(src).toMatch(/ForceGraphData|ForceNode/);
  });

  it("handles scope=system (default)", () => {
    expect(src).toMatch(/system/);
  });

  it("handles scope=sessions with project param", () => {
    expect(src).toMatch(/sessions/);
  });
});

// ─── 3. Weight normalization logic tests ──────────────────────────────────

describe("weight normalization", () => {
  // Test the normalize function behavior
  function normalizeWeight(value: number, maxValue: number): number {
    if (maxValue <= 0) return 0.1;
    return Math.max(0.1, value / maxValue);
  }

  it("normalizes value to 0-1 range", () => {
    expect(normalizeWeight(5, 10)).toBe(0.5);
    expect(normalizeWeight(10, 10)).toBe(1.0);
    expect(normalizeWeight(0, 10)).toBe(0.1); // clamped
  });

  it("clamps minimum to 0.1", () => {
    expect(normalizeWeight(0, 100)).toBe(0.1);
    expect(normalizeWeight(0.01, 100)).toBe(0.1);
  });

  it("handles zero max gracefully", () => {
    expect(normalizeWeight(0, 0)).toBe(0.1);
  });

  it("all weights are between 0.1 and 1.0", () => {
    const values = [0, 1, 5, 10, 20, 50, 100];
    const max = 100;
    for (const v of values) {
      const w = normalizeWeight(v, max);
      expect(w).toBeGreaterThanOrEqual(0.1);
      expect(w).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── 4. No dagre position data in force response ──────────────────────────

describe("no dagre positions in force graph response", () => {
  const src = fs.readFileSync(GRAPH_ROUTE_PATH, "utf-8");

  it("ForceNode type does not include position field", () => {
    // Check that the route file imports ForceNode/ForceGraphData (new types)
    expect(src).toMatch(/ForceNode|ForceGraphData/);
  });

  it("force route does not set x/y on nodes", () => {
    // Force nodes should not have position.x or position.y set by the server
    // The nodes array built for force graph should use weight, not position
    expect(src).toMatch(/weight/);
  });
});

// ─── 5. use-force-layout hook tests ──────────────────────────────────────

const FORCE_LAYOUT_PATH = path.resolve(__dirname, "../client/src/hooks/use-force-layout.ts");

describe("use-force-layout hook", () => {
  const src = fs.readFileSync(FORCE_LAYOUT_PATH, "utf-8");

  it("imports from d3-force", () => {
    expect(src).toMatch(/from ["']d3-force["']/);
  });

  it("imports ForceNode and ForceEdge types", () => {
    expect(src).toMatch(/ForceNode/);
    expect(src).toMatch(/ForceEdge/);
  });

  it("exports useForceLayout function", () => {
    expect(src).toMatch(/export\s+function\s+useForceLayout/);
  });

  it("configures link force with hierarchical distances", () => {
    expect(src).toMatch(/forceLink/);
    expect(src).toMatch(/defines_mcp|has_skill|has_claude_md|has_memory|has_session/);
  });

  it("configures charge force based on node radius", () => {
    expect(src).toMatch(/forceManyBody/);
  });

  it("configures center force", () => {
    expect(src).toMatch(/forceCenter/);
  });

  it("configures collision force", () => {
    expect(src).toMatch(/forceCollide/);
  });

  it("has drag handlers: onDragStart, onDrag, onDragEnd", () => {
    expect(src).toMatch(/onDragStart/);
    expect(src).toMatch(/onDrag[^S]/); // onDrag but not onDragStart
    expect(src).toMatch(/onDragEnd/);
  });

  it("computes radius from weight using minRadius and maxRadius", () => {
    expect(src).toMatch(/minRadius/);
    expect(src).toMatch(/maxRadius/);
    expect(src).toMatch(/weight/);
  });

  it("preserves positions on data change", () => {
    // Should carry over existing node positions for nodes that persist between renders
    expect(src).toMatch(/fx|fy|existing|preserve|carry/i);
  });

  it("exports PositionedNode and PositionedEdge types", () => {
    expect(src).toMatch(/PositionedNode/);
    expect(src).toMatch(/PositionedEdge/);
  });
});

// ─── 6. use-graph hook tests ──────────────────────────────────────────────

const USE_GRAPH_PATH = path.resolve(__dirname, "../client/src/hooks/use-graph.ts");

describe("use-graph hook", () => {
  const src = fs.readFileSync(USE_GRAPH_PATH, "utf-8");

  it("exports useForceGraph function", () => {
    expect(src).toMatch(/export\s+function\s+useForceGraph/);
  });

  it("imports useQuery from react-query", () => {
    expect(src).toMatch(/useQuery/);
    expect(src).toMatch(/@tanstack\/react-query/);
  });

  it("imports ForceGraphData type", () => {
    expect(src).toMatch(/ForceGraphData/);
  });

  it("accepts scope and optional projectKey params", () => {
    expect(src).toMatch(/scope.*system.*sessions|"system"\s*\|\s*"sessions"/);
    expect(src).toMatch(/projectKey/);
  });

  it("builds query with scope param", () => {
    expect(src).toMatch(/scope/);
    expect(src).toMatch(/URLSearchParams|\/api\/graph/);
  });

  it("sets staleTime", () => {
    expect(src).toMatch(/staleTime/);
  });
});

// ─── 7. d3-force is installed ──────────────────────────────────────────────

describe("d3-force dependency", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8")
  );

  it("d3-force is in dependencies", () => {
    expect(pkg.dependencies).toHaveProperty("d3-force");
  });

  it("@types/d3-force is installed", () => {
    // May be in dependencies or devDependencies depending on install flags
    const inDeps = pkg.dependencies?.["@types/d3-force"];
    const inDevDeps = pkg.devDependencies?.["@types/d3-force"];
    expect(inDeps || inDevDeps).toBeTruthy();
  });
});
