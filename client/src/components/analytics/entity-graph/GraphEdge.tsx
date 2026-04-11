import React from "react";
import type { PositionedNode, PositionedEdge } from "@/hooks/use-force-layout";
import { NODE_COLORS, isHierarchical, getEdgeOpacity, getEdgeStrokeWidth } from "./graph-colors";

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
 * Single SVG edge rendered as a curved bezier path.
 * Hierarchical edges are solid; cross-reference edges are dashed.
 */
const GraphEdge = React.memo(function GraphEdge({
  edge,
  index,
  isHighlighted,
  isDimmed,
}: GraphEdgeProps) {
  const source = edge.source as PositionedNode;
  const target = edge.target as PositionedNode;

  if (!source?.x || !target?.x) return null;

  const hierarchical = isHierarchical(edge.relation);
  const opacity = getEdgeOpacity(edge.relation, isHighlighted, isDimmed);
  const strokeWidth = getEdgeStrokeWidth(edge.relation);
  const strokeColor = NODE_COLORS[target.type] ?? "hsl(var(--muted-foreground))";
  const d = edgePath(source.x, source.y, target.x, target.y);

  return (
    <path
      key={index}
      d={d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeDasharray={hierarchical ? undefined : "3 5"}
      opacity={opacity}
      style={{ transition: "opacity 150ms ease" }}
    />
  );
});

export { GraphEdge, edgePath };
export type { GraphEdgeProps };
