// client/src/components/tasks/milestone-controls.tsx
import {
  usePipelineStatus,
  useStartMilestone,
  usePauseMilestone,
  useResumeMilestone,
  useApproveMilestone,
  useDescopeTask,
  usePipelineEvents,
} from "../../hooks/use-pipeline";
import type { TaskItem } from "@shared/task-types";

interface MilestoneControlsProps {
  projectId: string;
  items: TaskItem[];
}

export function MilestoneControls({ projectId, items }: MilestoneControlsProps) {
  const { data: statusData } = usePipelineStatus();
  const { connected } = usePipelineEvents();
  const startMutation = useStartMilestone();
  const pauseMutation = usePauseMilestone();
  const resumeMutation = useResumeMilestone();
  const approveMutation = useApproveMilestone();
  const descopeMutation = useDescopeTask();

  const run = statusData?.run;

  // Find blocked tasks in the current run
  const blockedTasks = run
    ? items.filter((item) => item.pipelineStage === "blocked")
    : [];

  // Find milestones in the board
  const milestones = items.filter((item) => item.type === "milestone");

  // Get tasks for a milestone (tasks whose parent is the milestone)
  function getTasksForMilestone(milestoneId: string): TaskItem[] {
    return items.filter((item) => item.parent === milestoneId && item.type === "task");
  }

  function handleStartMilestone(milestone: TaskItem) {
    const tasks = getTasksForMilestone(milestone.id);
    if (tasks.length === 0) return;

    startMutation.mutate({
      milestoneTaskId: milestone.id,
      projectId,
      tasks,
      taskOrder: tasks.map((t) => t.id),
      parallelGroups: [],
    });
  }

  // No milestones — nothing to show
  if (milestones.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-300">Pipeline</h3>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
        </div>

        {/* Status display */}
        {run && (
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>Status: {run.status}</span>
            <span>${run.totalCostUsd?.toFixed(2) ?? "0.00"}</span>
          </div>
        )}
      </div>

      {/* Active run controls */}
      {run && run.status === "running" && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => pauseMutation.mutate()}
            className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500"
          >
            Pause
          </button>
        </div>
      )}

      {run && run.status === "paused" && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => resumeMutation.mutate()}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
            >
              Resume
            </button>
            {run.pauseReason?.includes("awaiting milestone review") && (
              <button
                onClick={() => approveMutation.mutate()}
                disabled={blockedTasks.length > 0}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title={blockedTasks.length > 0 ? "Resolve or descope blocked tasks first" : "Approve milestone"}
              >
                Approve Milestone
              </button>
            )}
          </div>

          {/* Blocked tasks that must be resolved before approval */}
          {blockedTasks.length > 0 && (
            <div className="rounded border border-red-900/50 bg-red-950/30 p-2">
              <div className="text-xs font-medium text-red-400 mb-1">
                {blockedTasks.length} blocked task(s) — resolve or descope before approving
              </div>
              {blockedTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between py-1">
                  <div className="text-xs text-zinc-300 truncate flex-1">
                    {task.title}
                    {task.pipelineBlockedReason && (
                      <span className="ml-2 text-zinc-500">{task.pipelineBlockedReason}</span>
                    )}
                  </div>
                  <button
                    onClick={() => descopeMutation.mutate(task.id)}
                    disabled={descopeMutation.isPending}
                    className="ml-2 rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600"
                  >
                    Descope
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Milestone list (when no active run) */}
      {!run && (
        <div className="mt-2 space-y-1">
          {milestones.map((m) => {
            const tasks = getTasksForMilestone(m.id);
            return (
              <div key={m.id} className="flex items-center justify-between rounded bg-zinc-800/50 px-2 py-1">
                <div className="text-xs text-zinc-300">
                  {m.title}
                  <span className="ml-2 text-zinc-500">({tasks.length} tasks)</span>
                </div>
                <button
                  onClick={() => handleStartMilestone(m)}
                  disabled={tasks.length === 0 || startMutation.isPending}
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {startMutation.isPending ? "Starting..." : "Work on this"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
