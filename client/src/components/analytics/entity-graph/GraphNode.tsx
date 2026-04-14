import type { PositionedNode } from "@/hooks/use-force-layout";
import { NODE_COLORS } from "./graph-colors";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphNodeProps {
  node: PositionedNode;
  isHighlighted: boolean;
  isDimmed: boolean;
  isDragging: boolean;
  isHovered: boolean;
  showLabels: boolean;
  zoomScale: number;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onClick: (node: PositionedNode) => void;
  onDragStart: (nodeId: string, event: React.MouseEvent) => void;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * SVG node rendered as a single solid-fill circle with an optional label.
 *
 * NOT memoized — d3-force mutates node.x/y in place, so the node prop
 * reference is stable across ticks and React.memo would cache the first
 * render forever, leaving nodes frozen at their original positions while
 * edges (which recalculate paths every render) drifted away. Same
 * reasoning as GraphEdge.
 *
 * Label visibility is zoom-driven:
 *   scale < 0.6  → no labels
 *   0.6 - 1.2    → labels on nodes with r > 10
 *   scale > 1.2  → all labels
 */
function GraphNode({
  node,
  isHighlighted: _isHighlighted,
  isDimmed,
  isDragging,
  isHovered: _isHovered,
  showLabels,
  zoomScale,
  onHoverStart,
  onHoverEnd,
  onClick,
  onDragStart,
}: GraphNodeProps) {
  const color = NODE_COLORS[node.type] ?? "hsl(var(--muted-foreground))";
  const isActive = node.type === "session" && node.meta?.isActive === true;
  const opacity = isDimmed ? 0.3 : 1;
  const cursor = isDragging ? "grabbing" : "grab";

  // Zoom-driven label visibility
  const labelVisible =
    showLabels &&
    (zoomScale > 1.2 || (zoomScale >= 0.6 && node.r > 10));

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      style={{ opacity, transition: "opacity 150ms ease", cursor }}
      onMouseEnter={() => onHoverStart(node.id)}
      onMouseLeave={onHoverEnd}
      onClick={() => onClick(node)}
      onMouseDown={(e) => {
        e.stopPropagation(); // prevent background pan
        onDragStart(node.id, e);
      }}
    >
      {/* Single solid-fill circle */}
      <circle r={node.r} fill={color}>
        {/* Gentle opacity pulse for active sessions only */}
        {isActive && (
          <animate
            attributeName="opacity"
            values="1;0.6;1"
            dur="3s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Label — zoom-driven visibility */}
      {labelVisible && (
        <text
          y={node.r + 12}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize={9}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {node.label.length > 18 ? node.label.slice(0, 16) + "..." : node.label}
        </text>
      )}
    </g>
  );
}

export { GraphNode };
export type { GraphNodeProps };
