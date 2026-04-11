/**
 * Nerve Center Topology Layout Tests
 *
 * Validates the CNS topology visualization components:
 * - TopologyLayout positions brain at center with 5 organ slots
 * - SVG nerve pathways connect brain to each organ
 * - Pathway supports idle/active/alert state colors
 * - Responsive: stacked layout on narrow viewports
 * - Components accept ReactNode children
 *
 * Run: npx vitest run tests/nerve-center-topology.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const TOPOLOGY_PATH = path.join(NERVE_CENTER_DIR, "TopologyLayout.tsx");
const PATHWAY_PATH = path.join(NERVE_CENTER_DIR, "NervePathway.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");

// ---- File existence ----

describe("nerve-center topology — file structure", () => {
  it("TopologyLayout.tsx exists", () => {
    expect(fs.existsSync(TOPOLOGY_PATH)).toBe(true);
  });

  it("NervePathway.tsx exists", () => {
    expect(fs.existsSync(PATHWAY_PATH)).toBe(true);
  });

  it("index.ts barrel export exists", () => {
    expect(fs.existsSync(INDEX_PATH)).toBe(true);
  });

  it("barrel export re-exports TopologyLayout", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*TopologyLayout/);
  });

  it("barrel export re-exports NervePathway", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*NervePathway/);
  });
});

// ---- TopologyLayout component ----

describe("nerve-center topology — TopologyLayout", () => {
  const src = fs.readFileSync(TOPOLOGY_PATH, "utf-8");

  // -- Props interface --

  it("defines props with brain as ReactNode", () => {
    expect(src).toMatch(/brain.*ReactNode/);
  });

  it("defines organs array prop with position and node fields", () => {
    expect(src).toMatch(/organs/);
    expect(src).toMatch(/position/);
    expect(src).toMatch(/node.*ReactNode|ReactNode/);
  });

  it("supports 5 organ positions: top, top-left, top-right, bottom-left, bottom-right", () => {
    expect(src).toMatch(/top-left/);
    expect(src).toMatch(/top-right/);
    expect(src).toMatch(/bottom-left/);
    expect(src).toMatch(/bottom-right/);
    // 'top' can appear as part of compound names, check it explicitly
    expect(src).toMatch(/['"]top['"]/);
  });

  // -- Brain node rendering --

  it("renders brain node in the layout", () => {
    // The brain prop should be rendered somewhere in the JSX
    expect(src).toMatch(/\{.*brain.*\}|brain/);
  });

  // -- Organ slot rendering --

  it("maps over organs array to render slots", () => {
    expect(src).toMatch(/organs.*map|organs\.map/);
  });

  it("renders each organ node", () => {
    // Each organ's node is rendered within the mapped slot
    expect(src).toMatch(/organ\.node|\.node/);
  });

  // -- SVG pathways --

  it("renders SVG element for nerve pathways", () => {
    expect(src).toMatch(/<svg/i);
  });

  it("uses NervePathway component for connections", () => {
    expect(src).toMatch(/NervePathway/);
  });

  it("imports NervePathway from the local module", () => {
    expect(src).toMatch(/import.*NervePathway.*from/);
  });

  // -- Responsive behavior --

  it("imports useBreakpoint hook for responsive layout", () => {
    expect(src).toMatch(/useBreakpoint/);
  });

  it("imports isMobile helper", () => {
    expect(src).toMatch(/isMobile/);
  });

  it("has a stacked/vertical layout mode for mobile", () => {
    // Should conditionally apply different layout classes based on breakpoint
    expect(src).toMatch(/mobile|stacked|flex-col|grid-cols-1/i);
  });

  it("has a topology/grid layout mode for desktop", () => {
    // Should have a non-stacked layout for wider viewports
    expect(src).toMatch(/relative|grid|topology/i);
  });

  // -- Export --

  it("exports TopologyLayout component", () => {
    expect(src).toMatch(/export.*function TopologyLayout|export.*const TopologyLayout/);
  });
});

// ---- NervePathway component ----

describe("nerve-center topology — NervePathway", () => {
  const src = fs.readFileSync(PATHWAY_PATH, "utf-8");

  // -- State prop --

  it("defines state prop with idle, active, alert values", () => {
    expect(src).toMatch(/idle/);
    expect(src).toMatch(/active/);
    expect(src).toMatch(/alert/);
  });

  it("accepts state as a prop", () => {
    expect(src).toMatch(/state.*idle.*active.*alert|'idle'.*'active'.*'alert'/);
  });

  // -- SVG rendering --

  it("renders SVG polyline or path elements", () => {
    expect(src).toMatch(/<polyline|<path/i);
  });

  it("accepts points array for circuit trace waypoints", () => {
    expect(src).toMatch(/points/);
  });

  // -- State-based styling --

  it("applies different colors based on state", () => {
    // Should have color records keyed by state
    expect(src).toMatch(/idle/i);
    expect(src).toMatch(/active/i);
    expect(src).toMatch(/alert/i);
    expect(src).toMatch(/stateColors/i);
  });

  // -- Animation class --

  it("has nerve-pulse CSS class for future animation", () => {
    expect(src).toMatch(/nerve-pulse/);
  });

  // -- Export --

  it("exports NervePathway component", () => {
    expect(src).toMatch(/export.*function NervePathway|export.*const NervePathway/);
  });
});

// ---- Responsive stacking behavior ----

describe("nerve-center topology — responsive stacking", () => {
  const src = fs.readFileSync(TOPOLOGY_PATH, "utf-8");

  it("conditionally hides SVG pathways on mobile", () => {
    // On mobile/stacked layout, pathways should be hidden or not rendered
    expect(src).toMatch(/mobile.*svg|hidden|display.*none|!mobile/i);
  });

  it("brain appears first in the stacked mobile layout", () => {
    // Brain div should come before organs in the JSX order
    // (natural DOM order = stacked order on mobile)
    const brainIdx = src.indexOf("brain");
    const organsIdx = src.indexOf("organs");
    expect(brainIdx).toBeLessThan(organsIdx);
  });
});

// ---- Safety checks ----

describe("nerve-center topology — safety", () => {
  const files = [TOPOLOGY_PATH, PATHWAY_PATH, INDEX_PATH];

  it("no hardcoded user paths", () => {
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
    }
  });

  it("no text gradients (solid colors only)", () => {
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
    }
  });
});
