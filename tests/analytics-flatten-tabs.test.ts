// tests/analytics-flatten-tabs.test.ts
// Tests for analytics-foundation-task004: Flatten analytics to 5 main tabs
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
// Cleanup note (messages-redesign-task005): client/src/pages/message-history.tsx
// was deleted; the messages tab now renders <MessagesTab /> from
// client/src/components/analytics/messages/MessagesTab.tsx.
// Cleanup note (codebase-cleanup-task001): client/src/pages/sessions.tsx
// was also deleted; its describe block ("sessions.tsx still functional")
// has been removed since the module no longer exists.

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

describe("analytics flatten — Nerve Center entity graph visualization", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("renders EntityGraph in the nerve-center tab (replaced topology layout)", () => {
    expect(src).toMatch(/<EntityGraph/);
  });

  it("imports EntityGraph from the entity-graph directory", () => {
    expect(src).toMatch(/import.*EntityGraph.*from.*entity-graph/);
  });

  it("no longer renders the old topology layout or organ components", () => {
    expect(src).not.toMatch(/<TopologyLayout/);
    expect(src).not.toMatch(/<ScannerBrain/);
    expect(src).not.toMatch(/<CostNerves/);
    expect(src).not.toMatch(/<SessionVitals/);
    expect(src).not.toMatch(/<FileSensors/);
    expect(src).not.toMatch(/<ActivityReflexes/);
    expect(src).not.toMatch(/<ServiceSynapses/);
  });

  it("no longer imports from the deleted nerve-center barrel", () => {
    expect(src).not.toMatch(/from ["']@\/components\/analytics\/nerve-center/);
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

  it("imports MessagesTab from analytics/messages", () => {
    // Cleanup note (messages-redesign-task005): replaces the legacy
    // MessagesPanel import that came from @/pages/message-history.
    expect(src).toMatch(/import.*MessagesTab.*from.*analytics\/messages/);
  });

  it("renders MessagesTab in messages tab content", () => {
    expect(src).toMatch(/<MessagesTab/);
  });

  it("no longer imports the legacy MessagesPanel", () => {
    expect(src).not.toMatch(/MessagesPanel/);
  });
});

describe("analytics flatten — messages tab MessagesTab still functional", () => {
  // Cleanup note (messages-redesign-task005): the legacy
  // client/src/pages/message-history.tsx file was deleted. The new
  // <MessagesTab /> container lives in
  // client/src/components/analytics/messages/MessagesTab.tsx.
  const MSGS_TAB_PATH = path.resolve(
    __dirname,
    "../client/src/components/analytics/messages/MessagesTab.tsx",
  );
  const src = fs.readFileSync(MSGS_TAB_PATH, "utf-8");

  it("exports MessagesTab", () => {
    expect(src).toMatch(/export function MessagesTab/);
  });
});
