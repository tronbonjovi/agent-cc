// server/pipeline/worker.ts
import type { TaskItem } from "@shared/task-types";
import type { PipelineConfig, WorkerState, BuildAttempt, PipelineStage } from "./types";
import type { BudgetTracker } from "./budget";
import type { PipelineEventBus } from "./events";
import { runClaude } from "../scanner/claude-runner";
import {
  createTaskWorktree,
  removeWorktree,
  createCleanSnapshot,
  resetToSnapshot,
  preserveAttempt,
  getChangedFiles,
  rebaseOnto,
  hasUncommittedChanges,
  commitUncommittedChanges,
} from "./git-ops";

class PausedError extends Error {
  constructor() { super("worker paused"); this.name = "PausedError"; }
}

interface WorkerOpts {
  task: TaskItem;
  milestoneRunId: string;
  repoPath: string;
  baseBranch: string;
  config: PipelineConfig;
  budget: BudgetTracker;
  events: PipelineEventBus;
  onStageChange: (taskId: string, stage: PipelineStage) => void;
}

export class PipelineWorker {
  private task: TaskItem;
  private milestoneRunId: string;
  private repoPath: string;
  private baseBranch: string;
  private config: PipelineConfig;
  private budget: BudgetTracker;
  private events: PipelineEventBus;
  private onStageChange: (taskId: string, stage: PipelineStage) => void;
  private _paused = false;

  private state: WorkerState;

  constructor(opts: WorkerOpts) {
    this.task = opts.task;
    this.milestoneRunId = opts.milestoneRunId;
    this.repoPath = opts.repoPath;
    this.baseBranch = opts.baseBranch;
    this.config = opts.config;
    this.budget = opts.budget;
    this.events = opts.events;
    this.onStageChange = opts.onStageChange;

    this.state = {
      taskId: this.task.id,
      milestoneRunId: this.milestoneRunId,
      stage: "queued",
      worktreePath: "",
      branchName: "",
      currentActivity: "waiting in queue",
      startedAt: new Date().toISOString(),
      attempts: [],
      totalClaudeCalls: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      sessionIds: [],
      model: this.config.model,
    };
  }

  getState(): WorkerState {
    return { ...this.state };
  }

  /** Signal the worker to stop at the next checkpoint */
  pause(): void { this._paused = true; }

  /** Allow the worker to continue */
  resume(): void { this._paused = false; }

  /** Check if paused — throws to break out of the build loop */
  private checkPaused(): void {
    if (this._paused) {
      throw new PausedError();
    }
  }

  /** Run the full task lifecycle: build → ai-review (or blocked) */
  async run(): Promise<void> {
    try {
      this.checkPaused();
      // Setup worktree
      this.setStage("build");
      this.setActivity("creating worktree");
      const { worktreePath, branchName } = await createTaskWorktree(
        this.repoPath,
        this.task.id,
        this.baseBranch
      );
      this.state.worktreePath = worktreePath;
      this.state.branchName = branchName;

      // Create clean snapshot for retry isolation
      const snapshotRef = await createCleanSnapshot(worktreePath, this.task.id);

      // Build loop with escalation
      const buildSuccess = await this.buildWithRetries(worktreePath, snapshotRef);

      if (buildSuccess) {
        this.checkPaused();

        // Rebase onto latest base before moving to review
        this.setActivity("rebasing onto base branch");
        const rebaseOk = await rebaseOnto(worktreePath, this.baseBranch);
        if (!rebaseOk) {
          this.setStage("blocked");
          this.state.currentActivity = "rebase conflict — needs manual resolution";
          return;
        }

        this.checkPaused();

        this.setStage("ai-review");
        this.setActivity("running AI review");
        await this.runAiReview(worktreePath);
      }
    } catch (err) {
      if (err instanceof PausedError) {
        this.state.currentActivity = "paused";
        return; // Don't set blocked — worker is just paused
      }
      this.setStage("blocked");
      this.state.currentActivity = `unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async buildWithRetries(worktreePath: string, snapshotRef: string): Promise<boolean> {
    while (true) {
      this.checkPaused();
      const escalation = this.budget.getEscalationLevel(this.task.id);
      if (escalation === "blocked") {
        this.setStage("blocked");
        this.state.currentActivity = "exhausted all retry and rescue attempts";
        return false;
      }

      // Check budget
      const budgetCheck = this.budget.checkTaskBudget(this.task.id, this.milestoneRunId);
      if (!budgetCheck.allowed) {
        this.setStage("blocked");
        this.state.currentActivity = `budget exceeded: ${budgetCheck.reason}`;
        return false;
      }

      const attemptNum = this.state.attempts.length + 1;

      // Before resetting for a retry, preserve any uncommitted work the agent left behind.
      // Without this, reset --hard would destroy edits that weren't committed.
      if (attemptNum > 1) {
        if (hasUncommittedChanges(worktreePath)) {
          this.setActivity(`preserving uncommitted changes from attempt ${attemptNum - 1}`);
          commitUncommittedChanges(worktreePath, this.task.id, attemptNum - 1);
        }
        this.setActivity(`resetting to clean snapshot for attempt ${attemptNum}`);
        await resetToSnapshot(worktreePath, snapshotRef);
      }

      const attempt: BuildAttempt = {
        attemptNumber: attemptNum,
        startedAt: new Date().toISOString(),
        snapshotRef,
        claudeCalls: 0,
        tokensUsed: 0,
        costUsd: 0,
        escalation,
      };

      try {
        this.setActivity(
          escalation === "codex-rescue"
            ? `codex rescue attempt`
            : `build attempt ${attemptNum}`
        );

        const prompt = this.buildPrompt(escalation);
        await runClaude(prompt, {
          model: this.config.model,
          maxTurns: this.config.maxTurns,
          timeoutMs: this.config.taskTimeoutMs,
          cwd: worktreePath,
          onOutput: (chunk) => {
            this.events.emit("task-progress", {
              taskId: this.task.id,
              activity: chunk.slice(0, 200),
            });
          },
        });

        this.checkPaused();

        attempt.claudeCalls = 1;
        // Cost estimation — rough heuristic, real cost comes from session data
        attempt.costUsd = 0.01; // placeholder, will be updated from session tracking
        attempt.completedAt = new Date().toISOString();

        this.state.totalClaudeCalls++;
        this.state.totalCostUsd += attempt.costUsd;
        this.budget.recordTaskSpend(this.task.id, this.milestoneRunId, attempt.costUsd, 1);
        this.budget.recordAttempt(this.task.id, escalation);

        // Commit any uncommitted work before checking results — prevents loss on retry
        if (hasUncommittedChanges(worktreePath)) {
          commitUncommittedChanges(worktreePath, this.task.id, attemptNum);
        }

        // Check if any files actually changed (committed)
        const changedFiles = await getChangedFiles(worktreePath, this.baseBranch);
        if (this.budget.isSpinningWheels(this.task.id, changedFiles)) {
          attempt.error = "no meaningful file changes produced";
          this.state.attempts.push(attempt);
          await preserveAttempt(worktreePath, this.task.id, attemptNum);
          // Escalate immediately on no-progress
          this.budget.recordAttempt(this.task.id, escalation);
          continue;
        }

        // Success
        this.state.attempts.push(attempt);
        return true;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        attempt.error = errorMsg;
        attempt.completedAt = new Date().toISOString();
        this.state.attempts.push(attempt);

        await preserveAttempt(worktreePath, this.task.id, attemptNum);
        this.budget.recordAttempt(this.task.id, escalation);

        // Same-error circuit breaker
        if (this.budget.isSameErrorRepeated(this.task.id, errorMsg)) {
          // Skip straight to next escalation level by recording extra attempts
          const currentLevel = this.budget.getEscalationLevel(this.task.id);
          if (currentLevel === "self") {
            // Fast-forward through remaining self attempts
            while (this.budget.getEscalationLevel(this.task.id) === "self") {
              this.budget.recordAttempt(this.task.id, "self");
            }
          }
        }
        this.budget.recordError(this.task.id, errorMsg);

        this.state.totalClaudeCalls++;
        this.budget.recordTaskSpend(this.task.id, this.milestoneRunId, 0.01, 1);
      }
    }
  }

  private async runAiReview(worktreePath: string): Promise<void> {
    // AI review is a separate claude call that reviews the diff
    this.setActivity("AI reviewing changes");

    const changedFiles = await getChangedFiles(worktreePath, this.baseBranch);
    const reviewPrompt = [
      "Review the following code changes for correctness, edge cases, and code quality.",
      `Changed files: ${changedFiles.join(", ")}`,
      "Provide a verdict: PASS, CONCERNS, or FAIL with explanation.",
      "Format your response as JSON: { \"verdict\": \"pass|concerns|fail\", \"notes\": \"...\" }",
    ].join("\n");

    try {
      await runClaude(reviewPrompt, {
        model: this.config.model,
        maxTurns: 1,
        timeoutMs: 60000,
        cwd: worktreePath,
      });

      this.state.totalClaudeCalls++;
      this.budget.recordTaskSpend(this.task.id, this.milestoneRunId, 0.01, 1);
    } catch {
      // AI review failure is not fatal — task still moves to human review
    }

    this.setStage("human-review");
    this.setActivity("ready for human review");
  }

  private buildPrompt(escalation: "self" | "codex-rescue"): string {
    const taskContext = [
      `Task: ${this.task.title}`,
      `Description: ${this.task.body}`,
      "",
      "Instructions:",
    ];

    if (escalation === "self") {
      taskContext.push(
        "Implement this task. Write the code, create or update tests, and run them.",
        "If tests fail, fix the code until tests pass.",
        "Commit your changes with a descriptive message.",
      );
    } else {
      // Codex rescue — provide more context about what failed
      const lastError = this.state.attempts.at(-1)?.error ?? "unknown error";
      taskContext.push(
        "A previous attempt to implement this task failed.",
        `Last error: ${lastError}`,
        "Investigate the root cause, then implement a fresh solution.",
        "Write the code, create or update tests, and run them.",
        "Commit your changes with a descriptive message.",
      );
    }

    return taskContext.join("\n");
  }

  private setStage(stage: PipelineStage): void {
    this.state.stage = stage;
    this.onStageChange(this.task.id, stage);
    this.events.emit("task-stage-changed", {
      taskId: this.task.id,
      stage,
      milestoneRunId: this.milestoneRunId,
    });
  }

  private setActivity(activity: string): void {
    this.state.currentActivity = activity;
    this.events.emit("task-progress", {
      taskId: this.task.id,
      activity,
      milestoneRunId: this.milestoneRunId,
    });
  }

  /** Clean up worktree after task is done or abandoned */
  async cleanup(): Promise<void> {
    if (this.state.worktreePath) {
      removeWorktree(this.repoPath, this.state.worktreePath);
    }
  }
}
