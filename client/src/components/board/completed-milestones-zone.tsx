// client/src/components/board/completed-milestones-zone.tsx

import type { MilestoneMeta } from "@shared/board-types";

interface Props {
  milestones: MilestoneMeta[];
}

/** Filter milestones where all tasks are done */
export function completedMilestones(milestones: MilestoneMeta[]): MilestoneMeta[] {
  return milestones.filter(m => m.totalTasks > 0 && m.doneTasks === m.totalTasks);
}

export function CompletedMilestonesZone({ milestones }: Props) {
  const completed = completedMilestones(milestones);

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
            {completed.map(m => (
              <div
                key={m.id}
                className="bg-card border rounded-md p-3"
              >
                <div className="flex items-center gap-2">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
