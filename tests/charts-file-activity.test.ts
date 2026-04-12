// tests/charts-file-activity.test.ts
//
// Source-text tests for the File & Codebase + Activity & Workflow chart
// components shipped in charts-enrichment task006. The repo's chart tests
// are file-text style (vitest with no jsdom): we assert files exist, key
// imports / hook calls are present, fetch URLs reference the right
// endpoints, and the no-gradient / no-bounce guardrails hold.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FA_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/charts/file-activity",
);

const FILE_HEATMAP = path.join(FA_DIR, "FileHeatmapExtended.tsx");
const FILE_CHURN = path.join(FA_DIR, "FileChurnRate.tsx");
const ACTIVITY_TIMELINE = path.join(FA_DIR, "ActivityTimeline.tsx");
const PROJECT_ACTIVITY = path.join(FA_DIR, "ProjectActivityComparison.tsx");
const SIDECHAIN_USAGE = path.join(FA_DIR, "SidechainUsage.tsx");
const FILE_SECTION = path.join(FA_DIR, "FileCodebaseSection.tsx");
const ACTIVITY_SECTION = path.join(FA_DIR, "ActivityWorkflowSection.tsx");

const ALL_CHART_FILES = [
  FILE_HEATMAP,
  FILE_CHURN,
  ACTIVITY_TIMELINE,
  PROJECT_ACTIVITY,
  SIDECHAIN_USAGE,
  FILE_SECTION,
  ACTIVITY_SECTION,
];

function read(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

describe("file-activity directory layout", () => {
  it("file-activity/ directory exists", () => {
    expect(fs.existsSync(FA_DIR)).toBe(true);
  });
  it.each(ALL_CHART_FILES.map(f => [path.basename(f), f]))(
    "%s exists",
    (_name, file) => {
      expect(fs.existsSync(file)).toBe(true);
    },
  );
});

describe("FileHeatmapExtended.tsx", () => {
  const src = read(FILE_HEATMAP);

  it("exports a FileHeatmapExtended component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+FileHeatmapExtended/);
  });
  it("imports recharts bar primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart|Bar/);
  });
  it("fetches /api/charts/files", () => {
    expect(src).toMatch(/\/api\/charts\/files/);
  });
  it("subscribes to global chart filters via useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
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

describe("FileChurnRate.tsx", () => {
  const src = read(FILE_CHURN);

  it("exports a FileChurnRate component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+FileChurnRate/);
  });
  it("imports recharts line primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/LineChart|Line/);
  });
  it("fetches /api/charts/files", () => {
    expect(src).toMatch(/\/api\/charts\/files/);
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

describe("ActivityTimeline.tsx", () => {
  const src = read(ACTIVITY_TIMELINE);

  it("exports an ActivityTimeline component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ActivityTimeline/);
  });
  it("imports recharts", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
  });
  it("fetches /api/charts/activity", () => {
    expect(src).toMatch(/\/api\/charts\/activity/);
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

describe("ProjectActivityComparison.tsx", () => {
  const src = read(PROJECT_ACTIVITY);

  it("exports a ProjectActivityComparison component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ProjectActivityComparison/);
  });
  it("imports recharts bar primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/BarChart|Bar/);
  });
  it("fetches /api/analytics/costs/value (tree-backed byProject)", () => {
    expect(src).toMatch(/\/api\/analytics\/costs\/value/);
  });
  it("does NOT fetch /api/charts/activity (would undercount subagent spend)", () => {
    expect(src).not.toMatch(/\/api\/charts\/activity/);
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

describe("SidechainUsage.tsx", () => {
  const src = read(SIDECHAIN_USAGE);

  it("exports a SidechainUsage component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+SidechainUsage/);
  });
  it("imports recharts line/composed primitives", () => {
    expect(src).toMatch(/from\s+["']recharts["']/);
    expect(src).toMatch(/LineChart|Line|ComposedChart/);
  });
  it("fetches /api/charts/activity", () => {
    expect(src).toMatch(/\/api\/charts\/activity/);
  });
  it("uses useChartFilters", () => {
    expect(src).toMatch(/useChartFilters/);
  });
  it("declares dual Y axes for absolute count and percentage", () => {
    // YAxis appears at least twice for the dual-axis layout
    const yAxisMatches = src.match(/YAxis/g) || [];
    expect(yAxisMatches.length).toBeGreaterThanOrEqual(2);
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

describe("FileCodebaseSection.tsx", () => {
  const src = read(FILE_SECTION);

  it("exports a FileCodebaseSection component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+FileCodebaseSection/);
  });
  it("imports both file/codebase charts", () => {
    expect(src).toMatch(/FileHeatmapExtended/);
    expect(src).toMatch(/FileChurnRate/);
  });
  it("renders ChartCard wrappers around each chart", () => {
    expect(src).toMatch(/<ChartCard/);
  });
  it("uses the responsive grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3", () => {
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
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

describe("ActivityWorkflowSection.tsx", () => {
  const src = read(ACTIVITY_SECTION);

  it("exports an ActivityWorkflowSection component", () => {
    expect(src).toMatch(/export\s+(default\s+)?function\s+ActivityWorkflowSection/);
  });
  it("imports all three activity/workflow charts", () => {
    expect(src).toMatch(/ActivityTimeline/);
    expect(src).toMatch(/ProjectActivityComparison/);
    expect(src).toMatch(/SidechainUsage/);
  });
  it("renders ChartCard wrappers around each chart", () => {
    expect(src).toMatch(/<ChartCard/);
  });
  it("uses the responsive grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3", () => {
    expect(src).toMatch(/grid-cols-1/);
    expect(src).toMatch(/md:grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-3/);
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
