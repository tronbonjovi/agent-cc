import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useForceGraph } from "@/hooks/use-graph";
import { useForceLayout, type PositionedNode } from "@/hooks/use-force-layout";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import { GraphSidebar } from "./GraphSidebar";
import { FlowParticles } from "./FlowParticles";
import { NODE_COLORS } from "./graph-colors";

// ── Types ──────────────────────────────────────────────────────────────

interface EntityGraphProps {
  className?: string;
}

// ── Mobile fallback ────────────────────────────────────────────────────

/**
 * Simplified list/card layout for mobile viewports where force
 * simulation would be unusable. Groups nodes by entity type.
 */
function MobileFallback({ data }: { data: ReturnType<typeof useForceGraph>["data"] }) {
  if (!data?.nodes?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No entity data available
      </div>
    );
  }

  // Group nodes by type
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
                  <div
                    key={node.id}
                    className="text-xs text-muted-foreground truncate"
                  >
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

// ── Legend ──────────────────────────────────────────────────────────────

const LEGEND_TYPES = ["project", "mcp", "skill", "plugin", "session", "tool"] as const;

function GraphLegend() {
  return (
    <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60 pointer-events-none">
      {LEGEND_TYPES.map((type) => (
        <span key={type} className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: NODE_COLORS[type] }}
          />
          {type}
        </span>
      ))}
    </div>
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

  // ── Hover subgraph highlighting ──
  // Walk edges 1-hop from hovered node to find connected subgraph
  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (!hoveredNodeId)
      return { highlightedNodes: new Set<string>(), highlightedEdges: new Set<number>() };

    const nodes = new Set<string>([hoveredNodeId]);
    const edges = new Set<number>();

    links.forEach((e, i) => {
      const sid = (e.source as PositionedNode).id;
      const tid = (e.target as PositionedNode).id;
      if (sid === hoveredNodeId || tid === hoveredNodeId) {
        edges.add(i);
        nodes.add(sid);
        nodes.add(tid);
      }
    });

    return { highlightedNodes: nodes, highlightedEdges: edges };
  }, [hoveredNodeId, links]);

  // ── Connection count for sidebar ──
  const connectionCount = useMemo(() => {
    if (!hoveredNodeId) return 0;
    return links.filter((e) => {
      const sid = (e.source as PositionedNode).id;
      const tid = (e.target as PositionedNode).id;
      return sid === hoveredNodeId || tid === hoveredNodeId;
    }).length;
  }, [hoveredNodeId, links]);

  // ── Hovered node lookup ──
  const hoveredNode = useMemo(
    () => (hoveredNodeId ? positioned.find((n) => n.id === hoveredNodeId) ?? null : null),
    [hoveredNodeId, positioned],
  );

  // ── Interaction handlers ──
  const handleHoverStart = useCallback((id: string) => {
    setHoveredNodeId(id);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleNodeClick = useCallback(
    (node: PositionedNode) => {
      // Drill-in: click project node in system scope to see its sessions
      if (scope === "system" && node.type === "project" && node.meta?.projectKey) {
        setScope("sessions");
        setDrillProjectKey(node.meta.projectKey as string);
        setDrillProjectLabel(node.label);
        setHoveredNodeId(null);
      }
    },
    [scope],
  );

  const handleBack = useCallback(() => {
    setScope("system");
    setDrillProjectKey(null);
    setDrillProjectLabel(null);
    setHoveredNodeId(null);
  }, []);

  // ── Determine if any hover is active (for dimming logic) ──
  const hasHover = hoveredNodeId !== null;

  // ── Mobile fallback ──
  if (mobile) {
    return (
      <div className={className}>
        <MobileFallback data={data} />
      </div>
    );
  }

  // ── Loading state ──
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
      {/* ── SVG Graph ── */}
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        onMouseMove={onDrag}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
      >
        {/* Dot grid background */}
        <DotGridPattern />
        <rect
          width={dimensions.width}
          height={dimensions.height}
          fill="url(#dot-grid)"
        />

        {/* Edges layer */}
        <g className="edges">
          {links.map((edge, i) => (
            <GraphEdge
              key={i}
              edge={edge}
              index={i}
              isHighlighted={highlightedEdges.has(i)}
              isDimmed={hasHover && !highlightedEdges.has(i)}
            />
          ))}
        </g>

        {/* Flow particles layer */}
        <FlowParticles links={links} />

        {/* Nodes layer (on top) */}
        <g className="nodes">
          {positioned.map((node) => (
            <GraphNode
              key={node.id}
              node={node}
              isHighlighted={highlightedNodes.has(node.id)}
              isDimmed={hasHover && !highlightedNodes.has(node.id)}
              isDragging={isDragging}
              isHovered={hoveredNodeId === node.id}
              onHoverStart={handleHoverStart}
              onHoverEnd={handleHoverEnd}
              onClick={handleNodeClick}
              onDragStart={onDragStart}
            />
          ))}
        </g>
      </svg>

      {/* ── Sidebar ── */}
      <GraphSidebar
        hoveredNode={hoveredNode}
        data={data}
        connectionCount={connectionCount}
      />

      {/* ── Breadcrumb (sessions scope) ── */}
      {scope === "sessions" && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs text-muted-foreground/40">/</span>
          <span className="text-xs text-muted-foreground">System</span>
          <span className="text-xs text-muted-foreground/40">&gt;</span>
          <span className="text-xs font-medium">
            {drillProjectLabel ?? "Project"}
          </span>
        </div>
      )}

      {/* ── Legend ── */}
      <GraphLegend />
    </div>
  );
}
