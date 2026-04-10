// tests/graph-analytics-move.test.ts
// Tests for Graph page removal from Analytics
// (graph.tsx deleted in analytics-restructure-task003, @xyflow removed from deps)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");
const GRAPH_PATH = path.resolve(__dirname, "../client/src/pages/graph.tsx");
const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const SHORTCUTS_PATH = path.resolve(__dirname, "../client/src/hooks/use-keyboard-shortcuts.ts");
const PKG_PATH = path.resolve(__dirname, "../package.json");

describe("Graph fully removed from Analytics page", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does not have a Graph tab trigger", () => {
    expect(src).not.toMatch(/TabsTrigger.*value="graph"/);
  });

  it("does not import GraphPage", () => {
    expect(src).not.toMatch(/GraphPage/);
  });
});

describe("graph.tsx deleted", () => {
  it("graph.tsx file no longer exists", () => {
    expect(fs.existsSync(GRAPH_PATH)).toBe(false);
  });
});

describe("/graph route removed from App.tsx", () => {
  const src = fs.readFileSync(APP_PATH, "utf-8");

  it("does not have a /graph route", () => {
    expect(src).not.toMatch(/path="\/graph"/);
  });

  it("does not lazy-import GraphPage", () => {
    expect(src).not.toMatch(/lazy\(\(\)\s*=>\s*import\(.*graph.*\)\)/);
  });
});

describe("nav updated for graph removal", () => {
  const layoutSrc = fs.readFileSync(LAYOUT_PATH, "utf-8");

  it("does not have /graph nav link", () => {
    expect(layoutSrc).not.toMatch(/path:\s*"\/graph"/);
  });
});

describe("@xyflow removed from dependencies", () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));

  it("does not have @xyflow/react in dependencies", () => {
    expect(pkg.dependencies?.["@xyflow/react"]).toBeUndefined();
  });
});
