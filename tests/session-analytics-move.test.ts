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

describe("analytics page (stats.tsx) has Sessions tab", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has a Sessions tab trigger as the first tab", () => {
    // Sessions should appear before Usage in the tab list
    const sessionsIdx = src.indexOf('value="sessions"');
    const usageIdx = src.indexOf('value="usage"');
    expect(sessionsIdx).toBeGreaterThan(-1);
    expect(usageIdx).toBeGreaterThan(-1);
    expect(sessionsIdx).toBeLessThan(usageIdx);
  });

  it("has 5 tabs: Sessions, Usage, Costs, Activity, Discover", () => {
    expect(src).toMatch(/TabsTrigger.*value="sessions"/);
    expect(src).toMatch(/TabsTrigger.*value="usage"/);
    expect(src).toMatch(/TabsTrigger.*value="costs"/);
    expect(src).toMatch(/TabsTrigger.*value="activity"/);
    expect(src).toMatch(/TabsTrigger.*value="discover"/);
  });

  it("has a TabsContent for sessions", () => {
    expect(src).toMatch(/TabsContent.*value="sessions"/);
  });

  it("renders SessionAnalyticsTab inside the sessions TabsContent", () => {
    expect(src).toMatch(/<SessionAnalyticsTab/);
  });

  it("imports SessionAnalyticsTab from session-analytics-panel", () => {
    expect(src).toMatch(/import.*SessionAnalyticsTab.*from.*session-analytics-panel/);
  });

  it("has updated subtitle mentioning sessions", () => {
    expect(src).toMatch(/[Ss]essions.*usage.*costs.*activity.*discovery/i);
  });

  it("defaults to sessions tab", () => {
    // The default tab variable should fall back to "sessions"
    expect(src).toMatch(/\|\|\s*["']sessions["']/);
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
