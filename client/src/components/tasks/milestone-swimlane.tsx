import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_COLUMNS,
  MILESTONE_BADGES,
  NON_TERMINAL_STATES,
  stageToColumn,
  isKnownStage,
  topoSortTasks,
  resolveTaskStage,
} from "@/lib/pipeline-stages";
import {
  useStartMilestone,
  usePauseMilestone,
  useResumeMilestone,
  useApproveMilestone,
  useDescopeTask,
} from "@/hooks/use-pipeline";
import { PipelineTaskCard, UnknownStageCard } from "./pipeline-task-card";
import type { TaskItem } from "@shared/task-types";
import type { MilestoneRun } from "../../types/pipeline";

interface MilestoneSwimlaneProps {
  milestone: TaskItem;
  tasks: TaskItem[];
  removedTasks: TaskItem[];
  projectId: string;
  run: MilestoneRun | null;
  anyMilestoneActive: boolean;
  onClickTask: (task: TaskItem) => void;
}

export function MilestoneSwimlane({
  milestone,
  tasks,
  removedTasks,
  projectId,
  run,
  anyMilestoneActive,
  onClickTask,
}: MilestoneSwimlaneProps) {
  const isThisRun = run?.milestoneTaskId === milestone.id;
  const milestoneStatus = isThisRun ? run!.status : "not_started";
  const effectiveStatus = milestoneStatus === "completed" ? "completed"
    : milestoneStatus === "cancelled" ? "cancelled"
    : milestoneStatus;

  const badge = MILESTONE_BADGES[effectiveStatus] || MILESTONE_BADGES.not_started;

  const [expanded, setExpanded] = useState(
    NON_TERMINAL_STATES.has(effectiveStatus) || effectiveStatus === "not_started"
  );
  const [showRemoved, setShowRemoved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const startMutation = useStartMilestone();
  const pauseMutation = usePauseMilestone();
  const resumeMutation = useResumeMilestone();
  const approveMutation = useApproveMilestone();
  const descopeMutation = useDescopeTask();

  // Distribute tasks into columns
  const columnTasks: Record<string, TaskItem[]> = {};
  const unknownTasks: TaskItem[] = [];
  for (const col of PIPELINE_COLUMNS) {
    columnTasks[col.id] = [];
  }

  for (const task of tasks) {
    const stage = resolveTaskStage(task.pipelineStage, task.status);
    if (stage === "blocked") {
      const fromStage = task.blockedFromStage;
      const col = fromStage ? stageToColumn(fromStage) : null;
      if (col && col !== "unknown" && columnTasks[col]) {
        columnTasks[col].push(task);
      } else {
        unknownTasks.push(task);
      }
    } else {
      const col = stageToColumn(stage);
      if (col === "unknown") {
        unknownTasks.push(task);
      } else if (col && columnTasks[col]) {
        columnTasks[col].push(task);
      }
    }
  }

  // Accounting
  const activeTasks = tasks.filter((t) =>
    t.pipelineStage !== "descoped" && t.pipelineStage !== "cancelled"
  );
  const doneTasks = activeTasks.filter((t) => t.pipelineStage === "done");
  const hasUnknown = unknownTasks.some((t) => !isKnownStage(t.pipelineStage || ""));
  const hasBlocked = activeTasks.some((t) => resolveTaskStage(t.pipelineStage, t.status) === "blocked");
  const totalCost = isThisRun ? run!.totalCostUsd : 0;

  function handleStart() {
    if (activeTasks.length === 0) return;
    startMutation.mutate({
      milestoneTaskId: milestone.id,
      projectId,
      taskOrder: topoSortTasks(activeTasks),
      parallelGroups: [],
    });
  }

  function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    fetch("/api/pipeline/milestone/cancel", { method: "POST" }).then(() => {
      setConfirmCancel(false);
    });
  }

  const canStart = !anyMilestoneActive && activeTasks.length > 0;
  const canApprove = effectiveStatus === "awaiting_approval" && !hasUnknown && !hasBlocked;

  // suppress unused variable warning — descopeMutation is available for child components
  void descopeMutation;

  return (
    <div className="border-b border-zinc-800">
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5 cursor-pointer",
          "hover:bg-zinc-800/30 transition-colors",
          NON_TERMINAL_STATES.has(effectiveStatus) && "bg-zinc-800/20",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
          <span className="font-medium text-sm">{milestone.title}</span>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", badge.color, badge.pulse && "animate-pulse")}>
            {badge.label}
          </span>
          {hasUnknown && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {unknownTasks.filter((t) => !isKnownStage(t.pipelineStage || "")).length} unmapped
            </span>
          )}
          {hasBlocked && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
              {activeTasks.filter((t) => resolveTaskStage(t.pipelineStage, t.status) === "blocked").length} blocked
            </span>
          )}
          {removedTasks.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowRemoved(!showRemoved); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 hover:text-zinc-300"
            >
              {removedTasks.length} removed
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-zinc-500" onClick={(e) => e.stopPropagation()}>
          <span>{doneTasks.length}/{activeTasks.length} tasks</span>
          {totalCost > 0 && <span>${totalCost.toFixed(2)}</span>}

          {/* Controls */}
          {effectiveStatus === "not_started" && (
            <button
              onClick={handleStart}
              disabled={!canStart || startMutation.isPending}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!canStart ? "Another milestone is active" : undefined}
            >
              {startMutation.isPending ? "Starting..." : "Start"}
            </button>
          )}
          {effectiveStatus === "running" && (
            <>
              <button onClick={() => pauseMutation.mutate()} className="rounded bg-yellow-600 px-2.5 py-1 text-xs text-white hover:bg-yellow-500">
                Pause
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
          {effectiveStatus === "paused" && (
            <>
              <button onClick={() => resumeMutation.mutate()} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500">
                Resume
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
          {effectiveStatus === "awaiting_approval" && (
            <>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={!canApprove || approveMutation.isPending}
                className="rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title={hasUnknown ? `Cannot approve — ${unknownTasks.length} task(s) in unknown state` : hasBlocked ? `Cannot approve — blocked tasks remain` : undefined}
              >
                Approve
              </button>
              <button onClick={handleCancel} className={cn("rounded px-2.5 py-1 text-xs text-white", confirmCancel ? "bg-red-600 hover:bg-red-500" : "bg-zinc-700 hover:bg-zinc-600")}>
                {confirmCancel ? "Confirm Cancel" : "Cancel"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded: task grid */}
      {expanded && (
        <div className="flex min-h-[80px]">
          {PIPELINE_COLUMNS.map((col) => (
            <div key={col.id} className={cn("flex-1 min-w-0 p-2 border-r border-zinc-800/50 last:border-r-0", col.bgTint)}>
              <div className="space-y-2">
                {columnTasks[col.id].map((task) => (
                  <PipelineTaskCard key={task.id} task={task} onClick={() => onClickTask(task)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error row for unknown-stage tasks */}
      {expanded && unknownTasks.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/10 border-t border-amber-900/30">
          <div className="text-[10px] text-amber-500 mb-1.5 font-medium">Unmapped Tasks</div>
          <div className="flex gap-2 flex-wrap">
            {unknownTasks.map((task) => (
              <UnknownStageCard key={task.id} task={task} onClick={() => onClickTask(task)} />
            ))}
          </div>
        </div>
      )}

      {/* Removed tasks audit row */}
      {showRemoved && removedTasks.length > 0 && (
        <div className="px-4 py-2 bg-zinc-900/50 border-t border-zinc-800">
          <div className="text-[10px] text-zinc-500 mb-1.5 font-medium">Removed Tasks</div>
          {removedTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-1 text-xs text-zinc-500">
              <span className="text-zinc-400">{task.title}</span>
              <span className="text-[10px]">{task.pipelineStage}</span>
              {task.removedFromStage && <span className="text-[10px]">from {task.removedFromStage}</span>}
              {task.removedAt && <span className="text-[10px]">{task.removedAt}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
