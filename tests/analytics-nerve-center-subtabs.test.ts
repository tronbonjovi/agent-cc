// tests/analytics-nerve-center-subtabs.test.ts
// Updated: subtabs removed in task004, now tests stacked sections + relocated panels
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

describe("Nerve Center topology — stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does NOT have subtab infrastructure (NERVE_SUBTABS, NerveSubTabId, nerveSubTab)", () => {
    expect(src).not.toMatch(/NERVE_SUBTABS/);
    expect(src).not.toMatch(/NerveSubTabId/);
    expect(src).not.toMatch(/nerveSubTab/);
    expect(src).not.toMatch(/NerveCenterWithSubtabs/);
  });

  it("does not have Decisions or Workflows subtabs (removed/relocated)", () => {
    expect(src).not.toMatch(/["']decisions["']/);
    expect(src).not.toMatch(/["']workflows["']/);
  });

  it("renders TopologyLayout with brain + 5 organs (replaced stacked panels)", () => {
    expect(src).toMatch(/<TopologyLayout/);
    expect(src).toMatch(/<ScannerBrain/);
    expect(src).toMatch(/<CostNerves/);
    expect(src).toMatch(/<SessionVitals/);
    expect(src).toMatch(/<FileSensors/);
    expect(src).toMatch(/<ActivityReflexes/);
    expect(src).toMatch(/<ServiceSynapses/);
  });

  it("no longer renders old stacked panels (NerveCenterPanel, FileHeatmapPanel, SessionHealthPanel)", () => {
    expect(src).not.toMatch(/<NerveCenterPanel/);
    expect(src).not.toMatch(/<FileHeatmapPanel/);
    expect(src).not.toMatch(/<SessionHealthPanel/);
    expect(src).not.toMatch(/<WeeklyDigestPanel/);
  });

  it("imports topology components from nerve-center barrel", () => {
    expect(src).toMatch(/TopologyLayout/);
    expect(src).toMatch(/ScannerBrain/);
    expect(src).toMatch(/nerve-center/);
  });

  it("does not import DecisionLogPanel or WorkflowConfigPanel", () => {
    expect(src).not.toMatch(/DecisionLogPanel/);
    expect(src).not.toMatch(/WorkflowConfigPanel/);
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
