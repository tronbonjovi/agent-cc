import { cn } from "@/lib/utils";
import { PIPELINE_COLUMNS, NON_TERMINAL_STATES, stageToColumn, resolveTaskStage } from "@/lib/pipeline-stages";
import { usePipelineStatus, usePipelineEvents } from "@/hooks/use-pipeline";
import { MilestoneSwimlane } from "./milestone-swimlane";
import type { TaskItem } from "@shared/task-types";

interface PipelineBoardProps {
  items: TaskItem[];
  removedItems: TaskItem[];
  projectId: string;
  onClickTask: (task: TaskItem) => void;
}

export function PipelineBoard({ items, removedItems, projectId, onClickTask }: PipelineBoardProps) {
  const { connected } = usePipelineEvents();
  const { data: statusData } = usePipelineStatus(connected);

  const run = statusData?.run ?? null;
  const anyMilestoneActive = run ? NON_TERMINAL_STATES.has(run.status) : false;

  // Find milestones
  const milestones = items.filter((item) => item.type === "milestone");

  // Group tasks by milestone
  function getTasksForMilestone(milestoneId: string): TaskItem[] {
    return items.filter((item) => item.parent === milestoneId && item.type === "task");
  }
  function getRemovedForMilestone(milestoneId: string): TaskItem[] {
    return removedItems.filter((item) => item.parent === milestoneId);
  }

  // Orphan tasks (no parent or parent is not a milestone)
  const milestoneIds = new Set(milestones.map((m) => m.id));
  const orphanTasks = items.filter(
    (item) => item.type === "task" && (!item.parent || !milestoneIds.has(item.parent))
  );

  if (milestones.length === 0 && orphanTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="text-muted-foreground">No milestones found for this project</div>
        <div className="text-sm text-muted-foreground/60">Create a plan document and run plan-to-roadmap to populate this board</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* SSE status banner */}
      {!connected && (
        <div className="px-4 py-1.5 bg-amber-950/30 border-b border-amber-900/30 text-xs text-amber-400">
          Live updates disconnected — refresh to restore
        </div>
      )}

      {/* Column headers */}
      <div className="flex border-b border-zinc-800 sticky top-0 bg-background z-10">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.id} className={cn("flex-1 min-w-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider", col.color)}>
            {col.label}
          </div>
        ))}
      </div>

      {/* Milestone swimlanes */}
      <div className="flex-1 overflow-y-auto">
        {milestones.map((milestone) => (
          <MilestoneSwimlane
            key={milestone.id}
            milestone={milestone}
            tasks={getTasksForMilestone(milestone.id)}
            removedTasks={getRemovedForMilestone(milestone.id)}
            projectId={projectId}
            run={run}
            anyMilestoneActive={anyMilestoneActive}
            onClickTask={onClickTask}
          />
        ))}

        {/* Orphan tasks without a milestone */}
        {orphanTasks.length > 0 && (
          <div className="border-b border-zinc-800">
            <div className="px-4 py-2.5 text-sm font-medium text-zinc-500">Unassigned Tasks</div>
            <div className="flex min-h-[60px]">
              {PIPELINE_COLUMNS.map((col) => (
                <div key={col.id} className="flex-1 min-w-0 p-2 border-r border-zinc-800/50 last:border-r-0">
                  {orphanTasks
                    .filter((task) => (stageToColumn(resolveTaskStage(task.pipelineStage, task.status)) || "backlog") === col.id)
                    .map((task) => (
                    <div key={task.id} onClick={() => onClickTask(task)} className="rounded-lg border bg-card p-3 cursor-pointer text-sm mb-2">
                      {task.title}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
