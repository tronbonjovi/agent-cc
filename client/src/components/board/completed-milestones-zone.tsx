// client/src/components/board/completed-milestones-zone.tsx

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MilestoneMeta, BoardTask } from "@shared/board-types";

interface Props {
  milestones: MilestoneMeta[];
  completedTasks: BoardTask[];
}

/** Filter milestones where all tasks are done */
export function completedMilestones(milestones: MilestoneMeta[]): MilestoneMeta[] {
  return milestones.filter(m => m.totalTasks > 0 && m.doneTasks === m.totalTasks);
}

/** Get tasks belonging to a specific milestone */
export function tasksForMilestone(tasks: BoardTask[], milestoneId: string): BoardTask[] {
  return tasks.filter(t => t.milestoneId === milestoneId);
}

export function CompletedMilestonesZone({ milestones, completedTasks }: Props) {
  const completed = completedMilestones(milestones);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2 border-b shrink-0">
        <h2 className="text-sm font-semibold">Completed</h2>
        <span className="text-xs text-muted-foreground">
          {completed.length} milestone{completed.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Vertically stacked completed milestone cards */}
      <div className="flex-1 overflow-y-auto p-2">
        {completed.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 text-center py-8">
            No completed milestones
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {completed.map(m => {
              const tasks = tasksForMilestone(completedTasks, m.id);
              const isExpanded = expandedIds.has(m.id);
              const canExpand = tasks.length > 0;

              return (
                <div key={m.id} className="bg-card border rounded-md">
                  <div
                    className={`p-3 ${canExpand ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
                    onClick={canExpand ? () => toggleExpand(m.id) : undefined}
                  >
                    <div className="flex items-center gap-2">
                      {canExpand && (
                        <ChevronRight
                          className={`h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      )}
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="text-sm font-medium truncate flex-1">{m.title}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex-shrink-0">
                        done
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {m.doneTasks}/{m.totalTasks} tasks
                      </span>
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full w-full" />
                      </div>
                    </div>
                  </div>

                  {/* Expanded task list */}
                  {isExpanded && tasks.length > 0 && (
                    <div className="border-t px-3 py-2 flex flex-col gap-1.5">
                      {tasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 text-xs py-1 px-1.5 rounded hover:bg-muted/30">
                          <span className="text-emerald-500 flex-shrink-0">✓</span>
                          <span className="truncate flex-1 text-muted-foreground">{task.title}</span>
                          {task.lastSession?.model && (
                            <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                              {task.lastSession.model}
                            </span>
                          )}
                          {task.lastSession?.costUsd != null && task.lastSession.costUsd > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0">
                              ${task.lastSession.costUsd.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
