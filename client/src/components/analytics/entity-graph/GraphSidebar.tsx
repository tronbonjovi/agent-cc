import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { PositionedNode } from "@/hooks/use-force-layout";
import type { ForceGraphData } from "@shared/types";
import { NODE_COLORS } from "./graph-colors";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphSidebarProps {
  selectedNode: PositionedNode | null;
  data: ForceGraphData | undefined;
  connectionCount: number;
  onDismiss: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0.00";
}

/** Render type-specific metadata fields for the detail panel. */
function MetaFields({ node }: { node: PositionedNode }) {
  const meta = node.meta ?? {};

  switch (node.type) {
    case "project":
      return (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {meta.sessionCount != null && (
            <div className="flex justify-between">
              <span>Sessions</span>
              <span className="font-mono tabular-nums">{String(meta.sessionCount)}</span>
            </div>
          )}
          {Array.isArray(meta.techStack) && meta.techStack.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(meta.techStack as string[]).slice(0, 5).map((t) => (
                <Badge key={t} variant="outline" className="text-[9px] px-1 py-0">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {meta.hasClaudeMd != null && (
            <div className="flex justify-between">
              <span>CLAUDE.md</span>
              <span>{meta.hasClaudeMd ? "Yes" : "No"}</span>
            </div>
          )}
        </div>
      );

    case "session":
      return (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {meta.messageCount != null && (
            <div className="flex justify-between">
              <span>Messages</span>
              <span className="font-mono tabular-nums">{String(meta.messageCount)}</span>
            </div>
          )}
          {meta.toolCount != null && (
            <div className="flex justify-between">
              <span>Tools</span>
              <span className="font-mono tabular-nums">{String(meta.toolCount)}</span>
            </div>
          )}
          {meta.cost != null && (
            <div className="flex justify-between">
              <span>Cost</span>
              <span className="font-mono tabular-nums">{formatCost(Number(meta.cost))}</span>
            </div>
          )}
          {meta.isActive != null && (
            <div className="flex justify-between">
              <span>Status</span>
              <span className={meta.isActive ? "text-emerald-400" : "text-muted-foreground"}>
                {meta.isActive ? "Active" : "Ended"}
              </span>
            </div>
          )}
        </div>
      );

    case "mcp":
      return (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {meta.transport != null && (
            <div className="flex justify-between">
              <span>Transport</span>
              <span>{String(meta.transport)}</span>
            </div>
          )}
          {meta.command != null && (
            <div className="flex justify-between">
              <span>Command</span>
              <span className="font-mono truncate max-w-[120px]">{String(meta.command)}</span>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Sidebar overlay for the entity graph. Shows click-pinned node detail and stats.
 * Click a node to pin its details; click X to dismiss.
 */
function GraphSidebar({ selectedNode, data, connectionCount, onDismiss }: GraphSidebarProps) {
  const typeCounts = useMemo(() => {
    if (!data?.nodes) return {};
    const counts: Record<string, number> = {};
    for (const node of data.nodes) {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
    }
    return counts;
  }, [data?.nodes]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-56 flex flex-col gap-3 p-3 pointer-events-none">
      {/* ── Detail card (click-to-pin) ── */}
      <Card className="pointer-events-auto">
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground">Details</CardTitle>
          {selectedNode && (
            <button
              onClick={onDismiss}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {selectedNode ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: NODE_COLORS[selectedNode.type] }}
                />
                <div className="min-w-0">
                  <div className="font-semibold text-sm leading-tight truncate">
                    {selectedNode.label}
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 mt-1">
                    {selectedNode.type}
                  </Badge>
                </div>
              </div>
              <MetaFields node={selectedNode} />
              <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
                {connectionCount} connection{connectionCount !== 1 ? "s" : ""}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50">Click a node for details</p>
          )}
        </CardContent>
      </Card>

      {/* ── Stats card ── */}
      {data?.stats && (
        <Card className="pointer-events-auto">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Stats</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Entities</span>
              <span className="font-mono tabular-nums">{data.stats.totalEntities}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Sessions</span>
              <span className="font-mono tabular-nums">{data.stats.totalSessions}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="font-mono tabular-nums">{formatCost(data.stats.totalCost)}</span>
            </div>

            <div className="pt-1.5 mt-1.5 border-t border-border/30 space-y-1">
              {Object.entries(typeCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: NODE_COLORS[type] }}
                    />
                    <span className="text-muted-foreground flex-1">{type}</span>
                    <span className="font-mono tabular-nums text-muted-foreground/70">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { GraphSidebar };
export type { GraphSidebarProps };
