import React from "react";
import type { PositionedNode } from "@/hooks/use-force-layout";
import { NODE_COLORS, getStrokeWidth } from "./graph-colors";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphNodeProps {
  node: PositionedNode;
  isHighlighted: boolean;
  isDimmed: boolean;
  isDragging: boolean;
  isHovered: boolean;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onClick: (node: PositionedNode) => void;
  onDragStart: (nodeId: string, event: React.MouseEvent) => void;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * SVG node rendered as a group: optional halo, circle, inner dot, label.
 * Uses React.memo so only nodes whose props change re-render on hover.
 */
const GraphNode = React.memo(function GraphNode({
  node,
  isHighlighted,
  isDimmed,
  isDragging,
  isHovered,
  onHoverStart,
  onHoverEnd,
  onClick,
  onDragStart,
}: GraphNodeProps) {
  const color = NODE_COLORS[node.type] ?? "hsl(var(--muted-foreground))";
  const strokeWidth = getStrokeWidth(node.type);
  const isActive = node.type === "session" && node.meta?.isActive === true;
  const showHalo = node.type === "project" || node.type === "session";

  // Dimming: when a node is hovered elsewhere, non-connected nodes go to 0.12
  const opacity = isDimmed ? 0.12 : 1;
  const cursor = isDragging ? "grabbing" : "grab";

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      style={{ opacity, transition: "opacity 150ms ease", cursor }}
      onMouseEnter={() => onHoverStart(node.id)}
      onMouseLeave={onHoverEnd}
      onClick={() => onClick(node)}
      onMouseDown={(e) => onDragStart(node.id, e)}
    >
      {/* Halo — project and session nodes only */}
      {showHalo && (
        <circle
          r={node.r + 6}
          fill={color}
          opacity={0.08}
          className={isActive ? "animate-pulse-gentle" : undefined}
        />
      )}

      {/* Main node circle — white/surface fill with colored stroke */}
      <circle
        r={node.r}
        fill="hsl(var(--card))"
        stroke={color}
        strokeWidth={strokeWidth}
      />

      {/* Inner dot — solid fill, smaller circle */}
      <circle
        r={Math.max(2, node.r * 0.3)}
        fill={color}
        className={isActive ? "animate-pulse-gentle" : undefined}
      />

      {/* Label — only shown when node is large enough to not clutter */}
      {node.r > 8 && (
        <text
          y={node.r + 14}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize={10}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {node.label.length > 18 ? node.label.slice(0, 16) + "..." : node.label}
        </text>
      )}
    </g>
  );
});

export { GraphNode };
export type { GraphNodeProps };
