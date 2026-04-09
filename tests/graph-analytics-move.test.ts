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

describe("Graph embedded in Analytics page", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has 6 tabs: Sessions, Usage, Costs, Activity, Graph, Discover", () => {
    expect(src).toMatch(/TabsTrigger.*value="sessions"/);
    expect(src).toMatch(/TabsTrigger.*value="usage"/);
    expect(src).toMatch(/TabsTrigger.*value="costs"/);
    expect(src).toMatch(/TabsTrigger.*value="activity"/);
    expect(src).toMatch(/TabsTrigger.*value="graph"/);
    expect(src).toMatch(/TabsTrigger.*value="discover"/);
  });

  it("Graph tab appears between Activity and Discover", () => {
    const activityIdx = src.indexOf('value="activity"');
    const graphIdx = src.indexOf('value="graph"');
    const discoverIdx = src.indexOf('value="discover"');
    expect(activityIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(-1);
    expect(discoverIdx).toBeGreaterThan(-1);
    expect(graphIdx).toBeGreaterThan(activityIdx);
    expect(graphIdx).toBeLessThan(discoverIdx);
  });

  it("has a TabsContent for graph", () => {
    expect(src).toMatch(/TabsContent.*value="graph"/);
  });

  it("renders GraphPage inside the graph TabsContent", () => {
    expect(src).toMatch(/<GraphPage/);
  });

  it("imports GraphPage from graph.tsx (direct or lazy)", () => {
    // Could be a direct import or a lazy() wrapper
    expect(src).toMatch(/GraphPage.*graph/);
  });

  it("subtitle mentions graph", () => {
    expect(src).toMatch(/[Gg]raph/);
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

  it("g+g shortcut points to /stats?tab=graph instead of /graph", () => {
    expect(shortcutSrc).toMatch(/g:.*\/stats\?tab=graph/);
    expect(shortcutSrc).not.toMatch(/g:\s*"\/graph"/);
  });
});
