// tests/subagent-cost-breakdown.test.ts
//
// Source-text tests for the SubagentCostBreakdown chart shipped in
// charts-enrichment task007. Mirrors the style of charts-infrastructure.test.ts
// — no jsdom, no React render — just structural assertions on the source
// file so the wiring contract for the upcoming ChartsTab integration pass
// is locked in.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const COMPONENT_PATH = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/token-economics/SubagentCostBreakdown.tsx",
);

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

describe("SubagentCostBreakdown.tsx", () => {
  it("file exists", () => {
    expect(fs.existsSync(COMPONENT_PATH)).toBe(true);
  });

  const src = read(COMPONENT_PATH);

  it("exports a SubagentCostBreakdown component", () => {
    expect(src).toMatch(/export\s+function\s+SubagentCostBreakdown/);
  });

  it("imports useChartFilters from the global filter bar", () => {
    expect(src).toMatch(/useChartFilters/);
    expect(src).toMatch(/from\s+["']\.\.\/GlobalFilterBar["']/);
  });

  it("wraps the chart in ChartCard with the spec title", () => {
    expect(src).toMatch(/ChartCard/);
    expect(src).toMatch(/Subagent Cost Distribution/);
  });

  it("imports the shared subagent palette", () => {
    expect(src).toMatch(/subagent-colors/);
    // Either PALETTE or colorClassForOwner needs to be referenced so the
    // colors line up with Sessions detail badges.
    expect(src).toMatch(/PALETTE|colorClassForOwner/);
  });

  it("fetches from /api/charts/subagent-costs", () => {
    expect(src).toMatch(/\/api\/charts\/subagent-costs/);
  });

  it("uses a Recharts vertical BarChart", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart/);
    expect(src).toMatch(/layout=["']vertical["']/);
  });

  it("renders the empty state copy when byAgentType is empty", () => {
    expect(src).toMatch(/No subagents dispatched in this time range/);
  });

  it("shows the delegation percentage headline label", () => {
    expect(src).toMatch(/of total spend went to subagents/);
  });

  it("references mostDelegationHeavy or topSessions for drill-in", () => {
    expect(src).toMatch(/topSessions|mostDelegationHeavy/);
  });

  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  it("does not use bounce or active:scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});
