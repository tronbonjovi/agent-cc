import React, { useMemo } from "react";
import type { PositionedNode, PositionedEdge } from "@/hooks/use-force-layout";
import { NODE_COLORS, isHierarchical } from "./graph-colors";
import { edgePath } from "./GraphEdge";

// ── Types ──────────────────────────────────────────────────────────────

interface FlowParticlesProps {
  links: PositionedEdge[];
}

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum number of particles to render for performance. */
const MAX_PARTICLES = 30;

/** Only render particles on edges with >100 total — cap at MAX_PARTICLES. */
const EDGE_THRESHOLD = 100;

// ── Component ──────────────────────────────────────────────────────────

/**
 * Animated dots that travel along edges to suggest data flow.
 * Only renders on a subset of edges (hierarchical, or capped at 30)
 * to keep the visualization calm and performant.
 */
const FlowParticles = React.memo(function FlowParticles({
  links,
}: FlowParticlesProps) {
  const particles = useMemo(() => {
    if (links.length === 0) return [];

    // Select candidate edges: prefer hierarchical, cap count
    let candidates = links
      .map((link, i) => ({ link, index: i }))
      .filter(({ link }) => isHierarchical(link.relation));

    // If too many hierarchical edges, or very few, use every-3rd fallback
    if (candidates.length === 0) {
      candidates = links
        .map((link, i) => ({ link, index: i }))
        .filter((_, i) => i % 3 === 0);
    }

    // Performance cap: if total edges > EDGE_THRESHOLD, limit to MAX_PARTICLES
    if (links.length > EDGE_THRESHOLD && candidates.length > MAX_PARTICLES) {
      candidates = candidates.slice(0, MAX_PARTICLES);
    } else if (candidates.length > MAX_PARTICLES) {
      candidates = candidates.slice(0, MAX_PARTICLES);
    }

    return candidates.map(({ link, index }) => {
      const source = link.source as PositionedNode;
      const target = link.target as PositionedNode;
      if (!source?.x || !target?.x) return null;

      const d = edgePath(source.x, source.y, target.x, target.y);
      const color = NODE_COLORS[target.type] ?? "hsl(var(--muted-foreground))";

      // Randomize duration (2-4s) and delay for visual variety
      const dur = 2 + Math.random() * 2;
      const delay = Math.random() * 3;

      return (
        <circle key={`particle-${index}`} r={1.8} fill={color}>
          <animateMotion
            path={d}
            dur={`${dur}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0.45;0.45;0"
            dur={`${dur}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
        </circle>
      );
    }).filter(Boolean);
  }, [links]);

  if (particles.length === 0) return null;

  return <g className="flow-particles">{particles}</g>;
});

export { FlowParticles };
export type { FlowParticlesProps };
