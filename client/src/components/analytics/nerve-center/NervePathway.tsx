import { type ReactElement } from "react";

/**
 * Pathway visual state — controls color and animation readiness.
 * - idle: default muted line
 * - active: bright line indicating data flow
 * - alert: warning color indicating an issue
 */
export type PathwayState = "idle" | "active" | "alert";

export interface NervePathwayProps {
  /** Start point (from brain connection) */
  x1: number;
  y1: number;
  /** End point (to organ connection) */
  x2: number;
  y2: number;
  /** Visual state — idle, active, or alert */
  state?: PathwayState;
  /** Optional label for accessibility */
  label?: string;
}

/** Color mapping for each pathway state (solid colors, no gradients). */
const stateColors: Record<PathwayState, string> = {
  idle: "rgba(100, 116, 139, 0.4)",   // slate-500 muted
  active: "rgba(59, 130, 246, 0.8)",  // blue-500
  alert: "rgba(239, 68, 68, 0.8)",    // red-500
};

/** Stroke width per state — active/alert slightly thicker for emphasis. */
const stateWidths: Record<PathwayState, number> = {
  idle: 1.5,
  active: 2,
  alert: 2,
};

/**
 * NervePathway — an SVG line connecting the brain node to an organ node.
 *
 * Renders a single line segment with state-driven color. Applies the
 * `nerve-pulse` CSS class so future animation (e.g. traveling dot or
 * glow pulse) can be added via CSS keyframes without touching this component.
 */
export function NervePathway({
  x1,
  y1,
  x2,
  y2,
  state = "idle",
  label,
}: NervePathwayProps): ReactElement {
  const stroke = state === "idle" ? stateColors.idle
    : state === "active" ? stateColors.active
    : state === "alert" ? stateColors.alert
    : stateColors.idle;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={stateWidths[state]}
      strokeLinecap="round"
      className="nerve-pulse transition-all duration-300"
      aria-label={label}
    />
  );
}
