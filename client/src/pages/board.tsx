// client/src/pages/board.tsx

import { BoardHeader } from "@/components/board/board-header";
import { BoardTaskCard } from "@/components/board/board-task-card";
import { useBoardState, useBoardStats, useBoardEvents, applyBoardFilters } from "@/hooks/use-board";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useState, useMemo } from "react";
import type { BoardFilter, BoardTask } from "@shared/board-types";

export default function BoardPage() {
  const [filter, setFilter] = useState<BoardFilter>({});
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const { data: board, isLoading } = useBoardState();
  const { data: stats } = useBoardStats();
  const { connected } = useBoardEvents();

  const filteredTasks = useMemo(
    () => board ? applyBoardFilters(board.tasks, filter) : [],
    [board, filter],
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    for (const col of BOARD_COLUMNS) {
      map[col.id] = filteredTasks.filter(t => t.column === col.id);
    }
    return map;
  }, [filteredTasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <BoardHeader
        stats={stats}
        filter={filter}
        onFilterChange={setFilter}
        projects={board?.projects || []}
        milestones={board?.milestones || []}
        sseConnected={connected}
      />

      {/* Board area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-max">
          {BOARD_COLUMNS.map(col => (
            <div key={col.id} className="w-72 flex flex-col bg-muted/30 rounded-lg border">
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                  {tasksByColumn[col.id]?.length || 0}
                </span>
              </div>

              {/* Cards placeholder — replaced in Task 10 */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasksByColumn[col.id]?.map(task => (
                  <BoardTaskCard
                    key={task.id}
                    task={task}
                    onClick={setSelectedTask}
                  />
                ))}
                {(!tasksByColumn[col.id] || tasksByColumn[col.id].length === 0) && (
                  <div className="text-xs text-muted-foreground/50 text-center py-8">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
