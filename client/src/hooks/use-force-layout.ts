import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { ForceNode, ForceEdge } from "@shared/types";

// ── Public types ────────────────────────────────────────────────────────

export interface PositionedNode extends ForceNode, SimulationNodeDatum {
  x: number;
  y: number;
  r: number;
}

export interface PositionedEdge extends SimulationLinkDatum<PositionedNode> {
  relation: string;
}

export interface UseForceLayoutOptions {
  width: number;
  height: number;
  minRadius?: number;   // default 6
  maxRadius?: number;   // default 40
}

export interface UseForceLayoutResult {
  positioned: PositionedNode[];
  links: PositionedEdge[];
  simulation: Simulation<PositionedNode, PositionedEdge> | null;
  isDragging: boolean;
  onDragStart: (nodeId: string, event: React.MouseEvent) => void;
  onDrag: (event: React.MouseEvent) => void;
  onDragEnd: () => void;
}

// ── Hierarchical relation set ───────────────────────────────────────────

const HIERARCHICAL_RELATIONS = new Set([
  "defines_mcp",
  "has_skill",
  "has_claude_md",
  "has_memory",
  "has_session",
  "tool_call",
  "cost",
  "agent_exec",
]);

// ── Hook ────────────────────────────────────────────────────────────────

export function useForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  options: UseForceLayoutOptions,
): UseForceLayoutResult {
  const { width, height, minRadius = 6, maxRadius = 40 } = options;

  const [positioned, setPositioned] = useState<PositionedNode[]>([]);
  const [links, setLinks] = useState<PositionedEdge[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const simRef = useRef<Simulation<PositionedNode, PositionedEdge> | null>(null);
  const dragNodeRef = useRef<PositionedNode | null>(null);
  const prevNodesRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Build/rebuild simulation when data changes
  useEffect(() => {
    if (nodes.length === 0) {
      setPositioned([]);
      setLinks([]);
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
      return;
    }

    // Preserve existing node positions for continuity on data change
    const existing = prevNodesRef.current;

    const simNodes: PositionedNode[] = nodes.map((node) => {
      const r = minRadius + node.weight * (maxRadius - minRadius);
      const prev = existing.get(node.id);
      return {
        ...node,
        x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        r,
      };
    });

    // Place new nodes near their connected parent when existing positions are available
    if (existing.size > 0) {
      const nodeById = new Map(simNodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (source && target) {
          // If the target is new (no existing position), place near source
          if (!existing.has(target.id) && existing.has(source.id)) {
            target.x = source.x + (Math.random() - 0.5) * 40;
            target.y = source.y + (Math.random() - 0.5) * 40;
          }
        }
      }
    }

    const simEdges: PositionedEdge[] = edges.map((edge) => ({
      source: edge.source as unknown as PositionedNode,
      target: edge.target as unknown as PositionedNode,
      relation: edge.relation,
    }));

    // Stop previous simulation
    if (simRef.current) {
      simRef.current.stop();
    }

    const sim = forceSimulation<PositionedNode>(simNodes)
      .force(
        "link",
        forceLink<PositionedNode, PositionedEdge>(simEdges)
          .id((d) => d.id)
          .distance((d) => {
            const isHierarchical = HIERARCHICAL_RELATIONS.has(d.relation);
            return isHierarchical ? 60 : 120;
          })
          .strength((d) => {
            const isHierarchical = HIERARCHICAL_RELATIONS.has(d.relation);
            return isHierarchical ? 0.7 : 0.1;
          }),
      )
      .force(
        "charge",
        forceManyBody<PositionedNode>().strength((d) => -150 - d.r * 5),
      )
      .force("center", forceCenter(width / 2, height / 2).strength(0.05))
      .force(
        "collide",
        forceCollide<PositionedNode>()
          .radius((d) => d.r + 8)
          .strength(0.8),
      )
      .force("x", forceX<PositionedNode>(width / 2).strength(0.03))
      .force("y", forceY<PositionedNode>(height / 2).strength(0.03));

    sim.on("tick", () => {
      // Update position cache for next data change
      const posMap = new Map<string, { x: number; y: number }>();
      for (const n of simNodes) {
        posMap.set(n.id, { x: n.x, y: n.y });
      }
      prevNodesRef.current = posMap;

      setPositioned([...simNodes]);
      setLinks([...simEdges]);
    });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [nodes, edges, width, height, minRadius, maxRadius]);

  // ── Drag handlers ───────────────────────────────────────────────────

  const onDragStart = useCallback(
    (nodeId: string, _event: React.MouseEvent) => {
      const node = positioned.find((n) => n.id === nodeId);
      if (!node || !simRef.current) return;
      setIsDragging(true);
      dragNodeRef.current = node;
      // Pin node at current position
      node.fx = node.x;
      node.fy = node.y;
      simRef.current.alpha(0.3).restart();
    },
    [positioned],
  );

  const onDrag = useCallback(
    (event: React.MouseEvent) => {
      const node = dragNodeRef.current;
      if (!node || !isDragging) return;

      // Transform screen coords to SVG coords
      const svg = (event.currentTarget as SVGSVGElement);
      if (!svg.getScreenCTM) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const transformed = point.matrixTransform(ctm.inverse());

      node.fx = transformed.x;
      node.fy = transformed.y;
    },
    [isDragging],
  );

  const onDragEnd = useCallback(() => {
    const node = dragNodeRef.current;
    if (node) {
      // Release pinned position, let simulation settle
      node.fx = null;
      node.fy = null;
    }
    dragNodeRef.current = null;
    setIsDragging(false);
  }, []);

  return {
    positioned,
    links,
    simulation: simRef.current,
    isDragging,
    onDragStart,
    onDrag,
    onDragEnd,
  };
}
