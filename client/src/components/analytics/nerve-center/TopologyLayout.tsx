import { type ReactNode, type ReactElement } from "react";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { NervePathway, type PathwayState } from "./NervePathway";

// ---- Types ----

/** Organ position around the brain node. */
export type OrganPosition = "top" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OrganSlot {
  /** Where this organ sits relative to the brain center. */
  position: OrganPosition;
  /** The React component to render in this slot. */
  node: ReactNode;
  /** Optional pathway state for the connection line. */
  pathwayState?: PathwayState;
}

export interface TopologyLayoutProps {
  /** Central brain node — the scanner/overview component. */
  brain: ReactNode;
  /** Organ modules arranged around the brain. */
  organs: OrganSlot[];
}

// ---- Circuit-board grid layout ----

/**
 * Grid-based positions for the circuit-board aesthetic.
 * Brain sits at center. Organs at grid intersections connected
 * by right-angle circuit traces.
 */
const POSITION_STYLES: Record<OrganPosition, { top: string; left: string }> = {
  "top":          { top: "2%",  left: "50%" },
  "top-left":     { top: "25%", left: "6%" },
  "top-right":    { top: "25%", left: "94%" },
  "bottom-left":  { top: "70%", left: "6%" },
  "bottom-right": { top: "70%", left: "94%" },
};

/** Brain center position. */
const BRAIN_CENTER = { top: "45%", left: "50%" };

/**
 * Circuit trace waypoints — each pathway goes from brain to organ
 * via right-angle segments (like PCB traces).
 * Coordinates are in a 200x100 viewBox for better horizontal resolution.
 */
const CIRCUIT_PATHS: Record<OrganPosition, Array<{ x: number; y: number }>> = {
  "top": [
    { x: 100, y: 46 },  // brain center
    { x: 100, y: 8 },   // straight up to top organ
  ],
  "top-left": [
    { x: 100, y: 46 },  // brain center
    { x: 100, y: 30 },  // go up
    { x: 14, y: 30 },   // go left
  ],
  "top-right": [
    { x: 100, y: 46 },  // brain center
    { x: 100, y: 30 },  // go up
    { x: 186, y: 30 },  // go right
  ],
  "bottom-left": [
    { x: 100, y: 46 },  // brain center
    { x: 100, y: 72 },  // go down
    { x: 14, y: 72 },   // go left
  ],
  "bottom-right": [
    { x: 100, y: 46 },  // brain center
    { x: 100, y: 72 },  // go down
    { x: 186, y: 72 },  // go right
  ],
};

// ---- Component ----

/**
 * TopologyLayout — circuit-board inspired CNS topology visualization.
 *
 * Positions a central "brain" node with up to 5 organ modules arranged
 * in a grid pattern. SVG circuit traces connect the brain to each organ
 * via right-angle paths (PCB aesthetic).
 *
 * On mobile/narrow viewports, collapses to a stacked vertical layout
 * with the brain at top and organs in a responsive grid below.
 */
export function TopologyLayout({ brain, organs }: TopologyLayoutProps): ReactElement {
  const bp = useBreakpoint();
  const mobile = isMobile(bp);

  // ---- Mobile: stacked layout ----

  if (mobile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="w-full">
          {brain}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {organs.map((organ) => (
            <div key={organ.position} className="w-full">
              {organ.node}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Desktop: circuit-board topology ----

  return (
    <div className="relative w-full" style={{ minHeight: "600px" }}>
      {/* SVG overlay for circuit traces */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Junction dots at brain center */}
        <circle cx={100} cy={46} r={1.2} fill="rgba(100, 116, 139, 0.3)" />

        {organs.map((organ) => {
          const points = CIRCUIT_PATHS[organ.position];
          if (!points || points.length < 2) return null;
          return (
            <NervePathway
              key={organ.position}
              points={points}
              state={organ.pathwayState ?? "idle"}
              label={`Circuit trace to ${organ.position}`}
            />
          );
        })}
      </svg>

      {/* Brain — centered */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-10 w-[280px] max-w-[40%]"
        style={{ top: BRAIN_CENTER.top, left: BRAIN_CENTER.left }}
      >
        {brain}
      </div>

      {/* Organ slots — positioned at grid intersections */}
      {organs.map((organ) => {
        const pos = POSITION_STYLES[organ.position];
        return (
          <div
            key={organ.position}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 w-[220px] max-w-[30%]"
            style={{ top: pos.top, left: pos.left }}
          >
            {organ.node}
          </div>
        );
      })}
    </div>
  );
}
