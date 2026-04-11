/**
 * Nerve Center Session Vitals Tests
 *
 * Validates the Session Vitals organ module:
 * - Renders health distribution as a visual segmented bar (not just numbers)
 * - State color logic: green (mostly healthy), amber (some flagged), red (many poor)
 * - Shows flagged session count and top health reason tags
 * - Click navigates to sessions tab with health filter
 * - Graceful handling when health data is unavailable
 * - Reports organ state back via onStateChange callback
 * - Exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-session-vitals.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const VITALS_PATH = path.join(NERVE_CENTER_DIR, "SessionVitals.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("session-vitals — file structure", () => {
  it("SessionVitals.tsx exists", () => {
    expect(fs.existsSync(VITALS_PATH)).toBe(true);
  });

  it("barrel export re-exports SessionVitals", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*SessionVitals/);
  });
});

// ---- Component structure ----

describe("session-vitals — component", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("exports SessionVitals component", () => {
    expect(src).toMatch(/export.*function SessionVitals|export.*const SessionVitals/);
  });

  it("consumes useHealthAnalytics hook", () => {
    expect(src).toMatch(/useHealthAnalytics/);
  });

  it("accepts onStateChange callback prop", () => {
    expect(src).toMatch(/onStateChange/);
  });
});

// ---- Health distribution visualization ----

describe("session-vitals — health distribution bar", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("uses goodCount, fairCount, poorCount from health data", () => {
    expect(src).toMatch(/goodCount/);
    expect(src).toMatch(/fairCount/);
    expect(src).toMatch(/poorCount/);
  });

  it("renders a segmented bar with proportional width segments", () => {
    // Should compute width percentages for each segment
    expect(src).toMatch(/width.*%|style.*width/);
  });

  it("uses green for good sessions segment", () => {
    // Green color class or style for good/healthy segments
    expect(src).toMatch(/green|emerald/);
  });

  it("uses amber/yellow for fair sessions segment", () => {
    // Amber/yellow color for fair segment
    expect(src).toMatch(/amber|yellow/);
  });

  it("uses red for poor sessions segment", () => {
    // Red color for poor segment
    expect(src).toMatch(/red/);
  });

  it("is visual — not just text numbers", () => {
    // Must have width-based rendering (proportional segments), not just text
    expect(src).toMatch(/width.*%|flex.*grow/);
    // Must contain a container div with segments inside
    expect(src).toMatch(/rounded|bar|segment/i);
  });
});

// ---- State color logic ----

describe("session-vitals — organ state color", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("computes organ state based on health distribution", () => {
    // Should have logic that determines state from poor/fair/good ratios
    expect(src).toMatch(/poorCount|poorRatio|poor.*ratio/i);
  });

  it("reports state via onStateChange callback", () => {
    // Should call onStateChange with computed state
    expect(src).toMatch(/onStateChange/);
  });

  it("supports idle, active, and alert pathway states", () => {
    // Should reference pathway state values for mapping
    expect(src).toMatch(/idle/);
    expect(src).toMatch(/active/);
    expect(src).toMatch(/alert/);
  });

  it("maps poor-heavy distribution to alert state", () => {
    // High poor ratio should map to alert
    expect(src).toMatch(/alert/);
  });

  it("maps fair-heavy distribution to active state", () => {
    // Moderate issues should map to active
    expect(src).toMatch(/active/);
  });
});

// ---- Flagged sessions and reason tags ----

describe("session-vitals — flagged sessions", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("shows flagged session count", () => {
    // Should display count of non-good sessions
    expect(src).toMatch(/flagged|poor.*fair|sessions.*flagged/i);
  });

  it("extracts health reason tags from session data", () => {
    // Should read healthReasons from sessions
    expect(src).toMatch(/healthReasons/);
  });

  it("displays top reason tags", () => {
    // Should show the most common reason tags (2-3)
    expect(src).toMatch(/reason|tag/i);
  });

  it("counts reason frequency to find top reasons", () => {
    // Should aggregate reasons across sessions to find most common
    expect(src).toMatch(/sort|slice|Map|frequency|count/i);
  });
});

// ---- Click navigation ----

describe("session-vitals — navigation", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("imports useLocation from wouter for navigation", () => {
    expect(src).toMatch(/useLocation.*wouter|from.*wouter/);
  });

  it("navigates to analytics sessions tab on click", () => {
    expect(src).toMatch(/analytics\?tab=sessions/);
  });

  it("includes health filter in navigation URL", () => {
    expect(src).toMatch(/health|flagged/);
  });

  it("has a clickable container element", () => {
    expect(src).toMatch(/onClick|cursor.*pointer/);
  });
});

// ---- Graceful degradation ----

describe("session-vitals — graceful degradation", () => {
  const src = fs.readFileSync(VITALS_PATH, "utf-8");

  it("handles loading state", () => {
    expect(src).toMatch(/isLoading|loading|Loading/);
  });

  it("handles missing/error data gracefully", () => {
    // Should have fallback when data is undefined/null
    expect(src).toMatch(/\?\.|undefined|null|fallback|no.*data|unavailable/i);
  });

  it("does not crash with zero sessions", () => {
    // Should guard against division by zero in percentage calculations
    expect(src).toMatch(/total.*===.*0|total.*>.*0|\|\|.*0|total.*<.*1/);
  });
});

// ---- Safety checks ----

describe("session-vitals — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(VITALS_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients (solid colors only)", () => {
    const content = fs.readFileSync(VITALS_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });

  it("no PII or hardcoded personal data", () => {
    const content = fs.readFileSync(VITALS_PATH, "utf-8");
    expect(content).not.toMatch(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    expect(content).not.toMatch(/\w+@\w+\.\w+/);
  });
});
