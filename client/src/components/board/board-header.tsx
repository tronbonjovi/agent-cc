// client/src/components/board/board-header.tsx

import { BoardFilters } from "./board-filters";
import type { BoardStats, BoardFilter, ProjectMeta, MilestoneMeta } from "@shared/board-types";

interface BoardHeaderProps {
  stats?: BoardStats;
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
  sseConnected: boolean;
}

export function BoardHeader({ stats, filter, onFilterChange, projects, milestones, sseConnected }: BoardHeaderProps) {
  return (
    <div className="px-5 py-3 border-b space-y-2.5">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Board</h1>
          {!sseConnected && (
            <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              Reconnecting...
            </span>
          )}
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{stats.totalTasks} tasks</span>
            <span>{stats.byColumn["in-progress"]} active</span>
            {stats.activeAgents > 0 && (
              <span className="text-blue-500">{stats.activeAgents} agent{stats.activeAgents !== 1 ? "s" : ""}</span>
            )}
            {stats.flaggedCount > 0 && (
              <span className="text-amber-500">{stats.flaggedCount} flagged</span>
            )}
            {stats.totalSpend > 0 && (
              <span>${stats.totalSpend.toFixed(2)} spent</span>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <BoardFilters
        filter={filter}
        onFilterChange={onFilterChange}
        milestones={milestones}
      />
    </div>
  );
}
