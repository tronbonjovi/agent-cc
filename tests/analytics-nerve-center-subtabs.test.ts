// tests/analytics-nerve-center-subtabs.test.ts
// Tests for nesting subtabs under the Nerve Center main tab
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

describe("Nerve Center subtabs — stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has a secondary tab bar with 3 subtabs inside the nerve-center tab content", () => {
    expect(src).toMatch(/Overview/);
    expect(src).toMatch(/File Heatmap/);
    expect(src).toMatch(/Session Health/);
  });

  it("does not have Decisions or Workflows subtabs (removed/relocated)", () => {
    expect(src).not.toMatch(/["']decisions["']/);
    expect(src).not.toMatch(/["']workflows["']/);
  });

  it("defaults the subtab to overview", () => {
    expect(src).toMatch(/useState.*["']overview["']/);
  });

  it("renders NerveCenterPanel in the overview subtab", () => {
    expect(src).toMatch(/<NerveCenterPanel/);
  });

  it("renders WeeklyDigestPanel in the overview subtab as collapsible", () => {
    expect(src).toMatch(/<WeeklyDigestPanel/);
    expect(src).toMatch(/Weekly Digest/);
  });

  it("imports individual panel components from session-analytics-panel", () => {
    expect(src).toMatch(/import.*FileHeatmapPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*SessionHealthPanel.*from.*session-analytics-panel/);
    expect(src).toMatch(/import.*WeeklyDigestPanel.*from.*session-analytics-panel/);
  });

  it("does not import DecisionLogPanel or WorkflowConfigPanel", () => {
    expect(src).not.toMatch(/DecisionLogPanel/);
    expect(src).not.toMatch(/WorkflowConfigPanel/);
  });

  it("renders FileHeatmapPanel in the files subtab", () => {
    expect(src).toMatch(/nerveSubTab === "files".*&&.*<FileHeatmapPanel|nerveSubTab === "files"[\s\S]*?FileHeatmapPanel/);
  });

  it("renders SessionHealthPanel in the health subtab", () => {
    expect(src).toMatch(/nerveSubTab === "health".*&&.*<SessionHealthPanel|nerveSubTab === "health"[\s\S]*?SessionHealthPanel/);
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

  it("does not export DecisionLogPanel (removed)", () => {
    expect(src).not.toMatch(/export\s+function\s+DecisionLogPanel/);
  });

  it("exports WorkflowConfigPanel", () => {
    expect(src).toMatch(/export\s+function\s+WorkflowConfigPanel/);
  });

  it("exports WeeklyDigestPanel", () => {
    expect(src).toMatch(/export\s+function\s+WeeklyDigestPanel/);
  });

  it("removes subtabs that moved to Nerve Center from ANALYTICS_TABS", () => {
    expect(src).not.toMatch(/id:\s*["']files["']/);
    expect(src).not.toMatch(/id:\s*["']health["']/);
    expect(src).not.toMatch(/id:\s*["']decisions["']/);
    expect(src).not.toMatch(/id:\s*["']workflows["']/);
    expect(src).not.toMatch(/id:\s*["']digest["']/);
  });
});

describe("Settings page — Workflows tab", () => {
  const settingsSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/settings.tsx"),
    "utf-8"
  );

  it("imports WorkflowConfigPanel", () => {
    expect(settingsSrc).toMatch(/import.*WorkflowConfigPanel.*from.*session-analytics-panel/);
  });

  it("has a Workflows tab trigger", () => {
    expect(settingsSrc).toMatch(/value="workflows"/);
  });

  it("renders WorkflowConfigPanel in the workflows tab content", () => {
    expect(settingsSrc).toMatch(/<WorkflowConfigPanel/);
  });
});

describe("Messages page — no prompts panel in layout", () => {
  const msgSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/message-history.tsx"),
    "utf-8"
  );

  it("does not have split layout with prompts panel", () => {
    expect(msgSrc).not.toMatch(/grid-cols-5/);
  });

  it("renders MessagesPanel full-width", () => {
    expect(msgSrc).toMatch(/<MessagesPanel/);
  });
});

describe("Library page — prompts tab uses PromptsPanel", () => {
  const libSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/library.tsx"),
    "utf-8"
  );

  it("imports PromptsPanel from message-history", () => {
    expect(libSrc).toMatch(/import.*PromptsPanel.*from.*message-history/);
  });

  it("renders PromptsPanel for the prompts tab", () => {
    expect(libSrc).toMatch(/activeTab === "prompts".*&&.*<PromptsPanel/);
  });

  it("does not import PromptLibraryPanel from session-analytics-panel", () => {
    expect(libSrc).not.toMatch(/PromptLibraryPanel/);
  });
});
