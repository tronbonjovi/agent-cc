// tests/session-analytics-move.test.ts
// Tests for moving session analytics from sessions.tsx to the Analytics page (stats.tsx)
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");
const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

describe("session analytics extraction", () => {
  it("session-analytics-panel.tsx exists as a standalone component", () => {
    expect(fs.existsSync(PANEL_PATH)).toBe(true);
  });

  it("exports SessionAnalyticsTab as a named export", () => {
    const src = fs.readFileSync(PANEL_PATH, "utf-8");
    expect(src).toMatch(/export\s+function\s+SessionAnalyticsTab/);
  });

  it("contains the analytics tab definitions (ANALYTICS_TABS)", () => {
    const src = fs.readFileSync(PANEL_PATH, "utf-8");
    expect(src).toMatch(/ANALYTICS_TABS/);
    expect(src).toMatch(/nerve-center/);
    expect(src).toMatch(/usage/);
  });
});

describe("analytics page (stats.tsx) has restructured tabs", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has Nerve Center as the first tab", () => {
    const nerveCenterIdx = src.indexOf('value="nerve-center"');
    const costsIdx = src.indexOf('value="costs"');
    expect(nerveCenterIdx).toBeGreaterThan(-1);
    expect(costsIdx).toBeGreaterThan(-1);
    expect(nerveCenterIdx).toBeLessThan(costsIdx);
  });

  it("has 5 tabs: Nerve Center, Costs, Charts, Sessions, Messages", () => {
    expect(src).toMatch(/TabsTrigger.*value="nerve-center"/);
    expect(src).toMatch(/TabsTrigger.*value="costs"/);
    expect(src).toMatch(/TabsTrigger.*value="charts"/);
    expect(src).toMatch(/TabsTrigger.*value="sessions"/);
    expect(src).toMatch(/TabsTrigger.*value="messages"/);
  });

  it("has a TabsContent for nerve-center", () => {
    expect(src).toMatch(/TabsContent.*value="nerve-center"/);
  });

  it("renders TopologyLayout inside the nerve-center TabsContent (replaced NerveCenterPanel)", () => {
    expect(src).toMatch(/<TopologyLayout/);
  });

  it("imports topology components from nerve-center barrel", () => {
    expect(src).toMatch(/TopologyLayout/);
    expect(src).toMatch(/nerve-center/);
  });

  it("defaults to nerve-center tab", () => {
    expect(src).toMatch(/\|\|\s*["']nerve-center["']/);
  });
});

describe("sessions.tsx cleanup", () => {
  const src = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("does not define AnalyticsPanel", () => {
    expect(src).not.toMatch(/function\s+AnalyticsPanel/);
  });

  it("does not define ANALYTICS_TABS", () => {
    expect(src).not.toMatch(/ANALYTICS_TABS/);
  });

  it("does not define AnalyticsTabId", () => {
    expect(src).not.toMatch(/AnalyticsTabId/);
  });

  it("does not contain analytics sub-panels (NerveCenterPanel, BashKnowledgePanel, etc.)", () => {
    // These should have moved to the extracted component
    expect(src).not.toMatch(/function\s+NerveCenterPanel/);
    expect(src).not.toMatch(/function\s+BashKnowledgePanel/);
    expect(src).not.toMatch(/function\s+BashSearchResults/);
    expect(src).not.toMatch(/function\s+DecisionLogPanel/);
    expect(src).not.toMatch(/function\s+ProjectDashboardPanel/);
    expect(src).not.toMatch(/function\s+WeeklyDigestPanel/);
    expect(src).not.toMatch(/function\s+PromptLibraryPanel/);
    expect(src).not.toMatch(/function\s+WorkflowConfigPanel/);
    expect(src).not.toMatch(/function\s+FileTimelinePanel/);
  });
});
