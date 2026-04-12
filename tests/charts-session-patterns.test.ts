// tests/charts-session-patterns.test.ts
//
// Source-text tests for charts-enrichment task004 (Session Patterns charts).
// Vitest runs without jsdom in this repo, so we verify the structural
// contracts each component must satisfy by inspecting source text:
//   - file existence
//   - exported component name
//   - imports ChartCard + useChartFilters
//   - hits the expected /api/charts/* endpoint
//   - has empty-state handling
//   - no gradients, no bounce/scale animations
//
// One section per chart, plus a section for the SessionPatternsSection
// wrapper that ChartsTab will eventually consume.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SP_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/session-patterns",
);

const FILES = {
  frequency: path.join(SP_DIR, "SessionFrequency.tsx"),
  depth: path.join(SP_DIR, "SessionDepthDistribution.tsx"),
  duration: path.join(SP_DIR, "SessionDurationDistribution.tsx"),
  health: path.join(SP_DIR, "SessionHealthOverTime.tsx"),
  stopReasons: path.join(SP_DIR, "StopReasonDistribution.tsx"),
  section: path.join(SP_DIR, "SessionPatternsSection.tsx"),
};

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

function assertNoGradient(src: string) {
  expect(src).not.toMatch(/gradient/i);
  expect(src).not.toMatch(/linearGradient/);
}

function assertNoBounce(src: string) {
  expect(src).not.toMatch(/animate-bounce/);
  expect(src).not.toMatch(/active:scale-/);
}

describe("session-patterns/ files exist", () => {
  for (const [name, p] of Object.entries(FILES)) {
    it(`${name} file exists`, () => {
      expect(fs.existsSync(p)).toBe(true);
    });
  }
});

describe("SessionFrequency.tsx", () => {
  const src = read(FILES.frequency);

  it("exports SessionFrequency component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SessionFrequency/);
  });

  it("imports ChartCard from parent charts directory", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
  });

  it("imports useChartFilters from GlobalFilterBar", () => {
    expect(src).toMatch(/useChartFilters/);
    expect(src).toMatch(/from\s+["']\.\.\/GlobalFilterBar["']/);
  });

  it("fetches from /api/charts/sessions", () => {
    expect(src).toMatch(/\/api\/charts\/sessions/);
  });

  it("uses BarChart from recharts", () => {
    expect(src).toMatch(/BarChart/);
    expect(src).toMatch(/from\s+["']recharts["']/);
  });

  it("renders three health series (good, fair, poor)", () => {
    expect(src).toMatch(/healthGood/);
    expect(src).toMatch(/healthFair/);
    expect(src).toMatch(/healthPoor/);
  });

  it("handles empty data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});

describe("SessionDepthDistribution.tsx", () => {
  const src = read(FILES.depth);

  it("exports SessionDepthDistribution component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SessionDepthDistribution/);
  });

  it("imports ChartCard and useChartFilters", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
    expect(src).toMatch(/useChartFilters/);
  });

  it("fetches from /api/charts/session-distributions", () => {
    expect(src).toMatch(/\/api\/charts\/session-distributions/);
  });

  it("uses a horizontal BarChart layout", () => {
    expect(src).toMatch(/BarChart/);
    // Recharts horizontal layout
    expect(src).toMatch(/layout=["']vertical["']/);
  });

  it("labels axis as tree-inclusive assistant turns", () => {
    expect(src).toMatch(/Assistant turns \(includes subagent turns\)/);
  });

  it("renders median and/or mean reference lines", () => {
    expect(src).toMatch(/ReferenceLine|median|mean/i);
  });

  it("notes the subagent subcount TODO", () => {
    // Backend doesn't expose subagent subcount yet — task004 must reference task007.
    expect(src).toMatch(/TODO.*task007|with subagents/);
  });

  it("handles empty data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});

describe("SessionDurationDistribution.tsx", () => {
  const src = read(FILES.duration);

  it("exports SessionDurationDistribution component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SessionDurationDistribution/);
  });

  it("imports ChartCard and useChartFilters", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
    expect(src).toMatch(/useChartFilters/);
  });

  it("fetches from /api/charts/session-distributions", () => {
    expect(src).toMatch(/\/api\/charts\/session-distributions/);
  });

  it("uses BarChart from recharts", () => {
    expect(src).toMatch(/BarChart/);
    expect(src).toMatch(/from\s+["']recharts["']/);
  });

  it("handles empty data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});

describe("SessionHealthOverTime.tsx", () => {
  const src = read(FILES.health);

  it("exports SessionHealthOverTime component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SessionHealthOverTime/);
  });

  it("imports ChartCard and useChartFilters", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
    expect(src).toMatch(/useChartFilters/);
  });

  it("fetches from /api/charts/sessions", () => {
    expect(src).toMatch(/\/api\/charts\/sessions/);
  });

  it("uses a stacked AreaChart from recharts", () => {
    expect(src).toMatch(/AreaChart/);
    expect(src).toMatch(/Area\b/);
    expect(src).toMatch(/stackId/);
    expect(src).toMatch(/from\s+["']recharts["']/);
  });

  it("renders three health series (good, fair, poor)", () => {
    expect(src).toMatch(/healthGood/);
    expect(src).toMatch(/healthFair/);
    expect(src).toMatch(/healthPoor/);
  });

  it("handles empty data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});

describe("StopReasonDistribution.tsx", () => {
  const src = read(FILES.stopReasons);

  it("exports StopReasonDistribution component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+StopReasonDistribution/);
  });

  it("imports ChartCard and useChartFilters", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
    expect(src).toMatch(/useChartFilters/);
  });

  it("fetches from /api/charts/stop-reasons", () => {
    expect(src).toMatch(/\/api\/charts\/stop-reasons/);
  });

  it("uses a horizontal BarChart layout", () => {
    expect(src).toMatch(/BarChart/);
    expect(src).toMatch(/layout=["']vertical["']/);
  });

  it("calls out max_tokens with a context pressure note", () => {
    expect(src).toMatch(/max_tokens/);
    expect(src).toMatch(/context/i);
  });

  it("handles empty data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});

describe("SessionPatternsSection.tsx", () => {
  const src = read(FILES.section);

  it("exports SessionPatternsSection component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SessionPatternsSection/);
  });

  it("renders all five session-pattern charts", () => {
    expect(src).toMatch(/<SessionFrequency\b/);
    expect(src).toMatch(/<SessionDepthDistribution\b/);
    expect(src).toMatch(/<SessionDurationDistribution\b/);
    expect(src).toMatch(/<SessionHealthOverTime\b/);
    expect(src).toMatch(/<StopReasonDistribution\b/);
  });

  it("uses the responsive 1/2/3 column grid", () => {
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
  });

  it("does not use gradient styling", () => assertNoGradient(src));
  it("does not use bounce or active:scale animations", () => assertNoBounce(src));
});
