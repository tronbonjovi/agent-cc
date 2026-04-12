// tests/analytics-restructure.test.ts
// Tests for analytics main tab restructure: 6 tabs -> 4 tabs
// (Nerve Center, Costs, Activity, Charts)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");

describe("analytics tab restructure — stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has exactly 5 main tabs: Nerve Center, Costs, Charts, Sessions, Messages", () => {
    expect(src).toMatch(/TabsTrigger.*value="nerve-center"/);
    expect(src).toMatch(/TabsTrigger.*value="costs"/);
    expect(src).toMatch(/TabsTrigger.*value="charts"/);
    expect(src).toMatch(/TabsTrigger.*value="sessions"/);
    expect(src).toMatch(/TabsTrigger.*value="messages"/);
  });

  it("does NOT have old tabs: Usage, Graph, Discover, Activity (activity merged into nerve center)", () => {
    expect(src).not.toMatch(/TabsTrigger.*value="usage"/);
    expect(src).not.toMatch(/TabsTrigger.*value="graph"/);
    expect(src).not.toMatch(/TabsTrigger.*value="discover"/);
    expect(src).not.toMatch(/TabsTrigger.*value="activity"/);
  });

  it("defaults to nerve-center tab", () => {
    expect(src).toMatch(/\|\|\s*["']nerve-center["']/);
  });

  it("has TabsContent for each of the 5 tabs", () => {
    expect(src).toMatch(/TabsContent.*value="nerve-center"/);
    expect(src).toMatch(/TabsContent.*value="costs"/);
    expect(src).toMatch(/TabsContent.*value="charts"/);
    expect(src).toMatch(/TabsContent.*value="sessions"/);
    expect(src).toMatch(/TabsContent.*value="messages"/);
  });

  it("renders EntityGraph in the nerve-center tab (replaced topology layout)", () => {
    expect(src).toMatch(/<EntityGraph/);
  });

  it("renders CostsTab in the costs tab", () => {
    expect(src).toMatch(/<CostsTab/);
  });

  it("no longer renders the ActivityReflexes organ (deleted with topology)", () => {
    expect(src).not.toMatch(/<ActivityReflexes/);
  });

  it("Charts tab renders ChartsTab component", () => {
    expect(src).toMatch(/<ChartsTab/);
  });

  it("imports EntityGraph and no longer imports from the nerve-center barrel", () => {
    expect(src).toMatch(/import.*EntityGraph.*from.*entity-graph/);
    expect(src).not.toMatch(/from ["']@\/components\/analytics\/nerve-center/);
  });

  it("has updated subtitle reflecting new tabs", () => {
    // Should not reference old set of 6 tabs
    expect(src).not.toMatch(/[Ss]essions.*usage.*costs.*activity.*graph.*discovery/i);
  });
});

// Note (codebase-cleanup-task002): session-analytics-panel.tsx was deleted.
// NerveCenterPanel was dead code and has been removed along with the module.
