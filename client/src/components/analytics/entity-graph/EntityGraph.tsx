import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useForceGraph } from "@/hooks/use-graph";
import { useForceLayout, type PositionedNode } from "@/hooks/use-force-layout";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Tag } from "lucide-react";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import { GraphSidebar } from "./GraphSidebar";
import { FlowParticles } from "./FlowParticles";
import { NODE_COLORS } from "./graph-colors";
import { computeZoomTransform } from "./zoom-math";

// ── Types ──────────────────────────────────────────────────────────────

interface EntityGraphProps {
  className?: string;
}

// ── Entity type filter defaults ────────────────────────────────────────

const ALL_ENTITY_TYPES = ["project", "mcp", "skill", "plugin", "markdown", "config"] as const;
const DEFAULT_ENABLED = new Set(["project", "mcp", "skill", "plugin"]);

// d3-force mutates edge.source/target from string IDs into live node
// references during simulation init — but before the first tick (or on
// a stale render during scope change) they can still be strings. The
// d3 type also permits numbers, so widen the helper accordingly.
const linkId = (endpoint: string | number | PositionedNode): string =>
  typeof endpoint === "object" ? endpoint.id : String(endpoint);

// ── Mobile fallback ────────────────────────────────────────────────────

function MobileFallback({ data }: { data: ReturnType<typeof useForceGraph>["data"] }) {
  if (!data?.nodes?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No entity data available
      </div>
    );
  }

  const grouped = data.nodes.reduce(
    (acc, node) => {
      if (!acc[node.type]) acc[node.type] = [];
      acc[node.type].push(node);
      return acc;
    },
    {} as Record<string, typeof data.nodes>,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Card>
          <CardContent className="p-3">
            <div className="text-lg font-bold tabular-nums">{data.stats.totalEntities}</div>
            <div className="text-[10px] text-muted-foreground">Entities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-lg font-bold tabular-nums">{data.stats.totalSessions}</div>
            <div className="text-[10px] text-muted-foreground">Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-lg font-bold tabular-nums">
              ${data.stats.totalCost.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">Total Cost</div>
          </CardContent>
        </Card>
      </div>

      {Object.entries(grouped)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([type, nodes]) => (
          <Card key={type}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: NODE_COLORS[type] }}
                />
                {type}
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">
                  {nodes.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="space-y-1">
                {nodes.slice(0, 10).map((node) => (
                  <div key={node.id} className="text-xs text-muted-foreground truncate">
                    {node.label}
                  </div>
                ))}
                {nodes.length > 10 && (
                  <div className="text-[10px] text-muted-foreground/50">
                    +{nodes.length - 10} more
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

// ── Dot grid background SVG pattern ────────────────────────────────────

function DotGridPattern() {
  return (
    <defs>
      <pattern id="dot-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="0.5" fill="hsl(var(--muted-foreground) / 0.12)" />
      </pattern>
    </defs>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function EntityGraph({ className }: EntityGraphProps) {
  const bp = useBreakpoint();
  const mobile = isMobile(bp);

  const [scope, setScope] = useState<"system" | "sessions">("system");
  const [drillProjectKey, setDrillProjectKey] = useState<string | null>(null);
  const [drillProjectLabel, setDrillProjectLabel] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── Filter state ──
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(DEFAULT_ENABLED));
  const [showLabels, setShowLabels] = useState(true);

  // ── Pan/zoom state ──
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Tab visibility (pause particles when hidden) ──
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const { data, isLoading } = useForceGraph(scope, drillProjectKey ?? undefined);

  // ── Container sizing via ResizeObserver ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: Math.max(500, entry.contentRect.height),
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Force layout simulation ──
  const { positioned, links, isDragging, onDragStart, onDrag, onDragEnd } =
    useForceLayout(data?.nodes ?? [], data?.edges ?? [], {
      width: dimensions.width,
      height: dimensions.height,
    });

  // ── Tiered visibility ──
  // System scope: show project nodes + their direct connections filtered by enabledTypes
  // Hover project: reveal ALL connections (including disabled types)
  // Sessions scope: show all
  const visibleNodeIds = useMemo(() => {
    if (scope !== "system" || !data) return null;

    const visible = new Set<string>();
    const projectIds = new Set<string>();

    for (const node of data.nodes) {
      if (node.type === "project") {
        projectIds.add(node.id);
        if (enabledTypes.has("project")) visible.add(node.id);
      }
    }

    // Direct project connections, filtered by enabled types
    for (const edge of data.edges) {
      const srcIsProject = projectIds.has(edge.source);
      const tgtIsProject = projectIds.has(edge.target);
      if (srcIsProject || tgtIsProject) {
        const otherId = srcIsProject ? edge.target : edge.source;
        const otherNode = data.nodes.find((n) => n.id === otherId);
        if (otherNode && enabledTypes.has(otherNode.type)) {
          visible.add(otherId);
        }
      }
    }

    // Hover project → reveal ALL connections regardless of type filter
    if (hoveredNodeId && projectIds.has(hoveredNodeId)) {
      for (const edge of data.edges) {
        if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) {
          visible.add(edge.source);
          visible.add(edge.target);
        }
      }
    }

    return visible;
  }, [scope, data, hoveredNodeId, enabledTypes]);

  // Filter to only render visible nodes/edges (hidden = removed from DOM)
  const filteredNodes = useMemo(() => {
    if (!visibleNodeIds) return positioned;
    return positioned.filter((n) => visibleNodeIds.has(n.id));
  }, [positioned, visibleNodeIds]);

  // Always gate links on the current node set so dangling edges can never
  // render — even in sessions scope where visibleNodeIds is null.
  const nodeIdSet = useMemo(
    () => new Set(positioned.map((n) => n.id)),
    [positioned],
  );

  const filteredLinks = useMemo(() => {
    return links.filter((e) => {
      const sid = linkId(e.source);
      const tid = linkId(e.target);
      if (!nodeIdSet.has(sid) || !nodeIdSet.has(tid)) return false;
      if (!visibleNodeIds) return true;
      return visibleNodeIds.has(sid) && visibleNodeIds.has(tid);
    });
  }, [links, nodeIdSet, visibleNodeIds]);

  // ── Hover subgraph highlighting ──
  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (!hoveredNodeId)
      return { highlightedNodes: new Set<string>(), highlightedEdges: new Set<number>() };

    const nodes = new Set<string>([hoveredNodeId]);
    const edges = new Set<number>();

    filteredLinks.forEach((e, i) => {
      const sid = linkId(e.source);
      const tid = linkId(e.target);
      if (sid === hoveredNodeId || tid === hoveredNodeId) {
        edges.add(i);
        nodes.add(sid);
        nodes.add(tid);
      }
    });

    return { highlightedNodes: nodes, highlightedEdges: edges };
  }, [hoveredNodeId, filteredLinks]);

  // ── Selected node for sidebar (click-to-pin) ──
  const selectedNode = useMemo(
    () => (selectedNodeId ? filteredNodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, filteredNodes],
  );

  const connectionCount = useMemo(() => {
    if (!selectedNodeId) return 0;
    return filteredLinks.filter((e) => {
      const sid = linkId(e.source);
      const tid = linkId(e.target);
      return sid === selectedNodeId || tid === selectedNodeId;
    }).length;
  }, [selectedNodeId, filteredLinks]);

  // ── Interaction handlers ──
  const handleHoverStart = useCallback((id: string) => {
    setHoveredNodeId(id);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeClick = useCallback(
    (node: PositionedNode) => {
      // Double-duty: project nodes drill in, other nodes pin to sidebar
      if (scope === "system" && node.type === "project" && node.meta?.projectKey) {
        setScope("sessions");
        setDrillProjectKey(node.meta.projectKey as string);
        setDrillProjectLabel(node.label);
        setHoveredNodeId(null);
        setSelectedNodeId(null);
        setTransform({ x: 0, y: 0, scale: 1 });
      } else {
        setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
      }
    },
    [scope],
  );

  const handleDismissSelection = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleBack = useCallback(() => {
    setScope("system");
    setDrillProjectKey(null);
    setDrillProjectLabel(null);
    setHoveredNodeId(null);
    setSelectedNodeId(null);
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // ── Pan/zoom handlers ──
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg || !svg.getScreenCTM) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    // Convert client coords → viewBox coords. The pan/zoom <g> transform
    // lives inside the viewBox, so doing the zoom math in viewBox space
    // keeps the cursor-anchored point stable even when the SVG element's
    // pixel size doesn't match its viewBox (we clamp height to ≥500).
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x: cursorX, y: cursorY } = pt.matrixTransform(ctm.inverse());
    setTransform((prev) => computeZoomTransform(prev, cursorX, cursorY, e.deltaY));
  }, []);

  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - transform.x,
        y: e.clientY - transform.y,
      };
    },
    [transform.x, transform.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        setTransform((prev) => ({
          ...prev,
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        }));
      } else {
        onDrag(e);
      }
    },
    [onDrag],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
    } else {
      onDragEnd();
    }
  }, [onDragEnd]);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    onDragEnd();
  }, [onDragEnd]);

  // ── Filter toggle ──
  const toggleType = useCallback((type: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const hasHover = hoveredNodeId !== null;

  // ── Mobile fallback ──
  if (mobile) {
    return (
      <div className={className}>
        <MobileFallback data={data} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center min-h-[500px] ${className ?? ""}`}>
        <div className="text-sm text-muted-foreground">Loading entity graph...</div>
      </div>
    );
  }

  if (!data?.nodes?.length) {
    return (
      <div className={`flex items-center justify-center min-h-[500px] ${className ?? ""}`}>
        <div className="text-sm text-muted-foreground">No entity data available</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[calc(100vh-12rem)] min-h-[500px] ${className ?? ""}`}
    >
      {/* ── Filter bar ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
        {scope === "sessions" && (
          <>
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <span className="text-xs text-muted-foreground/40 mx-1">
              System &gt; {drillProjectLabel ?? "Project"}
            </span>
            <span className="text-xs text-muted-foreground/20 mx-1">|</span>
          </>
        )}
        {ALL_ENTITY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-opacity"
            style={{
              borderColor: NODE_COLORS[type],
              color: NODE_COLORS[type],
              opacity: enabledTypes.has(type) ? 1 : 0.3,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] }}
            />
            {type}
          </button>
        ))}
        <button
          onClick={() => setShowLabels((prev) => !prev)}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground transition-opacity"
          style={{ opacity: showLabels ? 1 : 0.3 }}
        >
          <Tag className="h-2.5 w-2.5" />
          labels
        </button>
      </div>

      {/* ── SVG Graph ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Dot grid background (static, not affected by pan/zoom) */}
        <DotGridPattern />
        <rect
          width={dimensions.width}
          height={dimensions.height}
          fill="url(#dot-grid)"
        />

        {/* Pan/zoom transform group */}
        <g
          transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}
          style={{ willChange: "transform" }}
        >
          {/* Edges layer */}
          <g className="edges">
            {filteredLinks.map((edge, i) => (
              <GraphEdge
                key={i}
                edge={edge}
                index={i}
                isHighlighted={highlightedEdges.has(i)}
                isDimmed={hasHover && !highlightedEdges.has(i)}
              />
            ))}
          </g>

          {/* Flow particles layer (paused when tab hidden) */}
          {tabVisible && <FlowParticles links={filteredLinks} />}

          {/* Nodes layer (on top) */}
          <g className="nodes">
            {filteredNodes.map((node) => (
              <GraphNode
                key={node.id}
                node={node}
                isHighlighted={highlightedNodes.has(node.id)}
                isDimmed={hasHover && !highlightedNodes.has(node.id)}
                isDragging={isDragging}
                isHovered={hoveredNodeId === node.id}
                showLabels={showLabels}
                zoomScale={transform.scale}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onClick={handleNodeClick}
                onDragStart={onDragStart}
              />
            ))}
          </g>
        </g>
      </svg>

      {/* ── Sidebar ── */}
      <GraphSidebar
        selectedNode={selectedNode}
        data={data}
        connectionCount={connectionCount}
        onDismiss={handleDismissSelection}
      />
    </div>
  );
}
