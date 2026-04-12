// tests/charts-token-economics.test.ts
//
// Source-text tests for the Token Economics chart components shipped in
// charts-enrichment task003. The repo's chart tests are file-text style
// (vitest with no jsdom): we assert files exist, key imports / hook calls
// are present, fetch URLs reference the right endpoints, the section-level
// breakdown toggle plumbs through, and the no-gradient / no-bounce
// guardrails hold.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const TE_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/token-economics",
);
const TOKEN_USAGE = path.join(TE_DIR, "TokenUsageOverTime.tsx");
const CACHE_EFF = path.join(TE_DIR, "CacheEfficiencyOverTime.tsx");
const DEST_BREAKDOWN = path.join(TE_DIR, "TokenDestinationBreakdown.tsx");
const MODEL_DIST = path.join(TE_DIR, "ModelDistribution.tsx");
const API_EQUIV = path.join(TE_DIR, "APIEquivalentValue.tsx");
const SECTION = path.join(TE_DIR, "TokenEconomicsSection.tsx");

const ALL_CHART_FILES = [
  TOKEN_USAGE,
  CACHE_EFF,
  DEST_BREAKDOWN,
  MODEL_DIST,
  API_EQUIV,
  SECTION,
];

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

describe("token-economics directory layout", () => {
  it("token-economics/ directory exists", () => {
    expect(fs.existsSync(TE_DIR)).toBe(true);
  });
  it.each(ALL_CHART_FILES.map(f => [path.basename(f), f]))(
    "%s exists",
    (_name, file) => {
      expect(fs.existsSync(file)).toBe(true);
    },
  );
  // SubagentCostBreakdown.tsx lives in this directory but is owned by
  // task007 — task003 must not import or test against it directly.
});

describe("TokenUsageOverTime.tsx", () => {
  const src = read(TOKEN_USAGE);

  it("exports a TokenUsageOverTime component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+TokenUsageOverTime/);
  });
  it("imports recharts line/area primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    // At least one of LineChart or AreaChart must be imported
    expect(src).toMatch(/LineChart|AreaChart/);
  });
  it("fetches /api/charts/tokens-over-time", () => {
    expect(src).toMatch(/\/api\/charts\/tokens-over-time/);
  });
  it("subscribes to global chart filters via useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("forwards section breakdown toggle as ?breakdown= param", () => {
    expect(src).toMatch(/breakdown=/);
  });
  it("uses no gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });
  it("uses no bounce or active:scale animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
  it("handles empty data gracefully", () => {
    expect(src).toMatch(/No data|no data/);
  });
});

describe("CacheEfficiencyOverTime.tsx", () => {
  const src = read(CACHE_EFF);

  it("exports a CacheEfficiencyOverTime component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+CacheEfficiencyOverTime/);
  });
  it("imports recharts", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
  });
  it("fetches /api/charts/cache-over-time", () => {
    expect(src).toMatch(/\/api\/charts\/cache-over-time/);
  });
  it("uses useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("forwards breakdown param", () => {
    expect(src).toMatch(/breakdown=/);
  });
  it("uses no gradients or bounce", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
  it("handles empty data", () => {
    expect(src).toMatch(/No data|no data/);
  });
});

describe("TokenDestinationBreakdown.tsx", () => {
  const src = read(DEST_BREAKDOWN);

  it("exports a TokenDestinationBreakdown component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+TokenDestinationBreakdown/);
  });
  it("imports recharts pie primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/PieChart|Pie/);
  });
  it("fetches /api/analytics/costs/anatomy", () => {
    expect(src).toMatch(/\/api\/analytics\/costs\/anatomy/);
  });
  it("uses useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("uses no gradients or bounce", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
  it("handles empty data", () => {
    expect(src).toMatch(/No data|no data/);
  });
});

describe("ModelDistribution.tsx", () => {
  const src = read(MODEL_DIST);

  it("exports a ModelDistribution component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ModelDistribution/);
  });
  it("imports recharts bar primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart|Bar/);
  });
  it("fetches /api/charts/models", () => {
    expect(src).toMatch(/\/api\/charts\/models/);
  });
  it("uses useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("forwards breakdown param", () => {
    expect(src).toMatch(/breakdown=/);
  });
  it("uses no gradients or bounce", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
  it("handles empty data", () => {
    expect(src).toMatch(/No data|no data/);
  });
});

describe("APIEquivalentValue.tsx", () => {
  const src = read(API_EQUIV);

  it("exports an APIEquivalentValue component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+APIEquivalentValue/);
  });
  it("imports recharts bar primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart|Bar/);
  });
  it("fetches /api/charts/models (derives API value from it)", () => {
    expect(src).toMatch(/\/api\/charts\/models/);
  });
  it("uses useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("forwards breakdown param", () => {
    expect(src).toMatch(/breakdown=/);
  });
  it("contains a pricing constant for cost math", () => {
    // input/output rate references must exist somewhere
    expect(src).toMatch(/input/);
    expect(src).toMatch(/output/);
  });
  it("uses no gradients or bounce", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
  it("handles empty data", () => {
    expect(src).toMatch(/No data|no data/);
  });
});

describe("TokenEconomicsSection.tsx", () => {
  const src = read(SECTION);

  it("exports a TokenEconomicsSection component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+TokenEconomicsSection/);
  });
  it("imports all 5 token-economics charts", () => {
    expect(src).toMatch(/TokenUsageOverTime/);
    expect(src).toMatch(/CacheEfficiencyOverTime/);
    expect(src).toMatch(/TokenDestinationBreakdown/);
    expect(src).toMatch(/ModelDistribution/);
    expect(src).toMatch(/APIEquivalentValue/);
  });
  it("renders ChartCard wrappers around each chart", () => {
    expect(src).toMatch(/<ChartCard/);
  });
  it("uses the responsive grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3", () => {
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
  });
  it("provides a Parent only / Include subagents toggle", () => {
    // Either the literal label or the breakdown state name
    expect(src).toMatch(/Parent only|Include subagents|breakdown/);
  });
  it("imports SubagentCostBreakdown as the 6th card (task007 wiring)", () => {
    expect(src).toMatch(/SubagentCostBreakdown/);
  });
  it("does not import from ChartsTab.tsx", () => {
    expect(src).not.toMatch(/from\s+["']\.\.\/ChartsTab["']/);
    expect(src).not.toMatch(/ChartsTab/);
  });
  it("uses no gradients or bounce", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});
