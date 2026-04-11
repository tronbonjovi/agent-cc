// tests/analytics-restructure.test.ts
// Tests for analytics main tab restructure: 6 tabs -> 4 tabs
// (Nerve Center, Costs, Activity, Charts)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

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

  it("renders NerveCenterPanel in the nerve-center tab", () => {
    expect(src).toMatch(/<NerveCenterPanel/);
  });

  it("renders CostsTab in the costs tab", () => {
    expect(src).toMatch(/<CostsTab/);
  });

  it("renders ActivityTab as stacked section in nerve center", () => {
    expect(src).toMatch(/<ActivityTab/);
  });

  it("Charts tab renders ChartsTab component", () => {
    expect(src).toMatch(/<ChartsTab/);
  });

  it("imports NerveCenterPanel from session-analytics-panel", () => {
    expect(src).toMatch(/import.*NerveCenterPanel.*from.*session-analytics-panel/);
  });

  it("has updated subtitle reflecting new tabs", () => {
    // Should not reference old set of 6 tabs
    expect(src).not.toMatch(/[Ss]essions.*usage.*costs.*activity.*graph.*discovery/i);
  });
});

describe("session-analytics-panel.tsx exports", () => {
  const src = fs.readFileSync(PANEL_PATH, "utf-8");

  it("exports NerveCenterPanel as a named export", () => {
    expect(src).toMatch(/export\s+function\s+NerveCenterPanel/);
  });
});
