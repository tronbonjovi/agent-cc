import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ToolExecution } from "@shared/session-types";

interface FileEntry {
  path: string;
  reads: number;
  writes: number;
  edits: number;
  firstTouch: string;
  lastTouch: string;
}

/** Group tool executions by directory. Exported for testing. */
export function groupByDirectory(tools: ToolExecution[]): Map<string, FileEntry[]> {
  // Aggregate per file
  const fileMap = new Map<string, FileEntry>();
  for (const tool of tools) {
    if (!tool.filePath) continue;
    const existing = fileMap.get(tool.filePath);
    if (existing) {
      if (tool.name === "Read") existing.reads++;
      else if (tool.name === "Write") existing.writes++;
      else if (tool.name === "Edit") existing.edits++;
      if (tool.timestamp < existing.firstTouch) existing.firstTouch = tool.timestamp;
      if (tool.timestamp > existing.lastTouch) existing.lastTouch = tool.timestamp;
    } else {
      fileMap.set(tool.filePath, {
        path: tool.filePath,
        reads: tool.name === "Read" ? 1 : 0,
        writes: tool.name === "Write" ? 1 : 0,
        edits: tool.name === "Edit" ? 1 : 0,
        firstTouch: tool.timestamp,
        lastTouch: tool.timestamp,
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

interface FileImpactProps {
  tools: ToolExecution[];
}

export function FileImpact({ tools }: FileImpactProps) {
  const groups = groupByDirectory(tools);
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
                    return (
                      <div key={file.path} className="flex items-center gap-3 text-xs py-0.5 px-1">
                        <span className="truncate flex-1 text-muted-foreground">{fileName}</span>
                        {file.reads > 0 && <span className="text-blue-400" title="Reads">R:{file.reads}</span>}
                        {file.edits > 0 && <span className="text-amber-400" title="Edits">E:{file.edits}</span>}
                        {file.writes > 0 && <span className="text-emerald-400" title="Writes">W:{file.writes}</span>}
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
