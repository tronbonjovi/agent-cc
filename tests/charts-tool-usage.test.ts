// tests/charts-tool-usage.test.ts
// Source-text tests for the Tool Usage chart section shipped in
// charts-enrichment task005: ToolFrequency, ToolErrorRate,
// ToolDurationDistribution, ToolUsageOverTime, the shared tool color
// palette, and the ToolUsageSection wrapper.
//
// Tests follow the same source-text style used elsewhere in this repo
// (vitest with no jsdom). They verify the structural contracts the
// later wiring task will plug into ChartsTab.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const TOOL_USAGE_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/tool-usage",
);
const TOOL_FREQ_PATH = path.join(TOOL_USAGE_DIR, "ToolFrequency.tsx");
const TOOL_ERROR_PATH = path.join(TOOL_USAGE_DIR, "ToolErrorRate.tsx");
const TOOL_DURATION_PATH = path.join(TOOL_USAGE_DIR, "ToolDurationDistribution.tsx");
const TOOL_OVERTIME_PATH = path.join(TOOL_USAGE_DIR, "ToolUsageOverTime.tsx");
const TOOL_COLORS_PATH = path.join(TOOL_USAGE_DIR, "tool-colors.ts");
const TOOL_SECTION_PATH = path.join(TOOL_USAGE_DIR, "ToolUsageSection.tsx");

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

const ALL_FILES = [
  TOOL_FREQ_PATH,
  TOOL_ERROR_PATH,
  TOOL_DURATION_PATH,
  TOOL_OVERTIME_PATH,
  TOOL_COLORS_PATH,
  TOOL_SECTION_PATH,
];

describe("tool-usage/ files exist", () => {
  for (const f of ALL_FILES) {
    it(`${path.basename(f)} exists`, () => {
      expect(fs.existsSync(f)).toBe(true);
    });
  }
});

describe("tool-colors.ts", () => {
  const src = read(TOOL_COLORS_PATH);

  it("exports a toolColors map", () => {
    expect(src).toMatch(/export\s+(const|function)\s+toolColors/);
  });

  it("includes the common Claude Code tools", () => {
    expect(src).toMatch(/Read/);
    expect(src).toMatch(/Edit/);
    expect(src).toMatch(/Write/);
    expect(src).toMatch(/Bash/);
    expect(src).toMatch(/Grep/);
    expect(src).toMatch(/Glob/);
    expect(src).toMatch(/Agent/);
  });

  it("provides a fallback color for unknown tools", () => {
    expect(src).toMatch(/fallback|default|unknown/i);
  });

  it("exports a getToolColor helper that returns the fallback for unknown names", () => {
    expect(src).toMatch(/export\s+function\s+getToolColor/);
  });

  it("uses solid hex colors (no gradients)", () => {
    expect(src).toMatch(/#[0-9a-fA-F]{6}/);
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });
});

describe("ToolFrequency.tsx", () => {
  const src = read(TOOL_FREQ_PATH);

  it("exports a ToolFrequency component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ToolFrequency/);
  });

  it("imports useChartFilters from ../GlobalFilterBar", () => {
    expect(src).toMatch(/from\s+["']\.\.\/GlobalFilterBar["']/);
    expect(src).toMatch(/useChartFilters/);
  });

  it("imports the shared toolColors palette", () => {
    expect(src).toMatch(/from\s+["']\.\/tool-colors["']/);
  });

  it("fetches /api/charts/tools", () => {
    expect(src).toMatch(/\/api\/charts\/tools/);
  });

  it("threads breakdown=… into the fetch URL", () => {
    expect(src).toMatch(/breakdown=/);
  });

  it("accepts a breakdown prop defaulted to 'all'", () => {
    expect(src).toMatch(/breakdown\??:\s*["']all["']\s*\|\s*["']parent["']/);
    expect(src).toMatch(/=\s*["']all["']/);
  });

  it("uses recharts BarChart (horizontal layout)", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart/);
    // horizontal bars use layout="vertical"
    expect(src).toMatch(/layout=["']vertical["']/);
  });

  it("renders an empty state when there is no data", () => {
    expect(src).toMatch(/No data/i);
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

describe("ToolErrorRate.tsx", () => {
  const src = read(TOOL_ERROR_PATH);

  it("exports a ToolErrorRate component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ToolErrorRate/);
  });

  it("imports useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });

  it("fetches /api/charts/tools", () => {
    expect(src).toMatch(/\/api\/charts\/tools/);
  });

  it("threads breakdown=… into the fetch URL", () => {
    expect(src).toMatch(/breakdown=/);
  });

  it("accepts a breakdown prop defaulted to 'all'", () => {
    expect(src).toMatch(/breakdown\??:\s*["']all["']\s*\|\s*["']parent["']/);
    expect(src).toMatch(/=\s*["']all["']/);
  });

  it("uses recharts BarChart (grouped success vs failure)", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart/);
    // Two Bar elements: success + failure
    const barMatches = src.match(/<Bar\b/g) || [];
    expect(barMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("uses green for success and red for failure", () => {
    // Solid hex constants — green-ish and red-ish.
    expect(src).toMatch(/#22c55e|#16a34a|#10b981|#15803d/);
    expect(src).toMatch(/#ef4444|#dc2626|#f43f5e|#b91c1c/);
  });

  it("renders an empty state when there is no data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  it("does not use bounce animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

describe("ToolDurationDistribution.tsx", () => {
  const src = read(TOOL_DURATION_PATH);

  it("exports a ToolDurationDistribution component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ToolDurationDistribution/);
  });

  it("accepts a breakdown prop defaulted to 'all'", () => {
    expect(src).toMatch(/breakdown\??:\s*["']all["']\s*\|\s*["']parent["']/);
    expect(src).toMatch(/=\s*["']all["']/);
  });

  it("renders the 'duration data not yet available' empty state", () => {
    expect(src).toMatch(/Duration data not yet available/i);
  });

  it("includes a TODO comment about the missing backend duration field", () => {
    expect(src).toMatch(/TODO/);
    expect(src).toMatch(/duration/i);
  });

  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  it("does not use bounce animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

describe("ToolUsageOverTime.tsx", () => {
  const src = read(TOOL_OVERTIME_PATH);

  it("exports a ToolUsageOverTime component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ToolUsageOverTime/);
  });

  it("imports useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });

  it("imports the shared toolColors palette", () => {
    expect(src).toMatch(/from\s+["']\.\/tool-colors["']/);
  });

  it("fetches /api/charts/tools", () => {
    expect(src).toMatch(/\/api\/charts\/tools/);
  });

  it("threads breakdown=… into the fetch URL", () => {
    expect(src).toMatch(/breakdown=/);
  });

  it("accepts a breakdown prop defaulted to 'all'", () => {
    expect(src).toMatch(/breakdown\??:\s*["']all["']\s*\|\s*["']parent["']/);
    expect(src).toMatch(/=\s*["']all["']/);
  });

  it("uses recharts AreaChart with stacked areas", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/AreaChart/);
    expect(src).toMatch(/stackId/);
  });

  it("renders an empty state when there is no data", () => {
    expect(src).toMatch(/No data/i);
  });

  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  it("does not use bounce animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

describe("ToolUsageSection.tsx", () => {
  const src = read(TOOL_SECTION_PATH);

  it("exports a ToolUsageSection component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ToolUsageSection/);
  });

  it("renders all four tool charts", () => {
    expect(src).toMatch(/ToolFrequency/);
    expect(src).toMatch(/ToolErrorRate/);
    expect(src).toMatch(/ToolDurationDistribution/);
    expect(src).toMatch(/ToolUsageOverTime/);
  });

  it("wraps each chart in a ChartCard", () => {
    expect(src).toMatch(/ChartCard/);
    const cardMatches = src.match(/<ChartCard\b/g) || [];
    expect(cardMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("imports ChartCard from the parent charts dir", () => {
    expect(src).toMatch(/from\s+["']\.\.\/ChartCard["']/);
  });

  it("uses the responsive grid layout", () => {
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
  });

  it("does not use gradient styling", () => {
    expect(src).not.toMatch(/gradient/i);
    expect(src).not.toMatch(/linearGradient/);
  });

  it("does not use bounce animations", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});
