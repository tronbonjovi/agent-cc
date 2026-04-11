import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type { ToolExecution } from "@shared/session-types";

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
}

export function ToolTimeline({ tools, sessionStartTs }: ToolTimelineProps) {
  const [filter, setFilter] = useState<ToolFilter>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Unique tool names for filter
  const toolNames = Array.from(new Set(tools.map(t => t.name))).sort();
  const filtered = filterTools(tools, filter);
  const sessionStart = sessionStartTs ? new Date(sessionStartTs).getTime() : null;

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
        {filtered.map((tool, idx) => {
          const isExpanded = expandedIds.has(tool.callId);
          const relativeMs = sessionStart && tool.timestamp
            ? new Date(tool.timestamp).getTime() - sessionStart
            : null;
          const relativeStr = relativeMs != null ? `+${(relativeMs / 1000).toFixed(0)}s` : "";

          return (
            <div
              key={`${tool.callId}-${idx}`}
              className={`border-b border-border/10 ${tool.isError ? "bg-red-500/5" : ""}`}
            >
              <div
                className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-muted/30 text-sm"
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
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          No tool executions{filter.errorsOnly ? " with errors" : ""}
        </div>
      )}
    </div>
  );
}
