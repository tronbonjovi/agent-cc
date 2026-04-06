import type { TaskItem } from "@shared/task-types";

interface PipelineCardOverlayProps {
  task: TaskItem;
}

const stageColors: Record<string, string> = {
  queued: "bg-slate-500",
  build: "bg-blue-500",
  "ai-review": "bg-purple-500",
  "human-review": "bg-amber-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

const stageLabels: Record<string, string> = {
  queued: "Queued",
  build: "Building",
  "ai-review": "AI Review",
  "human-review": "Review",
  done: "Done",
  blocked: "Blocked",
};

export function PipelineCardOverlay({ task }: PipelineCardOverlayProps) {
  const stage = task.pipelineStage;
  if (!stage) return null;

  const colorClass = stageColors[stage] ?? "bg-slate-500";
  const label = stageLabels[stage] ?? stage;

  return (
    <div className="mt-2 space-y-1">
      {/* Stage badge */}
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${colorClass}`} />
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        {stage === "build" && (
          <span className="text-xs text-zinc-500 animate-pulse">
            {task.pipelineActivity ?? "working..."}
          </span>
        )}
      </div>

      {/* Cost */}
      {task.pipelineCost != null && task.pipelineCost > 0 && (
        <div className="text-xs text-zinc-500">
          ${task.pipelineCost.toFixed(2)} spent
        </div>
      )}

      {/* Blocked reason */}
      {stage === "blocked" && task.pipelineBlockedReason && (
        <div className="text-xs text-red-400 truncate" title={task.pipelineBlockedReason}>
          {task.pipelineBlockedReason}
        </div>
      )}

      {/* Branch */}
      {task.pipelineBranch && (
        <div className="text-xs text-zinc-600 truncate font-mono">
          {task.pipelineBranch}
        </div>
      )}
    </div>
  );
}
