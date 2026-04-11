/**
 * Nerve Center — Cost Nerves Organ Module Tests
 *
 * Validates the CostNerves component:
 * - Renders with cost data (weekly spend, pacing indicator, trend text)
 * - State color logic: green (under average), amber (above), red (significantly over)
 * - Click navigates to ?tab=costs
 * - Graceful handling when cost data unavailable
 * - Exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-cost-nerves.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const COST_NERVES_PATH = path.join(NERVE_CENTER_DIR, "CostNerves.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("cost-nerves — file structure", () => {
  it("CostNerves.tsx exists", () => {
    expect(fs.existsSync(COST_NERVES_PATH)).toBe(true);
  });

  it("barrel export re-exports CostNerves", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*CostNerves/);
  });
});

// ---- Renders with cost data ----

describe("cost-nerves — renders with cost data", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("formats weekly spend as dollar amount", () => {
    // Should format currency display (e.g. "$XX.XX")
    expect(src).toMatch(/\$.*toFixed|formatCurrency|\$\{.*\.toFixed/);
  });

  it("shows pacing indicator (trend arrow)", () => {
    // Should use an up/down/stable arrow indicator for pacing
    expect(src).toMatch(/TrendingUp|TrendingDown|ArrowUp|ArrowDown|Minus|arrow/i);
  });

  it("shows trend direction text (above/below average)", () => {
    // Should display text like "X% above average" or "X% below average"
    expect(src).toMatch(/above.*average|below.*average/i);
  });

  it("shows highest-cost session flag when applicable", () => {
    // Should reference top session / highest cost session
    expect(src).toMatch(/topSession|highestCost|top.*cost|session.*cost/i);
  });

  it("consumes nerve center data via useNerveCenter hook", () => {
    expect(src).toMatch(/useNerveCenter/);
  });

  it("consumes cost summary data via fetch or hook", () => {
    // Should use either /api/analytics/costs or a React Query hook
    expect(src).toMatch(/api\/analytics\/costs|useQuery|useCostSummary/);
  });
});

// ---- State color logic ----

describe("cost-nerves — state color logic", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("defines green state for under-average spending", () => {
    // Should have green/emerald color for when spending is below average
    expect(src).toMatch(/green|emerald/i);
  });

  it("defines amber state for above-average spending", () => {
    // Should have amber/yellow color for when spending is above average
    expect(src).toMatch(/amber|yellow/i);
  });

  it("defines red state for significantly over-average spending", () => {
    // Should have red color for when spending is significantly above average
    expect(src).toMatch(/red|destructive/i);
  });

  it("has threshold logic comparing pacing percentage", () => {
    // Should compare pacing/percentage to determine state color
    expect(src).toMatch(/pacingPct|changePct|pacing.*100|threshold/i);
  });

  it("uses solid colors only (no gradients)", () => {
    expect(src).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });
});

// ---- Click navigation ----

describe("cost-nerves — click navigates to costs tab", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("imports useLocation from wouter", () => {
    expect(src).toMatch(/useLocation.*from.*wouter/);
  });

  it("navigates to costs tab on click", () => {
    // Should set location to ?tab=costs or /analytics?tab=costs
    expect(src).toMatch(/tab=costs/);
  });

  it("has a click handler on the card", () => {
    expect(src).toMatch(/onClick/);
  });

  it("uses cursor-pointer for clickable affordance", () => {
    expect(src).toMatch(/cursor-pointer/);
  });
});

// ---- Graceful handling when data unavailable ----

describe("cost-nerves — graceful when data unavailable", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("handles loading state", () => {
    // Should check for isLoading or show a loading state
    expect(src).toMatch(/isLoading|loading|Loading/);
  });

  it("handles missing/undefined data gracefully", () => {
    // Should have null checks or optional chaining on data
    expect(src).toMatch(/\?\.|!data|data\s*===\s*undefined|no.*data|fallback/i);
  });

  it("does not crash when nerve center data is null", () => {
    // Should use optional chaining or defaults for costPacing
    expect(src).toMatch(/costPacing\?|data\?\.costPacing|\?\./);
  });
});

// ---- onStateChange callback ----

describe("cost-nerves — onStateChange callback", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("accepts onStateChange prop", () => {
    expect(src).toMatch(/onStateChange/);
  });

  it("calls onStateChange with pathway state", () => {
    // Should call the callback with idle/active/alert based on cost state
    // Supports both direct call onStateChange() and optional chaining onStateChange?.()
    expect(src).toMatch(/onStateChange\?\.\(|onStateChange\(/);
  });
});

// ---- Export ----

describe("cost-nerves — export", () => {
  const src = fs.readFileSync(COST_NERVES_PATH, "utf-8");

  it("exports CostNerves component", () => {
    expect(src).toMatch(/export.*function CostNerves|export.*const CostNerves/);
  });
});

// ---- Safety checks ----

describe("cost-nerves — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(COST_NERVES_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients (solid colors only)", () => {
    const content = fs.readFileSync(COST_NERVES_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });

  it("no PII (phone numbers, emails)", () => {
    const content = fs.readFileSync(COST_NERVES_PATH, "utf-8");
    expect(content).not.toMatch(/\d{3}[-.]?\d{3}[-.]?\d{4}/);
    expect(content).not.toMatch(/\w+@\w+\.\w+/);
  });
});
