import React, { useMemo } from "react";
import type { PositionedNode, PositionedEdge } from "@/hooks/use-force-layout";
import { EDGE_COLOR } from "./graph-colors";
import { edgePath } from "./GraphEdge";

// ── Types ──────────────────────────────────────────────────────────────

interface FlowParticlesProps {
  links: PositionedEdge[];
}

// ── Constants ──────────────────────────────────────────────────────────

/** Maximum number of particles to render for performance. */
const MAX_PARTICLES = 30;

// ── Component ──────────────────────────────────────────────────────────

/**
 * Animated dots that travel along edges to suggest data flow.
 * Renders on a subset of edges (every 3rd, capped at 30)
 * to keep the visualization calm and performant.
 */
const FlowParticles = React.memo(function FlowParticles({
  links,
}: FlowParticlesProps) {
  const particles = useMemo(() => {
    if (links.length === 0) return [];

    // Select every 3rd edge, cap at MAX_PARTICLES
    let candidates = links
      .map((link, i) => ({ link, index: i }))
      .filter((_, i) => i % 3 === 0);

    if (candidates.length > MAX_PARTICLES) {
      candidates = candidates.slice(0, MAX_PARTICLES);
    }

    return candidates.map(({ link, index }) => {
      const source = link.source as PositionedNode;
      const target = link.target as PositionedNode;
      if (source?.x == null || target?.x == null) return null;

      const d = edgePath(source.x, source.y, target.x, target.y);

      // Randomize duration (2-4s) and delay for visual variety
      const dur = 2 + Math.random() * 2;
      const delay = Math.random() * 3;

      return (
        <circle key={`particle-${index}`} r={1.2} fill={EDGE_COLOR}>
          <animateMotion
            path={d}
            dur={`${dur}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0.35;0.35;0"
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
