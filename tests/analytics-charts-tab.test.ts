// tests/analytics-charts-tab.test.ts
//
// The legacy `client/src/components/analytics/charts-tab.tsx` placeholder
// (which rendered three hard-coded recharts panels) was replaced in the
// charts-enrichment milestone by the structured Charts tab shell:
//
//   client/src/components/analytics/charts/{ChartsTab,ChartCard,GlobalFilterBar}.tsx
//
// Detailed assertions for the new shell live in
// `tests/charts-infrastructure.test.ts`. This file remains as a thin guard
// that the legacy module is gone and stats.tsx points at the new location.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LEGACY_CHARTS_TAB = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts-tab.tsx",
);
const NEW_CHARTS_TAB = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/ChartsTab.tsx",
);
const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");

describe("legacy charts-tab.tsx placeholder is removed", () => {
  it("legacy file no longer exists", () => {
    expect(fs.existsSync(LEGACY_CHARTS_TAB)).toBe(false);
  });

  it("new ChartsTab shell exists at the structured path", () => {
    expect(fs.existsSync(NEW_CHARTS_TAB)).toBe(true);
  });
});

describe("stats.tsx integrates the new ChartsTab", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("imports ChartsTab from analytics/charts/ChartsTab", () => {
    expect(src).toMatch(
      /import.*ChartsTab.*from\s+["']@\/components\/analytics\/charts\/ChartsTab["']/,
    );
  });

  it("renders <ChartsTab /> inside the charts tab content", () => {
    expect(src).toMatch(/<ChartsTab\s*\/>/);
  });

  it("does not still import the legacy placeholder", () => {
    expect(src).not.toMatch(/analytics\/charts-tab["']/);
  });
});

describe("package.json includes recharts (still required for tasks 003-007)", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"),
  );

  it("has recharts as a dependency", () => {
    expect(pkg.dependencies?.recharts || pkg.devDependencies?.recharts).toBeDefined();
  });
});
