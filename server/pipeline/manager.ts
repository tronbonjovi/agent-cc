// server/pipeline/manager.ts
import type { TaskItem } from "@shared/task-types";
import type { PipelineConfig, MilestoneRun, PipelineStage } from "./types";
import type { PipelineEventBus } from "./events";
import { BudgetTracker } from "./budget";
import { PipelineWorker } from "./worker";

interface ManagerOpts {
  config: PipelineConfig;
  events: PipelineEventBus;
  onTaskStatusChange: (taskId: string, newStatus: string) => void;
}

interface StartMilestoneOpts {
  milestoneTaskId: string;
  projectId: string;
  projectPath: string;
  baseBranch: string;
  tasks: TaskItem[];
  taskOrder: string[];
  parallelGroups: string[][];
}

export class PipelineManager {
  private config: PipelineConfig;
  private events: PipelineEventBus;
  private onTaskStatusChange: (taskId: string, newStatus: string) => void;
  private currentRun: MilestoneRun | null = null;
  private budget: BudgetTracker;
  private workers = new Map<string, PipelineWorker>();
  private activeWorkerCount = 0;
  private taskMap = new Map<string, TaskItem>();

  constructor(opts: ManagerOpts) {
    this.config = opts.config;
    this.events = opts.events;
    this.onTaskStatusChange = opts.onTaskStatusChange;
    this.budget = new BudgetTracker(this.config);
  }

  /** Start executing a milestone's tasks */
  async startMilestone(opts: StartMilestoneOpts): Promise<MilestoneRun> {
    if (this.currentRun && this.currentRun.status === "running") {
      throw new Error("milestone already running — finish or cancel the current one first");
    }

    const run: MilestoneRun = {
      id: `run-${Date.now()}`,
      milestoneTaskId: opts.milestoneTaskId,
      projectId: opts.projectId,
      projectPath: opts.projectPath,
      baseBranch: opts.baseBranch,
      milestoneBranch: `milestone/${opts.milestoneTaskId}`,
      status: "running",
      startedAt: new Date().toISOString(),
      taskOrder: opts.taskOrder,
      parallelGroups: opts.parallelGroups,
      workers: {},
      totalCostUsd: 0,
    };

    this.currentRun = run;
    this.taskMap.clear();
    for (const task of opts.tasks) {
      this.taskMap.set(task.id, task);
    }

    this.events.emit("milestone-started", {
      milestoneRunId: run.id,
      milestoneTaskId: run.milestoneTaskId,
      taskCount: opts.tasks.length,
    });

    // Start scheduling tasks
    this.scheduleNext();

    return run;
  }

  /** Get current milestone run status (or null) */
  getStatus(): MilestoneRun | null {
    return this.currentRun;
  }

  /** Pause the current milestone run */
  pause(reason: string): void {
    if (this.currentRun) {
      this.currentRun.status = "paused";
      this.currentRun.pauseReason = reason;
      this.events.emit("milestone-paused", {
        milestoneRunId: this.currentRun.id,
        reason,
      });
    }
  }

  /** Resume a paused milestone */
  resume(): void {
    if (this.currentRun && this.currentRun.status === "paused") {
      this.currentRun.status = "running";
      this.currentRun.pauseReason = undefined;
      this.scheduleNext();
    }
  }

  /** Descope a blocked task — removes it and its dependents from the milestone */
  descopeTask(taskId: string): string[] {
    if (!this.currentRun) return [];

    // Find all tasks that transitively depend on this one
    const descoped: string[] = [taskId];
    const queue = [taskId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [id, task] of this.taskMap) {
        if (descoped.includes(id)) continue;
        if (task.dependsOn?.includes(current)) {
          descoped.push(id);
          queue.push(id);
        }
      }
    }

    // Remove from task order and clean up workers
    this.currentRun.taskOrder = this.currentRun.taskOrder.filter((id) => !descoped.includes(id));
    for (const id of descoped) {
      const worker = this.workers.get(id);
      if (worker) worker.cleanup();
      this.workers.delete(id);
      this.taskMap.delete(id);
      this.onTaskStatusChange(id, "backlog"); // return to backlog
    }

    this.events.emit("task-stage-changed", {
      taskId,
      stage: "descoped",
      descoped,
      milestoneRunId: this.currentRun.id,
    });

    // Re-evaluate milestone state after descoping
    this.scheduleNext();
    return descoped;
  }

  /** Get list of blocked task IDs in current run */
  getBlockedTasks(): string[] {
    if (!this.currentRun) return [];
    return [...this.workers.entries()]
      .filter(([, w]) => w.getState().stage === "blocked")
      .map(([id]) => id);
  }

  /** Approve milestone completion — requires zero blocked tasks, runs integration gate */
  async approveMilestone(): Promise<{ approved: boolean; reason?: string }> {
    if (!this.currentRun) return { approved: false, reason: "no active milestone" };

    // Gate: no blocked tasks allowed
    const blocked = this.getBlockedTasks();
    if (blocked.length > 0) {
      return {
        approved: false,
        reason: `${blocked.length} blocked task(s) remain — descope or resolve them before approving`,
      };
    }

    // Integration gate placeholder (Task 12 wires this up)
    this.events.emit("task-progress", {
      milestoneRunId: this.currentRun.id,
      activity: "running milestone integration gate — merging branches and testing",
    });

    this.currentRun.status = "completed";
    this.currentRun.completedAt = new Date().toISOString();

    // Cleanup all worktrees
    for (const worker of this.workers.values()) {
      await worker.cleanup();
    }
    this.workers.clear();

    this.events.emit("milestone-completed", {
      milestoneRunId: this.currentRun.id,
      totalCostUsd: this.currentRun.totalCostUsd,
    });

    this.currentRun = null;
    return { approved: true };
  }

  private scheduleNext(): void {
    if (!this.currentRun || this.currentRun.status !== "running") return;

    // Find tasks that are ready to run
    const completedTasks = new Set<string>();
    const blockedTasks = new Set<string>();
    const inProgressTasks = new Set<string>();

    for (const [taskId, worker] of this.workers) {
      const state = worker.getState();
      if (state.stage === "human-review" || state.stage === "done") {
        completedTasks.add(taskId);
      } else if (state.stage === "blocked") {
        blockedTasks.add(taskId);
      } else {
        inProgressTasks.add(taskId);
      }
    }

    this.activeWorkerCount = inProgressTasks.size;

    // Check if milestone is complete or stalled
    const allTaskIds = new Set(this.currentRun.taskOrder);
    const finishedOrBlocked = new Set([...completedTasks, ...blockedTasks]);
    const notStarted = [...allTaskIds].filter(
      (id) => !finishedOrBlocked.has(id) && !inProgressTasks.has(id)
    );

    if (notStarted.length === 0 && inProgressTasks.size === 0) {
      if (blockedTasks.size > 0 && completedTasks.size < allTaskIds.size) {
        this.currentRun.status = "stalled";
        this.events.emit("milestone-stalled", {
          milestoneRunId: this.currentRun.id,
          blockedCount: blockedTasks.size,
        });
      } else {
        this.pause("all tasks complete — awaiting milestone review");
      }
      return;
    }

    // Schedule next available tasks up to concurrency limit
    for (const taskId of this.currentRun.taskOrder) {
      if (this.activeWorkerCount >= this.config.maxConcurrentWorkers) break;
      if (this.workers.has(taskId)) continue;

      const task = this.taskMap.get(taskId);
      if (!task) continue;
      const deps = task.dependsOn ?? [];
      const depsResolved = deps.every((d) => completedTasks.has(d));
      if (!depsResolved) continue;

      this.launchWorker(task);
      this.activeWorkerCount++;
    }
  }

  private launchWorker(task: TaskItem): void {
    if (!this.currentRun) return;

    const worker = new PipelineWorker({
      task,
      milestoneRunId: this.currentRun.id,
      repoPath: this.currentRun.projectPath,
      baseBranch: this.currentRun.baseBranch,
      config: this.config,
      budget: this.budget,
      events: this.events,
      onStageChange: (taskId: string, stage: PipelineStage) => {
        this.onTaskStatusChange(taskId, stage);
        if (this.currentRun) {
          this.currentRun.workers[taskId] = worker.getState();
          this.currentRun.totalCostUsd = [...this.workers.values()]
            .reduce((sum, w) => sum + w.getState().totalCostUsd, 0);
        }
        if (stage === "human-review" || stage === "blocked" || stage === "done") {
          this.scheduleNext();
        }
      },
    });

    this.workers.set(task.id, worker);

    worker.run().catch((err) => {
      console.error(`[pipeline] Worker for task ${task.id} crashed:`, err);
      this.onTaskStatusChange(task.id, "blocked");
      this.scheduleNext();
    });
  }
}
