// tests/charts-infrastructure.test.ts
// Source-text tests for the Charts tab infrastructure shipped in
// charts-enrichment task001: GlobalFilterBar (with ChartFiltersProvider /
// useChartFilters hook), ChartCard wrapper, and ChartsTab section layout.
//
// Tests follow the same source-text style used elsewhere in this repo
// (vitest with no jsdom). They verify the structural contracts that
// downstream tasks 003-007 will depend on.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CHARTS_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts",
);
const FILTER_BAR_PATH = path.join(CHARTS_DIR, "GlobalFilterBar.tsx");
const CHART_CARD_PATH = path.join(CHARTS_DIR, "ChartCard.tsx");
const CHARTS_TAB_PATH = path.join(CHARTS_DIR, "ChartsTab.tsx");
const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

describe("charts/ infrastructure files exist", () => {
  it("GlobalFilterBar.tsx exists", () => {
    expect(fs.existsSync(FILTER_BAR_PATH)).toBe(true);
  });
  it("ChartCard.tsx exists", () => {
    expect(fs.existsSync(CHART_CARD_PATH)).toBe(true);
  });
  it("ChartsTab.tsx exists", () => {
    expect(fs.existsSync(CHARTS_TAB_PATH)).toBe(true);
  });
});

describe("GlobalFilterBar.tsx", () => {
  const src = read(FILTER_BAR_PATH);

  it("exports a GlobalFilterBar component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+GlobalFilterBar/);
  });

  it("exports a ChartFiltersProvider context provider", () => {
    expect(src).toMatch(/export\s+function\s+ChartFiltersProvider/);
  });

  it("exports a useChartFilters hook", () => {
    expect(src).toMatch(/export\s+function\s+useChartFilters/);
  });

  it("provides time range options 7d, 30d, 90d, all", () => {
    expect(src).toMatch(/["']7d["']/);
    expect(src).toMatch(/["']30d["']/);
    expect(src).toMatch(/["']90d["']/);
    expect(src).toMatch(/["']all["']/);
  });

  it("accepts availableProjects and availableModels props", () => {
    expect(src).toMatch(/availableProjects/);
    expect(src).toMatch(/availableModels/);
  });

  it("syncs filter state to URL params (range)", () => {
    expect(src).toMatch(/URLSearchParams/);
    expect(src).toMatch(/["']range["']/);
  });

  it("syncs project filter to URL params", () => {
    expect(src).toMatch(/["']projects["']/);
  });

  it("syncs model filter to URL params", () => {
    expect(src).toMatch(/["']models["']/);
  });

  it("uses history.replaceState to update URL without navigation", () => {
    expect(src).toMatch(/history\.replaceState/);
  });

  it("provides a custom date picker / range option", () => {
    // Either a "custom" range value or a date input field
    expect(src).toMatch(/custom|type=["']date["']/);
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

describe("ChartCard.tsx", () => {
  const src = read(CHART_CARD_PATH);

  it("exports a ChartCard component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ChartCard/);
  });

  it("accepts title, children, controls, and loading props", () => {
    expect(src).toMatch(/title/);
    expect(src).toMatch(/children/);
    expect(src).toMatch(/controls/);
    expect(src).toMatch(/loading/);
  });

  it("renders a loading skeleton when loading is true", () => {
    expect(src).toMatch(/loading/);
    // skeleton placeholder uses muted background blocks
    expect(src).toMatch(/skeleton|animate-pulse|bg-muted/);
  });

  it("provides an expand-to-fullwidth button", () => {
    // expand state, Maximize/Expand icon, or aria-label
    expect(src).toMatch(/expand|Maximize|Expand/i);
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

describe("ChartsTab.tsx", () => {
  const src = read(CHARTS_TAB_PATH);

  it("exports a ChartsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ChartsTab/);
  });

  it("wraps content in ChartFiltersProvider", () => {
    expect(src).toMatch(/ChartFiltersProvider/);
  });

  it("renders the GlobalFilterBar", () => {
    expect(src).toMatch(/<GlobalFilterBar/);
  });

  it("renders all five section headers", () => {
    expect(src).toMatch(/Token Economics/);
    expect(src).toMatch(/Session Patterns/);
    expect(src).toMatch(/Tool Usage/);
    expect(src).toMatch(/File & Codebase/);
    expect(src).toMatch(/Activity & Workflow/);
  });

  it("uses ChartCard for placeholder content", () => {
    expect(src).toMatch(/<ChartCard/);
  });

  it("uses a responsive grid for chart cards", () => {
    // Tailwind responsive grid classes (md:grid-cols-2 lg:grid-cols-3)
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
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

describe("stats.tsx wires the new ChartsTab", () => {
  const src = read(STATS_PATH);

  it("imports ChartsTab from analytics/charts/ChartsTab", () => {
    expect(src).toMatch(
      /import.*ChartsTab.*from\s+["']@\/components\/analytics\/charts\/ChartsTab["']/,
    );
  });

  it("renders <ChartsTab /> inside the charts tab content", () => {
    expect(src).toMatch(/<ChartsTab\s*\/>/);
  });

  it("does not import the old placeholder charts-tab.tsx", () => {
    expect(src).not.toMatch(/from\s+["']@\/components\/analytics\/charts-tab["']/);
  });
});
