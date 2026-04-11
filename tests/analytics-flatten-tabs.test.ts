// tests/analytics-flatten-tabs.test.ts
// Tests for analytics-foundation-task004: Flatten analytics to 5 main tabs
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");
const MESSAGES_PATH = path.resolve(__dirname, "../client/src/pages/message-history.tsx");

describe("analytics flatten — 5 main tabs", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("has exactly 5 TabsTriggers: nerve-center, costs, charts, sessions, messages", () => {
    expect(src).toMatch(/TabsTrigger.*value="nerve-center"/);
    expect(src).toMatch(/TabsTrigger.*value="costs"/);
    expect(src).toMatch(/TabsTrigger.*value="charts"/);
    expect(src).toMatch(/TabsTrigger.*value="sessions"/);
    expect(src).toMatch(/TabsTrigger.*value="messages"/);
  });

  it("has exactly 5 TabsContent sections matching the triggers", () => {
    expect(src).toMatch(/TabsContent.*value="nerve-center"/);
    expect(src).toMatch(/TabsContent.*value="costs"/);
    expect(src).toMatch(/TabsContent.*value="charts"/);
    expect(src).toMatch(/TabsContent.*value="sessions"/);
    expect(src).toMatch(/TabsContent.*value="messages"/);
  });

  it("does NOT have old activity tab (merged into nerve center)", () => {
    expect(src).not.toMatch(/TabsTrigger.*value="activity"/);
    expect(src).not.toMatch(/TabsContent.*value="activity"/);
  });

  it("defaults to nerve-center tab", () => {
    expect(src).toMatch(/\|\|\s*["']nerve-center["']/);
  });

  it("subtitle reflects new 5-tab structure", () => {
    expect(src).toMatch(/[Nn]erve [Cc]enter.*costs.*charts.*sessions.*messages|analytics/i);
  });
});

describe("analytics flatten — no subtab infrastructure", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does NOT have NERVE_SUBTABS const", () => {
    expect(src).not.toMatch(/NERVE_SUBTABS/);
  });

  it("does NOT have NerveSubTabId type", () => {
    expect(src).not.toMatch(/NerveSubTabId/);
  });

  it("does NOT have nerveSubTab state", () => {
    expect(src).not.toMatch(/nerveSubTab/);
  });

  it("does NOT have NerveCenterWithSubtabs component", () => {
    expect(src).not.toMatch(/NerveCenterWithSubtabs/);
  });

  it("does NOT have secondary tab bar UI for subtabs", () => {
    // The old subtab buttons: Overview, File Heatmap, Session Health as clickable tabs
    expect(src).not.toMatch(/tab\.id.*tab\.label|setNerveSubTab/);
  });
});

describe("analytics flatten — Nerve Center topology visualization", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("renders TopologyLayout (replaced stacked panels)", () => {
    expect(src).toMatch(/<TopologyLayout/);
  });

  it("renders ScannerBrain as central brain node", () => {
    expect(src).toMatch(/<ScannerBrain/);
  });

  it("renders all 5 organ modules: CostNerves, SessionVitals, FileSensors, ActivityReflexes, ServiceSynapses", () => {
    expect(src).toMatch(/<CostNerves/);
    expect(src).toMatch(/<SessionVitals/);
    expect(src).toMatch(/<FileSensors/);
    expect(src).toMatch(/<ActivityReflexes/);
    expect(src).toMatch(/<ServiceSynapses/);
  });

  it("imports topology components from nerve-center barrel", () => {
    expect(src).toMatch(/TopologyLayout/);
    expect(src).toMatch(/ScannerBrain/);
    expect(src).toMatch(/nerve-center/);
  });

  it("no longer uses old stacked panels (NerveCenterPanel, FileHeatmapPanel, SessionHealthPanel)", () => {
    expect(src).not.toMatch(/<NerveCenterPanel/);
    expect(src).not.toMatch(/<FileHeatmapPanel/);
    expect(src).not.toMatch(/<SessionHealthPanel/);
  });
});

describe("analytics flatten — Sessions tab", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("imports SessionsTab from sessions components", () => {
    expect(src).toMatch(/import.*SessionsTab.*from.*sessions/);
  });

  it("renders SessionsTab in sessions tab content", () => {
    expect(src).toMatch(/<SessionsTab/);
  });
});

describe("analytics flatten — Messages tab", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("imports MessagesPanel from message-history", () => {
    expect(src).toMatch(/import.*MessagesPanel.*from.*message-history/);
  });

  it("renders MessagesPanel in messages tab content", () => {
    expect(src).toMatch(/<MessagesPanel/);
  });
});

describe("analytics flatten — sessions.tsx still functional", () => {
  const src = fs.readFileSync(SESSIONS_PATH, "utf-8");

  it("still has a default export", () => {
    expect(src).toMatch(/export default function Sessions/);
  });

  it("exports SessionsPanel as named export", () => {
    expect(src).toMatch(/export function SessionsPanel/);
  });
});

describe("analytics flatten — message-history.tsx still functional", () => {
  const src = fs.readFileSync(MESSAGES_PATH, "utf-8");

  it("still has a default export", () => {
    expect(src).toMatch(/export default function MessageHistory/);
  });

  it("still exports MessagesPanel", () => {
    expect(src).toMatch(/export function MessagesPanel/);
  });
});
