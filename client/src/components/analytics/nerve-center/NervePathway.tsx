import { type ReactElement } from "react";

/**
 * Pathway visual state — controls color and animation readiness.
 * - idle: default muted trace
 * - active: bright trace indicating data flow
 * - alert: warning color indicating an issue
 */
export type PathwayState = "idle" | "active" | "alert";

export interface NervePathwayProps {
  /** Waypoints for the circuit trace (right-angle segments). */
  points: Array<{ x: number; y: number }>;
  /** Visual state — idle, active, or alert */
  state?: PathwayState;
  /** Optional label for accessibility */
  label?: string;
}

/** Color mapping for each pathway state (solid colors, no gradients). */
const stateColors: Record<PathwayState, string> = {
  idle: "rgba(100, 116, 139, 0.35)",  // slate-500, subtle
  active: "rgba(59, 130, 246, 0.7)",  // blue-500
  alert: "rgba(239, 68, 68, 0.7)",    // red-500
};

/** Stroke width per state — thin circuit traces. */
const stateWidths: Record<PathwayState, number> = {
  idle: 0.6,
  active: 0.8,
  alert: 0.8,
};

/** Junction dot radius at each bend point. */
const DOT_RADIUS: Record<PathwayState, number> = {
  idle: 0.8,
  active: 1.0,
  alert: 1.0,
};

/**
 * NervePathway — an SVG circuit trace connecting the brain node to an organ node.
 *
 * Renders a polyline through waypoints with small junction dots at each bend,
 * creating a PCB/circuit-board aesthetic. State drives color and the `nerve-pulse`
 * CSS class enables animation tiering via data-state.
 */
export function NervePathway({
  points,
  state = "idle",
  label,
}: NervePathwayProps): ReactElement {
  const stroke = stateColors[state];
  const width = stateWidths[state];
  const dotR = DOT_RADIUS[state];

  // Build polyline points string
  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <g aria-label={label}>
      {/* Circuit trace line */}
      <polyline
        points={polyPoints}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="nerve-pulse transition-all duration-300"
        data-state={state}
      />
      {/* Junction dots at each bend (skip first = brain center, skip last = organ) */}
      {points.slice(1, -1).map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={dotR}
          fill={stroke}
          className="nerve-pulse transition-all duration-300"
          data-state={state}
        />
      ))}
      {/* Terminal dot at the organ end */}
      {points.length > 1 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={dotR * 1.3}
          fill={stroke}
          className="nerve-pulse transition-all duration-300"
          data-state={state}
        />
      )}
    </g>
  );
}
