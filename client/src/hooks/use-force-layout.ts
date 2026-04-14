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
  minRadius?: number;   // default 3
  maxRadius?: number;   // default 16
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
  const { width, height, minRadius = 3, maxRadius = 16 } = options;

  // Tick counter — incremented at most once per animation frame to trigger renders
  const [tick, setTick] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const simRef = useRef<Simulation<PositionedNode, PositionedEdge> | null>(null);
  const nodesRef = useRef<PositionedNode[]>([]);
  const edgesRef = useRef<PositionedEdge[]>([]);
  const dirtyRef = useRef(false);
  const rafRef = useRef<number>(0);
  const dragNodeRef = useRef<PositionedNode | null>(null);

  // Persists node positions across data changes so drill-in reuses layout instead of re-scattering.
  const prevNodesRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Keep latest dimensions accessible without triggering simulation rebuild
  const dimsRef = useRef({ width, height });
  dimsRef.current = { width, height };

  // ── rAF render loop ─────────────────────────────────────────────────
  // Collapses many d3 ticks into a single React render per animation frame.
  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        setTick((t) => t + 1);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Build simulation when node/edge data changes ────────────────────
  useEffect(() => {
    // Tear down previous simulation completely
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }

    if (nodes.length === 0) {
      nodesRef.current = [];
      edgesRef.current = [];
      dirtyRef.current = true;
      return;
    }

    const cx = dimsRef.current.width / 2;
    const cy = dimsRef.current.height / 2;
    const scatterRadius = Math.min(dimsRef.current.width, dimsRef.current.height) * 0.3;

    const existing = prevNodesRef.current;
    const currentIds = new Set(nodes.map((n) => n.id));

    // Keep only cached positions whose nodes survived into the new graph.
    // Any new node re-scatters from scratch — the overlap heuristic we
    // used to have here could leave orphaned nodes frozen at stale
    // positions after a scope change.
    for (const key of Array.from(existing.keys())) {
      if (!currentIds.has(key)) existing.delete(key);
    }

    // Seed from the cache where possible; scatter new nodes near center.
    const simNodes: PositionedNode[] = nodes.map((node) => {
      const r = minRadius + node.weight * (maxRadius - minRadius);
      const prev = existing.get(node.id);
      if (prev) return { ...node, x: prev.x, y: prev.y, r };
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * scatterRadius;
      return {
        ...node,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r,
      };
    });

    // Nudge new nodes to their connected parent's neighborhood so drill-in
    // reveals children near where the user clicked, not scattered at the center.
    if (existing.size > 0) {
      const nodeById = new Map(simNodes.map((n) => [n.id, n] as const));
      for (const edge of edges) {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) continue;
        if (!existing.has(target.id) && existing.has(source.id)) {
          target.x = source.x + (Math.random() - 0.5) * 40;
          target.y = source.y + (Math.random() - 0.5) * 40;
        } else if (!existing.has(source.id) && existing.has(target.id)) {
          source.x = target.x + (Math.random() - 0.5) * 40;
          source.y = target.y + (Math.random() - 0.5) * 40;
        }
      }
    }

    const simEdges: PositionedEdge[] = edges.map((edge) => ({
      source: edge.source as unknown as PositionedNode,
      target: edge.target as unknown as PositionedNode,
      relation: edge.relation,
    }));

    // Store refs before simulation starts (so first render has data)
    nodesRef.current = simNodes;
    edgesRef.current = simEdges;

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
      .force("center", forceCenter(cx, cy).strength(0.15))
      .force(
        "collide",
        forceCollide<PositionedNode>()
          .radius((d) => d.r + 8)
          .strength(0.8),
      )
      .force("x", forceX<PositionedNode>(cx).strength(0.08))
      .force("y", forceY<PositionedNode>(cy).strength(0.08));

    // Tick mutates positions in-place and marks the rAF loop dirty — no setState per tick.
    sim.on("tick", () => {
      const cache = prevNodesRef.current;
      for (const n of simNodes) {
        const entry = cache.get(n.id);
        if (entry) {
          entry.x = n.x;
          entry.y = n.y;
        } else {
          cache.set(n.id, { x: n.x, y: n.y });
        }
      }
      dirtyRef.current = true;
    });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [nodes, edges, minRadius, maxRadius]);

  // ── Update centering forces on resize (no rebuild) ──────────────────
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    const cx = width / 2;
    const cy = height / 2;

    sim.force("center", forceCenter(cx, cy).strength(0.15));
    sim.force("x", forceX<PositionedNode>(cx).strength(0.08));
    sim.force("y", forceY<PositionedNode>(cy).strength(0.08));

    // Gentle reheat so nodes drift to new center
    sim.alpha(0.1).restart();
  }, [width, height]);

  // ── Drag handlers (reference simulation nodes directly) ─────────────

  const onDragStart = useCallback(
    (nodeId: string, _event: React.MouseEvent) => {
      const sim = simRef.current;
      if (!sim) return;

      const node = sim.nodes().find((n) => n.id === nodeId);
      if (!node) return;

      setIsDragging(true);
      dragNodeRef.current = node;
      node.fx = node.x;
      node.fy = node.y;
      sim.alpha(0.3).restart();
    },
    [],
  );

  const onDrag = useCallback(
    (event: React.MouseEvent) => {
      const node = dragNodeRef.current;
      if (!node) return;

      const svg = event.currentTarget as SVGSVGElement;
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
    [],
  );

  const onDragEnd = useCallback(() => {
    const node = dragNodeRef.current;
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    dragNodeRef.current = null;
    setIsDragging(false);
  }, []);

  // ── Return current ref contents (read on render triggered by tick counter) ──
  // The tick state variable is intentionally read here to create the render dependency,
  // even though the actual data comes from refs.
  void tick;

  return {
    positioned: nodesRef.current,
    links: edgesRef.current,
    simulation: simRef.current,
    isDragging,
    onDragStart,
    onDrag,
    onDragEnd,
  };
}
