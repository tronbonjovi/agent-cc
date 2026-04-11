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

// ---- Position mapping ----

/**
 * Relative offsets for each organ position (percentage-based).
 * These place organs around the brain in a pentagon-like arrangement.
 * Values are percentages of the container, with brain at ~50%/45%.
 */
const POSITION_STYLES: Record<OrganPosition, { top: string; left: string }> = {
  "top":          { top: "2%",  left: "50%" },
  "top-left":     { top: "20%", left: "8%" },
  "top-right":    { top: "20%", left: "92%" },
  "bottom-left":  { top: "72%", left: "12%" },
  "bottom-right": { top: "72%", left: "88%" },
};

/** Brain center position (percentage). */
const BRAIN_CENTER = { top: "45%", left: "50%" };

/**
 * Pixel-offset connection points for SVG lines.
 * These map organ positions to approximate coordinates in a 100-unit viewBox.
 */
const PATHWAY_ENDPOINTS: Record<OrganPosition, { x: number; y: number }> = {
  "top":          { x: 50, y: 8 },
  "top-left":     { x: 14, y: 26 },
  "top-right":    { x: 86, y: 26 },
  "bottom-left":  { x: 18, y: 76 },
  "bottom-right": { x: 82, y: 76 },
};

const BRAIN_ENDPOINT = { x: 50, y: 48 };

// ---- Component ----

/**
 * TopologyLayout — CNS-inspired topology visualization.
 *
 * Positions a central "brain" node with up to 5 organ modules arranged
 * around it in a pentagon pattern. SVG nerve pathway lines connect the
 * brain to each organ.
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
        {/* Brain always first in stacked layout */}
        <div className="w-full">
          {brain}
        </div>

        {/* Organs in a responsive grid — no SVG pathways on mobile */}
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

  // ---- Desktop: topology layout ----

  return (
    <div className="relative w-full" style={{ minHeight: "600px" }}>
      {/* SVG overlay for nerve pathway lines — hidden on mobile */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {organs.map((organ) => {
          const end = PATHWAY_ENDPOINTS[organ.position];
          return (
            <NervePathway
              key={organ.position}
              x1={BRAIN_ENDPOINT.x}
              y1={BRAIN_ENDPOINT.y}
              x2={end.x}
              y2={end.y}
              state={organ.pathwayState ?? "idle"}
              label={`Pathway to ${organ.position}`}
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

      {/* Organ slots — positioned around the brain */}
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
