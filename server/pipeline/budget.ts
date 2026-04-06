// server/pipeline/budget.ts
import type { PipelineConfig } from "./types";

interface BudgetCheck {
  allowed: boolean;
  reason?: string;
}

export class BudgetTracker {
  private config: PipelineConfig;
  // taskId → { costUsd, claudeCalls }
  private taskSpend = new Map<string, { costUsd: number; claudeCalls: number }>();
  // milestoneRunId → total cost
  private milestoneSpend = new Map<string, number>();
  // daily total
  private dailySpend = 0;
  private dailyDate = new Date().toISOString().slice(0, 10);
  // taskId → last error message
  private lastErrors = new Map<string, string>();
  // taskId → attempt counts by level
  private attempts = new Map<string, { self: number; "codex-rescue": number }>();

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  /** Record spending for a task */
  recordTaskSpend(taskId: string, milestoneRunId: string, costUsd: number, claudeCalls: number): void {
    this.resetDailyIfNeeded();

    const existing = this.taskSpend.get(taskId) ?? { costUsd: 0, claudeCalls: 0 };
    existing.costUsd += costUsd;
    existing.claudeCalls += claudeCalls;
    this.taskSpend.set(taskId, existing);

    const mileCost = this.milestoneSpend.get(milestoneRunId) ?? 0;
    this.milestoneSpend.set(milestoneRunId, mileCost + costUsd);

    this.dailySpend += costUsd;
  }

  /** Check if a task is within all budget limits */
  checkTaskBudget(taskId: string, milestoneRunId: string): BudgetCheck {
    this.resetDailyIfNeeded();

    const task = this.taskSpend.get(taskId) ?? { costUsd: 0, claudeCalls: 0 };

    if (task.costUsd >= this.config.costCeilingPerTaskUsd) {
      return { allowed: false, reason: `task cost ceiling exceeded ($${task.costUsd.toFixed(2)} >= $${this.config.costCeilingPerTaskUsd})` };
    }

    if (task.claudeCalls >= this.config.maxClaudeCallsPerTask) {
      return { allowed: false, reason: `task claude call limit exceeded (${task.claudeCalls} >= ${this.config.maxClaudeCallsPerTask})` };
    }

    const mileCost = this.milestoneSpend.get(milestoneRunId) ?? 0;
    if (mileCost >= this.config.costCeilingPerMilestoneUsd) {
      return { allowed: false, reason: `milestone cost ceiling exceeded ($${mileCost.toFixed(2)} >= $${this.config.costCeilingPerMilestoneUsd})` };
    }

    if (this.dailySpend >= this.config.dailySpendCapUsd) {
      return { allowed: false, reason: `daily spend cap exceeded ($${this.dailySpend.toFixed(2)} >= $${this.config.dailySpendCapUsd})` };
    }

    return { allowed: true };
  }

  /** Record an error for same-error detection */
  recordError(taskId: string, errorMessage: string): void {
    this.lastErrors.set(taskId, errorMessage);
  }

  /** Check if the same error occurred twice in a row */
  isSameErrorRepeated(taskId: string, currentError: string): boolean {
    return this.lastErrors.get(taskId) === currentError;
  }

  /** Check if a build attempt produced no meaningful changes */
  isSpinningWheels(taskId: string, changedFiles: string[]): boolean {
    return changedFiles.length === 0;
  }

  /** Record an attempt at a given escalation level */
  recordAttempt(taskId: string, level: "self" | "codex-rescue"): void {
    const existing = this.attempts.get(taskId) ?? { self: 0, "codex-rescue": 0 };
    existing[level]++;
    this.attempts.set(taskId, existing);
  }

  /** Determine the current escalation level for a task */
  getEscalationLevel(taskId: string): "self" | "codex-rescue" | "blocked" {
    const counts = this.attempts.get(taskId) ?? { self: 0, "codex-rescue": 0 };
    if (counts.self < this.config.maxSelfFixAttempts) return "self";
    if (counts["codex-rescue"] < this.config.maxCodexRescueAttempts) return "codex-rescue";
    return "blocked";
  }

  /** Get current spend summary */
  getSummary(milestoneRunId?: string): { daily: number; milestone?: number } {
    return {
      daily: this.dailySpend,
      milestone: milestoneRunId ? this.milestoneSpend.get(milestoneRunId) : undefined,
    };
  }

  private resetDailyIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dailyDate) {
      this.dailySpend = 0;
      this.dailyDate = today;
    }
  }
}
