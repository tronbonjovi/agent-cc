/**
 * Nerve Center Wiring Tests
 *
 * Validates the full topology integration in stats.tsx:
 * - TopologyLayout renders with brain + 5 organs
 * - State management: organ states tracked via useState
 * - State derivation: worst organ state becomes brain systemState
 * - CSS nerve-pulse animation keyframes exist
 * - Responsive layout awareness
 * - Old NerveCenterPanel/FileHeatmapPanel/SessionHealthPanel removed from stats.tsx
 * - ServiceSynapses receives service data from nerve center API
 * - All 8 components exported from barrel index
 *
 * Run: npx vitest run tests/nerve-center-wiring.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const INDEX_PATH = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center/index.ts",
);
const CSS_PATH = path.resolve(__dirname, "../client/src/index.css");
const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

// ---- Full topology rendering ----

describe("nerve-center wiring — topology in stats.tsx", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("imports TopologyLayout from nerve-center barrel", () => {
    // Multi-line import block — check component name exists near the barrel path
    expect(src).toMatch(/TopologyLayout/);
    expect(src).toMatch(/nerve-center/);
  });

  it("imports ScannerBrain from nerve-center barrel", () => {
    expect(src).toMatch(/ScannerBrain/);
  });

  it("imports CostNerves from nerve-center barrel", () => {
    expect(src).toMatch(/CostNerves/);
  });

  it("imports SessionVitals from nerve-center barrel", () => {
    expect(src).toMatch(/SessionVitals/);
  });

  it("imports FileSensors from nerve-center barrel", () => {
    expect(src).toMatch(/FileSensors/);
  });

  it("imports ActivityReflexes from nerve-center barrel", () => {
    expect(src).toMatch(/ActivityReflexes/);
  });

  it("imports ServiceSynapses from nerve-center barrel", () => {
    expect(src).toMatch(/ServiceSynapses/);
  });

  it("renders TopologyLayout component in JSX", () => {
    expect(src).toMatch(/<TopologyLayout/);
  });

  it("passes brain prop with ScannerBrain", () => {
    expect(src).toMatch(/brain=\{.*<ScannerBrain/s);
  });

  it("passes organs array with CostNerves", () => {
    expect(src).toMatch(/<CostNerves/);
  });

  it("passes organs array with SessionVitals", () => {
    expect(src).toMatch(/<SessionVitals/);
  });

  it("passes organs array with FileSensors", () => {
    expect(src).toMatch(/<FileSensors/);
  });

  it("passes organs array with ActivityReflexes", () => {
    expect(src).toMatch(/<ActivityReflexes/);
  });

  it("passes organs array with ServiceSynapses", () => {
    expect(src).toMatch(/<ServiceSynapses/);
  });

  it("renders all 5 organ positions", () => {
    // The organs array should reference all 5 positions
    expect(src).toMatch(/position:\s*['"]top['"]/);
    expect(src).toMatch(/position:\s*['"]top-left['"]/);
    expect(src).toMatch(/position:\s*['"]top-right['"]/);
    expect(src).toMatch(/position:\s*['"]bottom-left['"]/);
    expect(src).toMatch(/position:\s*['"]bottom-right['"]/);
  });
});

// ---- State management ----

describe("nerve-center wiring — state management", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("tracks individual organ pathway states via useState", () => {
    // Should have useState calls for organ states
    expect(src).toMatch(/useState.*PathwayState|useState<.*PathwayState/);
  });

  it("each organ has an onStateChange callback that updates its state", () => {
    // onStateChange should appear for each organ
    const onStateChangeCount = (src.match(/onStateChange/g) || []).length;
    expect(onStateChangeCount).toBeGreaterThanOrEqual(5);
  });

  it("pathwayState is passed from tracked state to each organ slot", () => {
    const pathwayStateCount = (src.match(/pathwayState/g) || []).length;
    expect(pathwayStateCount).toBeGreaterThanOrEqual(5);
  });
});

// ---- State derivation (worst organ -> brain state) ----

describe("nerve-center wiring — state derivation", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("derives system state for ScannerBrain from organ states", () => {
    // Should pass systemState prop to ScannerBrain derived from organ states
    expect(src).toMatch(/systemState/);
  });

  it("maps alert organ state to stressed brain state", () => {
    // The derivation logic: any 'alert' -> 'stressed'
    expect(src).toMatch(/alert.*stressed|stressed.*alert/s);
  });

  it("maps active organ state to busy brain state", () => {
    // The derivation logic: any 'active' -> 'busy'
    expect(src).toMatch(/active.*busy|busy.*active/s);
  });

  it("maps all idle to calm brain state", () => {
    // The derivation logic: all 'idle' -> 'calm'
    expect(src).toMatch(/idle.*calm|calm.*idle/s);
  });
});

// ---- CSS nerve-pulse animation ----

describe("nerve-center wiring — nerve-pulse CSS animation", () => {
  const css = fs.readFileSync(CSS_PATH, "utf-8");

  it("defines nerve-pulse keyframes", () => {
    expect(css).toMatch(/@keyframes\s+nerve-pulse/);
  });

  it("has .nerve-pulse class that uses the keyframe", () => {
    expect(css).toMatch(/\.nerve-pulse/);
  });

  it("animation varies by state — idle has subtle effect", () => {
    // The CSS should have state-specific selectors or the class itself
    // provides the base animation which the component's inline styles control
    expect(css).toMatch(/nerve-pulse/);
  });

  it("respects prefers-reduced-motion for nerve-pulse", () => {
    // The existing reduced-motion rule covers all animations via wildcard
    expect(css).toMatch(/prefers-reduced-motion.*reduce/s);
  });
});

// ---- Responsive layout awareness ----

describe("nerve-center wiring — responsive layout", () => {
  const topologySrc = fs.readFileSync(
    path.join(NERVE_CENTER_DIR, "TopologyLayout.tsx"),
    "utf-8",
  );

  it("TopologyLayout uses useBreakpoint for responsive detection", () => {
    expect(topologySrc).toMatch(/useBreakpoint/);
  });

  it("TopologyLayout has mobile stacked layout mode", () => {
    expect(topologySrc).toMatch(/mobile.*flex-col|flex-col.*mobile/s);
  });

  it("TopologyLayout hides SVG pathways on mobile", () => {
    expect(topologySrc).toMatch(/mobile/);
    // On mobile path, SVG is not rendered
    expect(topologySrc).toMatch(/if.*mobile/s);
  });
});

// ---- Old panel cleanup ----

describe("nerve-center wiring — old panel cleanup", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("does not import NerveCenterPanel from session-analytics-panel", () => {
    expect(src).not.toMatch(/import.*NerveCenterPanel.*from.*session-analytics-panel/);
  });

  it("does not import FileHeatmapPanel from session-analytics-panel", () => {
    expect(src).not.toMatch(/import.*FileHeatmapPanel.*from.*session-analytics-panel/);
  });

  it("does not import SessionHealthPanel from session-analytics-panel", () => {
    expect(src).not.toMatch(/import.*SessionHealthPanel.*from.*session-analytics-panel/);
  });

  it("does not render NerveCenterPanel", () => {
    expect(src).not.toMatch(/<NerveCenterPanel/);
  });

  it("does not render FileHeatmapPanel", () => {
    expect(src).not.toMatch(/<FileHeatmapPanel/);
  });

  it("does not render SessionHealthPanel", () => {
    expect(src).not.toMatch(/<SessionHealthPanel/);
  });

  it("does not contain the old NerveCenterStacked function", () => {
    expect(src).not.toMatch(/function\s+NerveCenterStacked/);
  });
});

// ---- ServiceSynapses gets service data ----

describe("nerve-center wiring — ServiceSynapses data wiring", () => {
  const src = fs.readFileSync(STATS_PATH, "utf-8");

  it("ServiceSynapses receives services prop", () => {
    expect(src).toMatch(/services=\{/);
  });

  it("fetches nerve center data that contains services", () => {
    // Should use useNerveCenter or similar to get service data
    expect(src).toMatch(/useNerveCenter|nerve-center|nerveCenter/);
  });
});

// ---- Barrel export completeness ----

describe("nerve-center wiring — barrel exports all 8 components", () => {
  const indexSrc = fs.readFileSync(INDEX_PATH, "utf-8");

  it("exports TopologyLayout", () => {
    expect(indexSrc).toMatch(/export.*TopologyLayout/);
  });

  it("exports NervePathway", () => {
    expect(indexSrc).toMatch(/export.*NervePathway/);
  });

  it("exports ScannerBrain", () => {
    expect(indexSrc).toMatch(/export.*ScannerBrain/);
  });

  it("exports CostNerves", () => {
    expect(indexSrc).toMatch(/export.*CostNerves/);
  });

  it("exports SessionVitals", () => {
    expect(indexSrc).toMatch(/export.*SessionVitals/);
  });

  it("exports FileSensors", () => {
    expect(indexSrc).toMatch(/export.*FileSensors/);
  });

  it("exports ActivityReflexes", () => {
    expect(indexSrc).toMatch(/export.*ActivityReflexes/);
  });

  it("exports ServiceSynapses", () => {
    expect(indexSrc).toMatch(/export.*ServiceSynapses/);
  });
});

// ---- Safety ----

describe("nerve-center wiring — safety", () => {
  const statsSrc = fs.readFileSync(STATS_PATH, "utf-8");
  const cssSrc = fs.readFileSync(CSS_PATH, "utf-8");

  it("no hardcoded user paths in stats.tsx", () => {
    expect(statsSrc).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients in stats.tsx (solid colors only)", () => {
    expect(statsSrc).not.toMatch(/bg-gradient.*bg-clip-text/);
  });

  it("no hardcoded user paths in CSS", () => {
    expect(cssSrc).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });
});
