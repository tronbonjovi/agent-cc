// server/pipeline/manager.ts
import type { TaskItem } from "@shared/task-types";
import type { PipelineConfig, MilestoneRun, PipelineStage } from "./types";
import type { PipelineEventBus } from "./events";
import { BudgetTracker } from "./budget";
import { PipelineWorker } from "./worker";
import { createTaskWorktree, removeWorktree } from "./git-ops";
import { execFileSync } from "child_process";

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
    if (this.currentRun) {
      throw new Error(`milestone already exists (status: ${this.currentRun.status}) — approve or cancel it first`);
    }

    // Safety: parallel scheduling is not yet implemented. Hard-block concurrency > 1
    // regardless of parallelGroups to prevent overlapping edits and nondeterministic merges.
    if (this.config.maxConcurrentWorkers > 1) {
      throw new Error("maxConcurrentWorkers > 1 is not yet supported — parallel safety enforcement is not implemented");
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

  /** Pause the current milestone run — signals active workers to stop at next checkpoint */
  pause(reason: string): void {
    if (this.currentRun) {
      this.currentRun.status = "paused";
      this.currentRun.pauseReason = reason;
      // Signal all active workers to stop
      for (const worker of Array.from(this.workers.values())) {
        worker.pause();
      }
      this.events.emit("milestone-paused", {
        milestoneRunId: this.currentRun.id,
        reason,
      });
    }
  }

  /** Resume a paused milestone — relaunches paused workers and continues scheduling */
  resume(): void {
    if (this.currentRun && this.currentRun.status === "paused") {
      this.currentRun.status = "running";
      this.currentRun.pauseReason = undefined;
      // Relaunch workers that were paused mid-execution (their run() returned on PausedError)
      for (const [taskId, worker] of Array.from(this.workers)) {
        worker.resume();
        const state = worker.getState();
        // If worker was paused mid-build (activity says "paused"), relaunch it
        if (state.currentActivity === "paused" && state.stage !== "human-review" && state.stage !== "done" && state.stage !== "blocked") {
          const task = this.taskMap.get(taskId);
          if (task) {
            // Remove the stale worker and relaunch
            this.workers.delete(taskId);
            this.launchWorker(task);
          }
        }
      }
      this.scheduleNext();
    }
  }

  /** Descope a blocked task — removes it and its dependents from the milestone.
   *  Only blocked tasks can be descoped. Active/queued tasks must be paused or cancelled first. */
  descopeTask(taskId: string): string[] {
    if (!this.currentRun) return [];

    // Only allow descoping blocked tasks to prevent tearing down live workers
    const worker = this.workers.get(taskId);
    if (worker && worker.getState().stage !== "blocked") {
      return []; // Refuse — task is not blocked
    }

    // Find all tasks that transitively depend on this one
    const descoped: string[] = [taskId];
    const queue = [taskId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [id, task] of Array.from(this.taskMap)) {
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

    // Re-evaluate milestone state after descoping — recover from stalled if blockers removed
    if (this.currentRun.status === "stalled") {
      // Check if any blocked tasks remain
      const remainingBlocked = this.getBlockedTasks();
      if (remainingBlocked.length === 0) {
        // Recover: transition to running so scheduleNext can re-evaluate
        this.currentRun.status = "running";
      }
    }
    this.scheduleNext();
    return descoped;
  }

  /** Get list of blocked task IDs in current run */
  getBlockedTasks(): string[] {
    if (!this.currentRun) return [];
    return Array.from(this.workers.entries())
      .filter(([, w]) => w.getState().stage === "blocked")
      .map(([id]) => id);
  }

  /** Approve milestone completion — requires paused state, all tasks terminal, zero blocked */
  async approveMilestone(): Promise<{ approved: boolean; reason?: string; milestoneBranch?: string }> {
    if (!this.currentRun) return { approved: false, reason: "no active milestone" };

    // Gate: must be paused (awaiting review), not running or stalled
    if (this.currentRun.status !== "paused") {
      return {
        approved: false,
        reason: `milestone is ${this.currentRun.status} — must be paused (awaiting review) before approval`,
      };
    }

    // Gate: no blocked tasks allowed
    const blocked = this.getBlockedTasks();
    if (blocked.length > 0) {
      return {
        approved: false,
        reason: `${blocked.length} blocked task(s) remain — descope or resolve them before approving`,
      };
    }

    // Gate: all tasks must be in a terminal state (human-review or done)
    const nonTerminal = Array.from(this.workers.entries())
      .filter(([, w]) => {
        const stage = w.getState().stage;
        return stage !== "human-review" && stage !== "done";
      })
      .map(([id]) => id);
    if (nonTerminal.length > 0) {
      return {
        approved: false,
        reason: `${nonTerminal.length} task(s) still in progress — wait for all tasks to complete before approving`,
      };
    }

    // Integration gate: merge task branches into milestone branch and run tests
    this.events.emit("task-progress", {
      milestoneRunId: this.currentRun.id,
      activity: "running milestone integration gate — merging branches and testing",
    });

    const integrationResult = await this.runIntegrationGate();
    if (!integrationResult.passed) {
      return {
        approved: false,
        reason: `integration gate failed: ${integrationResult.reason}`,
      };
    }

    this.currentRun.status = "completed";
    this.currentRun.completedAt = new Date().toISOString();

    // Cleanup all worktrees
    for (const worker of Array.from(this.workers.values())) {
      await worker.cleanup();
    }
    this.workers.clear();

    this.events.emit("milestone-completed", {
      milestoneRunId: this.currentRun.id,
      totalCostUsd: this.currentRun.totalCostUsd,
    });

    const completedRun = this.currentRun;
    this.currentRun = null;
    return { approved: true, milestoneBranch: completedRun.milestoneBranch };
  }

  /** Cancel the current milestone run — cleans up workers and releases the run slot */
  async cancelMilestone(): Promise<void> {
    if (!this.currentRun) return;

    for (const worker of Array.from(this.workers.values())) {
      await worker.cleanup();
    }
    this.workers.clear();
    this.taskMap.clear();
    this.currentRun = null;
  }

  /** Update the manager's config (called when config is changed via API) */
  updateConfig(config: PipelineConfig): void {
    this.config = config;
    this.budget = new BudgetTracker(config);
  }

  /**
   * Integration gate: create a milestone branch, merge each task branch in order, run tests.
   * Returns { passed: true } or { passed: false, reason: string }.
   */
  private async runIntegrationGate(): Promise<{ passed: boolean; reason?: string }> {
    if (!this.currentRun) return { passed: false, reason: "no active run" };

    const { projectPath, baseBranch, milestoneBranch } = this.currentRun;

    try {
      // Create a worktree for the milestone integration branch
      const milestoneWorktree = await createTaskWorktree(projectPath, `milestone-integration-${Date.now()}`, baseBranch);

      try {
        // Merge each completed task branch in dependency order
        for (const taskId of this.currentRun.taskOrder) {
          const worker = this.workers.get(taskId);
          if (!worker) continue;
          const state = worker.getState();
          if (state.stage === "blocked") continue; // descoped or blocked tasks are skipped

          try {
            execFileSync("git", ["merge", "--no-ff", state.branchName, "-m", `Merge ${taskId}`], {
              cwd: milestoneWorktree.worktreePath,
              encoding: "utf-8",
              timeout: 30000,
            });
          } catch {
            removeWorktree(projectPath, milestoneWorktree.worktreePath);
            return { passed: false, reason: `merge conflict when integrating task ${taskId} (branch: ${state.branchName})` };
          }
        }

        // Run the project's test suite on the merged branch
        try {
          execFileSync("npm", ["test"], {
            cwd: milestoneWorktree.worktreePath,
            encoding: "utf-8",
            timeout: 300000, // 5 min for tests
            stdio: "pipe",
          });
        } catch {
          removeWorktree(projectPath, milestoneWorktree.worktreePath);
          return { passed: false, reason: "integration tests failed on the merged milestone branch" };
        }

        // Tests passed — push the milestone branch ref so it persists after worktree cleanup
        execFileSync("git", ["branch", milestoneBranch, "HEAD"], {
          cwd: milestoneWorktree.worktreePath,
          encoding: "utf-8",
          timeout: 10000,
        });

        removeWorktree(projectPath, milestoneWorktree.worktreePath);
        return { passed: true };
      } catch (err) {
        removeWorktree(projectPath, milestoneWorktree.worktreePath);
        throw err;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { passed: false, reason: msg };
    }
  }

  private scheduleNext(): void {
    if (!this.currentRun || this.currentRun.status !== "running") return;

    // Find tasks that are ready to run
    const completedTasks = new Set<string>();
    const blockedTasks = new Set<string>();
    const inProgressTasks = new Set<string>();

    for (const [taskId, worker] of Array.from(this.workers)) {
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
    const finishedOrBlocked = new Set(Array.from(completedTasks).concat(Array.from(blockedTasks)));
    const notStarted = Array.from(allTaskIds).filter(
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
          this.currentRun.totalCostUsd = Array.from(this.workers.values())
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
