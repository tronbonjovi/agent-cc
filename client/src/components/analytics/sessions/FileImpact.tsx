import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ToolExecution, SerializedSessionTreeForClient } from "@shared/session-types";
import { resolveToolOwner, colorClassForOwner } from "./subagent-colors";

interface FileEntry {
  path: string;
  reads: number;
  writes: number;
  edits: number;
  firstTouch: string;
  lastTouch: string;
  /** agentId → op count for this file. Key `null` = parent session-root. */
  ownerCounts: Map<string | null, number>;
}

/**
 * Tree-aware grouping helper. Same per-file aggregation logic as the original
 * `groupByDirectory` (reads/writes/edits + first/last touch + directory bucket),
 * plus per-tool owner attribution via `resolveToolOwner`. The owner is mapped
 * to a `Map` key (`null` for session-root, `agentId` for subagent-root) and
 * the per-file `ownerCounts` is incremented per tool. Pure / exported for
 * testing — no React. (flat-to-tree wave2 task004)
 */
export function groupByDirectoryWithOwners(
  tools: ToolExecution[],
  tree: SerializedSessionTreeForClient | null | undefined,
): Map<string, FileEntry[]> {
  // Aggregate per file
  const fileMap = new Map<string, FileEntry>();
  for (const tool of tools) {
    if (!tool.filePath) continue;
    const owner = resolveToolOwner(tree, tool);
    const ownerKey: string | null =
      owner.kind === "subagent-root" ? owner.agentId : null;

    const existing = fileMap.get(tool.filePath);
    if (existing) {
      if (tool.name === "Read") existing.reads++;
      else if (tool.name === "Write") existing.writes++;
      else if (tool.name === "Edit") existing.edits++;
      if (tool.timestamp < existing.firstTouch) existing.firstTouch = tool.timestamp;
      if (tool.timestamp > existing.lastTouch) existing.lastTouch = tool.timestamp;
      existing.ownerCounts.set(ownerKey, (existing.ownerCounts.get(ownerKey) ?? 0) + 1);
    } else {
      const ownerCounts = new Map<string | null, number>();
      ownerCounts.set(ownerKey, 1);
      fileMap.set(tool.filePath, {
        path: tool.filePath,
        reads: tool.name === "Read" ? 1 : 0,
        writes: tool.name === "Write" ? 1 : 0,
        edits: tool.name === "Edit" ? 1 : 0,
        firstTouch: tool.timestamp,
        lastTouch: tool.timestamp,
        ownerCounts,
      });
    }
  }

  // Group by directory
  const groups = new Map<string, FileEntry[]>();
  for (const entry of Array.from(fileMap.values())) {
    const lastSlash = entry.path.lastIndexOf("/");
    const dir = lastSlash > 0 ? entry.path.slice(0, lastSlash) : ".";
    const existing = groups.get(dir) ?? [];
    existing.push(entry);
    groups.set(dir, existing);
  }

  return groups;
}

/**
 * Backward-compat alias for the original (non-tree-aware) grouping. Existing
 * call sites that don't have a tree on hand still work — every entry will
 * have `ownerCounts = new Map([[null, totalOps]])`, which the rendering path
 * treats as "no subagent dots" (byte-identical to pre-task output).
 */
export function groupByDirectory(tools: ToolExecution[]): Map<string, FileEntry[]> {
  return groupByDirectoryWithOwners(tools, null);
}

interface FileImpactProps {
  tools: ToolExecution[];
  /** Optional session tree for subagent owner attribution (?include=tree). */
  tree?: SerializedSessionTreeForClient | null;
}

export function FileImpact({ tools, tree }: FileImpactProps) {
  const groups = groupByDirectoryWithOwners(tools, tree);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  if (groups.size === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No file operations in this session</div>;
  }

  const toggleDir = (dir: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  // Sort directories by file count descending
  const sortedDirs = Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="p-4 space-y-1">
      {sortedDirs.map(([dir, files]) => {
        const isCollapsed = collapsedDirs.has(dir);
        const totalOps = files.reduce((sum, f) => sum + f.reads + f.writes + f.edits, 0);

        return (
          <div key={dir}>
            <button
              onClick={() => toggleDir(dir)}
              className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/30 rounded text-sm"
            >
              {isCollapsed
                ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 text-muted-foreground" />
              }
              <span className="font-medium text-xs">{dir}/</span>
              <span className="text-[10px] text-muted-foreground">{files.length} files, {totalOps} ops</span>
            </button>

            {!isCollapsed && (
              <div className="ml-5 space-y-0.5">
                {files
                  .sort((a, b) => (b.reads + b.writes + b.edits) - (a.reads + a.writes + a.edits))
                  .map(file => {
                    const fileName = file.path.slice(dir.length + 1);
                    // Subagent owner dots — skip the null parent-session entry,
                    // sort by op count desc, take top 3. Empty list when there
                    // are no subagent owners (or no tree) → byte-identical row.
                    const subagentOwners = Array.from(file.ownerCounts.entries())
                      .filter(([key]) => key !== null)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3) as Array<[string, number]>;
                    return (
                      <div key={file.path} className="flex items-center gap-3 text-xs py-0.5 px-1">
                        <span className="truncate flex-1 text-muted-foreground">{fileName}</span>
                        {file.reads > 0 && <span className="text-blue-400" title="Reads">R:{file.reads}</span>}
                        {file.edits > 0 && <span className="text-amber-400" title="Edits">E:{file.edits}</span>}
                        {file.writes > 0 && <span className="text-emerald-400" title="Writes">W:{file.writes}</span>}
                        {subagentOwners.length > 0 && (
                          <span className="flex items-center gap-1 shrink-0">
                            {subagentOwners.map(([agentId, count]) => {
                              const colorClass = colorClassForOwner({ kind: "subagent-root", agentId });
                              const subagentNode = tree?.subagentsByAgentId?.[agentId] as
                                | { agentType?: string }
                                | undefined;
                              const agentType = subagentNode?.agentType ?? agentId;
                              return (
                                <span
                                  key={agentId}
                                  className={`inline-block h-2 w-2 rounded-full border ${colorClass}`}
                                  title={`${agentType}: ${count} ops`}
                                />
                              );
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
