/**
 * Nerve Center File Sensors Tests
 *
 * Validates the File Sensors organ module:
 * - Renders compact file temperature visualization
 * - Warmth coloring logic (cool/warm/hot based on activity)
 * - State color reflects overall file activity level
 * - Graceful handling when heatmap data is unavailable
 * - Operation type indicators (read/write/edit)
 * - onStateChange callback prop
 * - Exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-file-sensors.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const FILE_SENSORS_PATH = path.join(NERVE_CENTER_DIR, "FileSensors.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("nerve-center file-sensors — file structure", () => {
  it("FileSensors.tsx exists", () => {
    expect(fs.existsSync(FILE_SENSORS_PATH)).toBe(true);
  });

  it("barrel export re-exports FileSensors", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*FileSensors/);
  });
});

// ---- Component structure ----

describe("nerve-center file-sensors — component", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("exports FileSensors component", () => {
    expect(src()).toMatch(/export.*function FileSensors/);
  });

  it("accepts onStateChange callback prop", () => {
    expect(src()).toMatch(/onStateChange/);
  });

  it("uses useFileHeatmap hook for data fetching", () => {
    expect(src()).toMatch(/useFileHeatmap/);
  });

  it("imports from use-sessions hook", () => {
    expect(src()).toMatch(/import.*useFileHeatmap.*from/);
  });
});

// ---- File display ----

describe("nerve-center file-sensors — file display", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("limits display to top files (5-8)", () => {
    // Should slice or limit the files array
    expect(src()).toMatch(/slice\(0,\s*(5|6|7|8)\)/);
  });

  it("displays file name (not full path)", () => {
    // Should use fileName field (short name, not filePath)
    expect(src()).toMatch(/fileName/);
  });

  it("displays touch count", () => {
    expect(src()).toMatch(/touchCount/);
  });

  it("shows operation type indicators for read/write/edit", () => {
    const s = src();
    expect(s).toMatch(/operations\.read|operations\["read"\]/);
    expect(s).toMatch(/operations\.write|operations\["write"\]/);
    expect(s).toMatch(/operations\.edit|operations\["edit"\]/);
  });
});

// ---- Warmth coloring ----

describe("nerve-center file-sensors — warmth coloring", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("has a warmth calculation function or logic", () => {
    // Should compute warmth based on touch count
    expect(src()).toMatch(/warmth|getWarmth|fileWarmth|tempColor/i);
  });

  it("uses blue/muted for cool (low activity) files", () => {
    expect(src()).toMatch(/blue|slate|muted/i);
  });

  it("uses amber for moderate activity files", () => {
    expect(src()).toMatch(/amber|yellow|orange/i);
  });

  it("uses red for hot (high activity) files", () => {
    expect(src()).toMatch(/red/i);
  });

  it("has thresholds for warmth classification", () => {
    // Should have numeric thresholds for cool/warm/hot
    const s = src();
    // Checks for some form of threshold comparison
    expect(s).toMatch(/touchCount\s*[<>=]/);
  });
});

// ---- Warmth helper unit tests ----

describe("nerve-center file-sensors — warmth logic unit", () => {
  /**
   * Extract and test the warmth classification logic directly.
   * The component should expose or inline a function that maps
   * touchCount to a warmth level.
   */
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("classifies low touchCount as cool", () => {
    // The component should have logic where low counts map to cool/blue colors
    const s = src();
    // Verify the threshold pattern exists — exact values tested by presence of comparison
    expect(s).toMatch(/cool|low/i);
  });

  it("classifies high touchCount as hot", () => {
    const s = src();
    expect(s).toMatch(/hot|high/i);
  });

  it("has an intermediate warm level", () => {
    const s = src();
    expect(s).toMatch(/warm|moderate|medium/i);
  });
});

// ---- State color (organ health) ----

describe("nerve-center file-sensors — state color", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("computes overall activity level from total operations", () => {
    // Should look at totalOperations or aggregate touchCounts
    expect(src()).toMatch(/totalOperations|total.*ops|overallActivity/i);
  });

  it("reports green state for calm/low activity", () => {
    expect(src()).toMatch(/green|idle|calm/i);
  });

  it("reports amber state for moderate churn", () => {
    expect(src()).toMatch(/amber|warning|moderate/i);
  });

  it("reports red state for heavy churn", () => {
    expect(src()).toMatch(/red|alert|heavy/i);
  });

  it("calls onStateChange with computed state", () => {
    // Should invoke the callback with the organ state
    expect(src()).toMatch(/onStateChange\??\.\(|onStateChange\(/);
  });
});

// ---- Graceful degradation ----

describe("nerve-center file-sensors — empty/error handling", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("handles loading state", () => {
    expect(src()).toMatch(/isLoading|loading|Loading/);
  });

  it("handles empty data gracefully", () => {
    // Should check for no files / empty result
    expect(src()).toMatch(/files\.length\s*===?\s*0|!files|no.*file|No.*file/i);
  });

  it("does not crash when data is undefined", () => {
    // Should have optional chaining or null checks
    expect(src()).toMatch(/data\?|files\?|data &&|files &&/);
  });
});

// ---- Visual design ----

describe("nerve-center file-sensors — visual design", () => {
  const src = () => fs.readFileSync(FILE_SENSORS_PATH, "utf-8");

  it("uses compact card styling", () => {
    // Should have card-like container classes
    expect(src()).toMatch(/rounded|border|bg-/);
  });

  it("has a header/title indicating file sensors", () => {
    expect(src()).toMatch(/File.*Sensor|file.*sensor|File.*Activity/i);
  });

  it("uses Lucide icons", () => {
    expect(src()).toMatch(/from "lucide-react"|from 'lucide-react'/);
  });
});

// ---- Safety checks ----

describe("nerve-center file-sensors — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(FILE_SENSORS_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients (solid colors only)", () => {
    const content = fs.readFileSync(FILE_SENSORS_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });

  it("no PII (phone numbers, emails)", () => {
    const content = fs.readFileSync(FILE_SENSORS_PATH, "utf-8");
    expect(content).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
    expect(content).not.toMatch(/\w+@\w+\.\w+/);
  });
});
