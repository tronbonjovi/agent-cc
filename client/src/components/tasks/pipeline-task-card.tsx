import { cn } from "@/lib/utils";
import type { TaskItem } from "@shared/task-types";

interface PipelineTaskCardProps {
  task: TaskItem;
  onClick: () => void;
}

const stageStyles: Record<string, { border: string; textMuted?: boolean; pulse?: boolean }> = {
  backlog:        { border: "border-l-zinc-600" },
  queued:         { border: "border-l-zinc-500" },
  build:          { border: "border-l-blue-500", pulse: true },
  "ai-review":    { border: "border-l-purple-500", pulse: true },
  "human-review": { border: "border-l-amber-500" },
  done:           { border: "border-l-green-500", textMuted: true },
  blocked:        { border: "border-l-red-500" },
};

export function PipelineTaskCard({ task, onClick }: PipelineTaskCardProps) {
  const stage = task.pipelineStage || "backlog";
  const isBlocked = stage === "blocked";
  const isDone = stage === "done";
  const isActive = stage === "build" || stage === "ai-review";
  const style = stageStyles[stage] || stageStyles.backlog;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3 cursor-pointer transition-colors",
        "hover:border-border/80 border-l-[3px]",
        style.border,
        isDone && "opacity-50",
        isBlocked && "bg-red-950/20 border-red-900/50",
      )}
    >
      <div className="text-sm font-medium leading-tight">{task.title}</div>

      {/* Priority badge for backlog/queued */}
      {(stage === "backlog" || stage === "queued") && task.priority && (
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium mt-1.5 inline-block",
          task.priority === "high" && "bg-red-500/15 text-red-400",
          task.priority === "medium" && "bg-amber-500/15 text-amber-400",
          task.priority === "low" && "bg-blue-500/15 text-blue-400",
        )}>
          {task.priority}
        </span>
      )}

      {/* Active stage: activity + branch + cost */}
      {isActive && (
        <div className="mt-2 space-y-1">
          <div className={cn("text-xs animate-pulse", stage === "build" ? "text-blue-400" : "text-purple-400")}>
            {task.pipelineActivity ?? "working..."}
          </div>
          {task.pipelineBranch && (
            <div className="text-[10px] text-zinc-600 font-mono truncate">{task.pipelineBranch}</div>
          )}
          {task.pipelineCost != null && task.pipelineCost > 0 && (
            <div className="text-[10px] text-zinc-500">${task.pipelineCost.toFixed(2)}</div>
          )}
        </div>
      )}

      {/* Human review: branch + cost, attention-seeking */}
      {stage === "human-review" && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-amber-400">awaiting review</div>
          {task.pipelineBranch && (
            <div className="text-[10px] text-zinc-600 font-mono truncate">{task.pipelineBranch}</div>
          )}
          {task.pipelineCost != null && (
            <div className="text-[10px] text-zinc-500">${task.pipelineCost.toFixed(2)}</div>
          )}
        </div>
      )}

      {/* Done: just cost */}
      {isDone && task.pipelineCost != null && (
        <div className="mt-1.5 text-[10px] text-zinc-600">${task.pipelineCost.toFixed(2)}</div>
      )}

      {/* Blocked: reason + descope hint */}
      {isBlocked && (
        <div className="mt-2 space-y-1">
          {task.pipelineBlockedReason && (
            <div className="text-xs text-red-400 truncate" title={task.pipelineBlockedReason}>
              {task.pipelineBlockedReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Card for unknown-stage tasks in the error row */
export function UnknownStageCard({ task, onClick }: PipelineTaskCardProps) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 cursor-pointer"
    >
      <div className="text-sm font-medium text-amber-300">{task.title}</div>
      <div className="text-xs text-amber-500 mt-1">Unknown stage: {task.pipelineStage}</div>
      <div className="text-[10px] text-amber-600 mt-1">Unrecognized state — refresh the page or cancel the milestone to recover.</div>
    </div>
  );
}
