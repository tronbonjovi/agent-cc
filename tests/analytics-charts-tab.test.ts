// tests/analytics-charts-tab.test.ts
// Tests for the Charts tab in Analytics — time-series visualizations
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CHARTS_TAB_PATH = path.resolve(__dirname, "../client/src/components/analytics/charts-tab.tsx");
const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");

describe("charts-tab.tsx exists and has correct structure", () => {
  const src = fs.readFileSync(CHARTS_TAB_PATH, "utf-8");

  it("file exists", () => {
    expect(fs.existsSync(CHARTS_TAB_PATH)).toBe(true);
  });

  it("exports ChartsTab component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ChartsTab/);
  });

  it("imports recharts components", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
  });

  // -- Cost over time chart --
  it("has a cost over time chart section", () => {
    expect(src).toMatch(/[Cc]ost\s+[Oo]ver\s+[Tt]ime/);
  });

  it("uses LineChart for cost over time", () => {
    expect(src).toMatch(/LineChart/);
  });

  // -- Session frequency chart --
  it("has a session frequency chart section", () => {
    expect(src).toMatch(/[Ss]ession\s+[Ff]requency/);
  });

  it("uses BarChart for session frequency", () => {
    expect(src).toMatch(/BarChart/);
  });

  // -- Token usage trends chart --
  it("has a token usage trends chart section", () => {
    expect(src).toMatch(/[Tt]oken\s+[Uu]sage/);
  });

  it("uses AreaChart for token usage", () => {
    expect(src).toMatch(/AreaChart/);
  });

  // -- Time range selector --
  it("has time range options: 7d, 30d, 90d, all", () => {
    expect(src).toMatch(/7d/);
    expect(src).toMatch(/30d/);
    expect(src).toMatch(/90d/);
    expect(src).toMatch(/[Aa]ll/);
  });

  // -- Empty state handling --
  it("handles empty data with a user-friendly message", () => {
    expect(src).toMatch(/[Nn]o\s+data\s+(for\s+this|available)/);
  });

  // -- No gradients --
  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  // -- Responsive design --
  it("uses ResponsiveContainer from recharts", () => {
    expect(src).toMatch(/ResponsiveContainer/);
  });

  // -- Data fetching --
  it("fetches cost data from the API", () => {
    expect(src).toMatch(/\/api\/(analytics\/costs|sessions\/analytics\/costs)/);
  });

  it("fetches stats/overview data for session frequency", () => {
    expect(src).toMatch(/\/api\/(stats\/overview|sessions\/analytics\/costs|sessions)/);
  });
});

describe("stats.tsx integrates ChartsTab", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("imports ChartsTab from analytics/charts-tab", () => {
    expect(src).toMatch(/import.*ChartsTab.*from.*analytics\/charts-tab/);
  });

  it("renders ChartsTab component in the charts tab content", () => {
    expect(src).toMatch(/<ChartsTab/);
  });

  it("no longer has the placeholder coming-soon message", () => {
    expect(src).not.toMatch(/Charts.*[Cc]oming soon/);
  });
});

describe("package.json includes recharts", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"));

  it("has recharts as a dependency", () => {
    expect(pkg.dependencies?.recharts || pkg.devDependencies?.recharts).toBeDefined();
  });
});
