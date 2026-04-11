import React from "react";
import type { PositionedNode, PositionedEdge } from "@/hooks/use-force-layout";
import { EDGE_COLOR, getEdgeOpacity } from "./graph-colors";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphEdgeProps {
  edge: PositionedEdge;
  index: number;
  isHighlighted: boolean;
  isDimmed: boolean;
}

// ── Bezier path helper ─────────────────────────────────────────────────

/** Curved quadratic bezier between two points with a subtle perpendicular bend. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = 0.12;
  return `M${x1},${y1} Q${mx - dy * bend},${my + dx * bend} ${x2},${y2}`;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Single SVG edge rendered as a solid curved bezier path.
 * NOT memoized — d3-force mutates link positions in place, so edge paths
 * must recalculate on every simulation tick / drag / pan frame.
 */
function GraphEdge({
  edge,
  isHighlighted,
  isDimmed,
}: GraphEdgeProps) {
  const source = edge.source as PositionedNode;
  const target = edge.target as PositionedNode;

  if (source?.x == null || target?.x == null) return null;

  const opacity = getEdgeOpacity(isHighlighted, isDimmed);
  const d = edgePath(source.x, source.y, target.x, target.y);

  return (
    <path
      d={d}
      fill="none"
      stroke={EDGE_COLOR}
      strokeWidth={0.8}
      opacity={opacity}
      style={{ transition: "opacity 150ms ease" }}
    />
  );
}

export { GraphEdge, edgePath };
export type { GraphEdgeProps };
