// tests/analytics-nerve-center-subtabs.test.ts
// Tests for nesting subtabs under the Nerve Center main tab
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

describe("Nerve Center subtabs — stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has a secondary tab bar with 5 subtabs inside the nerve-center tab content", () => {
    // Should have buttons/tabs for Overview, File Heatmap, Session Health, Decisions, Workflows
    expect(src).toMatch(/Overview/);
    expect(src).toMatch(/File Heatmap/);
    expect(src).toMatch(/Session Health/);
    expect(src).toMatch(/Decisions/);
    expect(src).toMatch(/Workflows/);
  });

  it("defaults the subtab to overview", () => {
    expect(src).toMatch(/useState.*["']overview["']/);
  });

  it("renders NerveCenterPanel in the overview subtab", () => {
    expect(src).toMatch(/<NerveCenterPanel/);
  });

  it("renders WeeklyDigestPanel in the overview subtab as collapsible", () => {
    expect(src).toMatch(/<WeeklyDigestPanel/);
    // Should have a collapsible/toggle mechanism
    expect(src).toMatch(/Weekly Digest/);
  });

  it("imports individual panel components from session-analytics-panel", () => {
    expect(src).toMatch(/import.*FileHeatmapPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*SessionHealthPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*DecisionLogPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*WorkflowConfigPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*WeeklyDigestPanel.*from.*session-analytics-panel/);
  });

  it("renders FileHeatmapPanel in the files subtab", () => {
    expect(src).toMatch(/nerveSubTab === "files".*&&.*<FileHeatmapPanel|nerveSubTab === "files"[\s\S]*?FileHeatmapPanel/);
  });

  it("renders SessionHealthPanel in the health subtab", () => {
    expect(src).toMatch(/nerveSubTab === "health".*&&.*<SessionHealthPanel|nerveSubTab === "health"[\s\S]*?SessionHealthPanel/);
  });

  it("renders DecisionLogPanel in the decisions subtab", () => {
    expect(src).toMatch(/nerveSubTab === "decisions".*&&.*<DecisionLogPanel|nerveSubTab === "decisions"[\s\S]*?DecisionLogPanel/);
  });

  it("renders WorkflowConfigPanel in the workflows subtab", () => {
    expect(src).toMatch(/nerveSubTab === "workflows".*&&.*<WorkflowConfigPanel|nerveSubTab === "workflows"[\s\S]*?WorkflowConfigPanel/);
  });
});

describe("session-analytics-panel.tsx — exported panels", () => {
  const src = fs.readFileSync(PANEL_PATH, "utf-8");

  it("exports FileHeatmapPanel", () => {
    expect(src).toMatch(/export\s+function\s+FileHeatmapPanel/);
  });

  it("exports SessionHealthPanel", () => {
    expect(src).toMatch(/export\s+function\s+SessionHealthPanel/);
  });

  it("exports DecisionLogPanel", () => {
    expect(src).toMatch(/export\s+function\s+DecisionLogPanel/);
  });

  it("exports WorkflowConfigPanel", () => {
    expect(src).toMatch(/export\s+function\s+WorkflowConfigPanel/);
  });

  it("exports WeeklyDigestPanel", () => {
    expect(src).toMatch(/export\s+function\s+WeeklyDigestPanel/);
  });

  it("removes subtabs that moved to Nerve Center from ANALYTICS_TABS", () => {
    // These should no longer appear in ANALYTICS_TABS inside session-analytics-panel
    expect(src).not.toMatch(/id:\s*["']files["']/);
    expect(src).not.toMatch(/id:\s*["']health["']/);
    expect(src).not.toMatch(/id:\s*["']decisions["']/);
    expect(src).not.toMatch(/id:\s*["']workflows["']/);
    expect(src).not.toMatch(/id:\s*["']digest["']/);
  });
});
