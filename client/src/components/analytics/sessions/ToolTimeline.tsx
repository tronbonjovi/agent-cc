import { useState, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type { ToolExecution, SerializedSessionTreeForClient } from "@shared/session-types";
import {
  PALETTE,
  colorClassForOwner,
  resolveToolOwner,
  type ToolOwner,
} from "./subagent-colors";

// Backward-compat re-exports — wave1 task004 inlined PALETTE / ToolOwner /
// colorClassForOwner / resolveToolOwner here, and `tests/tool-timeline.test.ts`
// imports them from this module by name. Wave2 task001 moved the definitions
// into `./subagent-colors`, so we re-export the originals so existing imports
// (including the wave1 test file) keep resolving without any edit.
export { PALETTE, colorClassForOwner, resolveToolOwner } from "./subagent-colors";
export type { ToolOwner } from "./subagent-colors";

/** Duration color by threshold. Exported for testing. */
export function durationColor(ms: number | null): string {
  if (ms == null) return "text-muted-foreground";
  if (ms < 1000) return "text-emerald-500";
  if (ms < 5000) return "text-amber-500";
  return "text-red-500";
}

/** Format duration in ms. Exported for testing. */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "-";
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ToolFilter {
  toolTypes?: string[];
  errorsOnly?: boolean;
}

/** Filter tool executions. Exported for testing. */
export function filterTools(tools: ToolExecution[], filter: ToolFilter): ToolExecution[] {
  let result = tools;
  if (filter.toolTypes?.length) {
    result = result.filter(t => filter.toolTypes!.includes(t.name));
  }
  if (filter.errorsOnly) {
    result = result.filter(t => t.isError);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tree-aware rendering helpers (flat-to-tree wave1 task004)
//
// PALETTE / ToolOwner / colorClassForOwner / resolveToolOwner now live in
// `./subagent-colors` (wave2 task001 extraction). They are imported and
// re-exported above for backward compatibility. The grouping helper below
// stays here because it is rendering-specific and only ToolTimeline uses it.
// ---------------------------------------------------------------------------

/**
 * One contiguous run of tools that share an issuing assistant turn. The
 * component renders one header per group when `showHeader` is true, then
 * the tools indented below it. When the tree is null/undefined the helper
 * returns a single ungrouped bucket with `showHeader: false`, which makes
 * the rendered output byte-identical to the pre-tree flat layout.
 */
export interface ToolGroup {
  /** `asst:<uuid>` of the issuing turn, or null when ungrouped. */
  turnId: string | null;
  /** Timestamp of the first tool in the group; used by the header label. */
  turnTimestamp: string | null;
  /** Whether to render an indent header above this group. */
  showHeader: boolean;
  tools: ToolExecution[];
}

/**
 * Group consecutive tools by their issuing assistant turn. Run-length
 * grouping (not bucketing) preserves chronological order — if a session
 * alternates t1 → t2 → t1, the result is three groups in that order, not
 * two merged buckets. When `tree` is missing, returns a single ungrouped
 * bucket so the renderer's flat fallback path is byte-identical to today's.
 */
export function groupToolsByAssistantTurn(
  tools: ToolExecution[],
  tree: SerializedSessionTreeForClient | null | undefined,
): ToolGroup[] {
  if (!tree) {
    return [{ turnId: null, turnTimestamp: null, showHeader: false, tools }];
  }
  const groups: ToolGroup[] = [];
  for (const tool of tools) {
    const turnId = `asst:${tool.issuedByAssistantUuid}`;
    const last = groups[groups.length - 1];
    if (last && last.turnId === turnId) {
      last.tools.push(tool);
    } else {
      groups.push({
        turnId,
        turnTimestamp: tool.timestamp || null,
        showHeader: true,
        tools: [tool],
      });
    }
  }
  return groups;
}

/** Get the primary parameter to display for a tool. */
function primaryParam(tool: ToolExecution): string {
  if (tool.filePath) return tool.filePath;
  if (tool.command) return tool.command;
  if (tool.pattern) return tool.pattern;
  return "";
}

interface ToolTimelineProps {
  tools: ToolExecution[];
  sessionStartTs?: string | null;
  /**
   * Optional session tree from `?include=tree`. When present, the component
   * groups tools by issuing assistant turn and tags subagent-owned tools with
   * a deterministic per-agent color. When null/undefined, renders a flat
   * chronological list byte-identical to the pre-tree layout.
   */
  tree?: SerializedSessionTreeForClient | null;
}

export function ToolTimeline({ tools, sessionStartTs, tree }: ToolTimelineProps) {
  const [filter, setFilter] = useState<ToolFilter>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Unique tool names for filter
  const toolNames = Array.from(new Set(tools.map(t => t.name))).sort();
  const filtered = filterTools(tools, filter);
  const sessionStart = sessionStartTs ? new Date(sessionStartTs).getTime() : null;
  // Build groups for the rendered list. When `tree` is null/undefined the
  // helper returns a single header-less bucket so the render path collapses
  // to today's flat list.
  const groups = groupToolsByAssistantTurn(filtered, tree);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleToolType = (name: string) => {
    const current = filter.toolTypes ?? [];
    const next = current.includes(name) ? current.filter(n => n !== name) : [...current, name];
    setFilter({ ...filter, toolTypes: next.length ? next : undefined });
  };

  return (
    <div className="space-y-1">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-border/20">
        {toolNames.map(name => (
          <Badge
            key={name}
            variant={filter.toolTypes?.includes(name) ? "default" : "outline"}
            className="text-[10px] px-1.5 py-0 cursor-pointer select-none"
            onClick={() => toggleToolType(name)}
          >
            {name}
          </Badge>
        ))}
        <Badge
          variant={filter.errorsOnly ? "destructive" : "outline"}
          className="text-[10px] px-1.5 py-0 cursor-pointer select-none"
          onClick={() => setFilter({ ...filter, errorsOnly: !filter.errorsOnly })}
        >
          Errors only
        </Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length}/{tools.length}</span>
      </div>

      {/* Tool list */}
      <div className="max-h-[400px] overflow-y-auto">
        {groups.map((group, gIdx) => {
          // Header rendered only when tree is present (showHeader === true).
          // The header timestamp uses HH:mm:ss for compactness; the contract
          // explicitly says "lightest-weight" — no full collapsible section.
          const headerLabel = group.turnTimestamp
            ? `Assistant turn @ ${new Date(group.turnTimestamp).toLocaleTimeString()}`
            : "Assistant turn";
          // Stable index offset across groups so React keys stay unique even
          // when run-length grouping splits a turn into multiple groups.
          let runningIdx = 0;
          for (let i = 0; i < gIdx; i++) runningIdx += groups[i].tools.length;

          return (
            <Fragment key={group.turnId ? `${group.turnId}-${gIdx}` : `flat-${gIdx}`}>
              {group.showHeader && (
                <div
                  className="flex items-center gap-2 px-4 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b border-border/10"
                  data-turn-id={group.turnId ?? undefined}
                >
                  <span className="opacity-70">{headerLabel}</span>
                </div>
              )}
              {group.tools.map((tool, tIdx) => {
                const idx = runningIdx + tIdx;
                const isExpanded = expandedIds.has(tool.callId);
                const relativeMs = sessionStart && tool.timestamp
                  ? new Date(tool.timestamp).getTime() - sessionStart
                  : null;
                const relativeStr = relativeMs != null ? `+${(relativeMs / 1000).toFixed(0)}s` : "";

                // Owner color tag — only computed when tree is present.
                const owner = tree ? resolveToolOwner(tree, tool) : null;
                const ownerColor = owner ? colorClassForOwner(owner) : "";
                const subagentId = owner?.kind === "subagent-root" ? owner.agentId : null;
                // Indent applied only in tree mode so the flat fallback stays
                // byte-identical to today's layout.
                const rowPadding = group.showHeader ? "pl-6 pr-4" : "px-4";

                return (
                  <div
                    key={`${tool.callId}-${idx}`}
                    className={`border-b border-border/10 ${tool.isError ? "bg-red-500/5" : ""}`}
                    {...(subagentId ? { "data-subagent-id": subagentId } : {})}
                  >
                    <div
                      className={`flex items-center gap-2 ${rowPadding} py-1.5 cursor-pointer hover:bg-muted/30 text-sm`}
                      onClick={() => toggleExpand(tool.callId)}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      }

                      {/* Success/error */}
                      {tool.isError
                        ? <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        : <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      }

                      {/* Tool name */}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{tool.name}</Badge>

                      {/* Subagent owner color tag — only when in tree mode and owned by a subagent */}
                      {ownerColor && (
                        <span
                          className={`text-[9px] px-1 py-0 rounded border shrink-0 ${ownerColor}`}
                          title={`subagent ${subagentId ?? ""}`}
                        >
                          sub
                        </span>
                      )}

                      {/* Primary param */}
                      <span className="text-xs truncate flex-1 text-muted-foreground">{primaryParam(tool)}</span>

                      {/* Sidechain badge */}
                      {tool.isSidechain && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                          <GitBranch className="h-2.5 w-2.5 mr-0.5" />sub
                        </Badge>
                      )}

                      {/* Duration */}
                      <span className={`text-[10px] shrink-0 ${durationColor(tool.durationMs)}`}>
                        {formatDurationMs(tool.durationMs)}
                      </span>

                      {/* Relative timestamp */}
                      <span className="text-[10px] text-muted-foreground shrink-0 w-12 text-right">{relativeStr}</span>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-10 py-2 text-xs text-muted-foreground bg-muted/20 space-y-1">
                        {tool.filePath && <div><span className="font-medium">File:</span> {tool.filePath}</div>}
                        {tool.command && <div><span className="font-medium">Command:</span> <code className="text-[11px]">{tool.command}</code></div>}
                        {tool.pattern && <div><span className="font-medium">Pattern:</span> <code className="text-[11px]">{tool.pattern}</code></div>}
                        <div><span className="font-medium">Duration:</span> {formatDurationMs(tool.durationMs)}</div>
                        {tool.timestamp && <div><span className="font-medium">Time:</span> {new Date(tool.timestamp).toLocaleTimeString()}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          No tool executions{filter.errorsOnly ? " with errors" : ""}
        </div>
      )}
    </div>
  );
}
