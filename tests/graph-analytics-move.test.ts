// tests/graph-analytics-move.test.ts
// Tests for moving Graph page into the Analytics page as a tab
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");
const GRAPH_PATH = path.resolve(__dirname, "../client/src/pages/graph.tsx");
const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const SHORTCUTS_PATH = path.resolve(__dirname, "../client/src/hooks/use-keyboard-shortcuts.ts");

describe("Graph tab removed from Analytics page (restructured)", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does not have a Graph tab trigger (removed in analytics restructure)", () => {
    expect(src).not.toMatch(/TabsTrigger.*value="graph"/);
  });

  it("still imports GraphPage lazily (code not deleted yet — cleanup in task003)", () => {
    // GraphPage import remains but is no longer rendered in a tab
    expect(src).toMatch(/GraphPage/);
  });
});

describe("graph.tsx still exists as a component", () => {
  it("graph.tsx file exists", () => {
    expect(fs.existsSync(GRAPH_PATH)).toBe(true);
  });

  it("exports GraphPage as default export", () => {
    const src = fs.readFileSync(GRAPH_PATH, "utf-8");
    expect(src).toMatch(/export\s+default\s+function\s+GraphPage/);
  });
});

describe("/graph route removed from App.tsx", () => {
  const src = fs.readFileSync(APP_PATH, "utf-8");

  it("does not have a /graph route", () => {
    expect(src).not.toMatch(/path="\/graph"/);
  });

  it("does not lazy-import GraphPage", () => {
    // GraphPage should no longer be lazy-loaded in App.tsx since it's embedded
    expect(src).not.toMatch(/lazy\(\(\)\s*=>\s*import\(.*graph.*\)\)/);
  });
});

describe("nav updated for graph removal", () => {
  const layoutSrc = fs.readFileSync(LAYOUT_PATH, "utf-8");

  it("does not have /graph nav link", () => {
    expect(layoutSrc).not.toMatch(/path:\s*"\/graph"/);
  });
});

describe("keyboard shortcut updated", () => {
  const shortcutSrc = fs.readFileSync(SHORTCUTS_PATH, "utf-8");

  it("g+g shortcut points to /analytics?tab=graph instead of /graph", () => {
    expect(shortcutSrc).toMatch(/g:.*\/analytics\?tab=graph/);
    expect(shortcutSrc).not.toMatch(/g:\s*"\/graph"/);
  });
});
