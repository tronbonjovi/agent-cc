import { describe, it, expect, beforeEach } from "vitest";
import { BudgetTracker } from "../server/pipeline/budget";
import type { PipelineConfig } from "../server/pipeline/types";
import { DEFAULT_PIPELINE_CONFIG } from "../server/pipeline/types";

let budget: BudgetTracker;
const config: PipelineConfig = {
  ...DEFAULT_PIPELINE_CONFIG,
  costCeilingPerTaskUsd: 5,
  costCeilingPerMilestoneUsd: 20,
  dailySpendCapUsd: 50,
  maxClaudeCallsPerTask: 5,
  maxSelfFixAttempts: 3,
};

beforeEach(() => {
  budget = new BudgetTracker(config);
});

describe("BudgetTracker", () => {
  it("tracks task spend and returns under-budget", () => {
    budget.recordTaskSpend("task-1", "mile-1", 1.0, 1);
    const check = budget.checkTaskBudget("task-1", "mile-1");
    expect(check.allowed).toBe(true);
  });

  it("blocks when task cost ceiling exceeded", () => {
    budget.recordTaskSpend("task-1", "mile-1", 6.0, 1);
    const check = budget.checkTaskBudget("task-1", "mile-1");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("task cost ceiling");
  });

  it("blocks when task claude call limit exceeded", () => {
    budget.recordTaskSpend("task-1", "mile-1", 0.5, 6);
    const check = budget.checkTaskBudget("task-1", "mile-1");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("call limit");
  });

  it("blocks when milestone cost ceiling exceeded", () => {
    budget.recordTaskSpend("task-1", "mile-1", 10, 1);
    budget.recordTaskSpend("task-2", "mile-1", 11, 1);
    const check = budget.checkTaskBudget("task-3", "mile-1");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("milestone cost ceiling");
  });

  it("blocks when daily spend cap exceeded", () => {
    budget.recordTaskSpend("task-1", "mile-1", 30, 1);
    budget.recordTaskSpend("task-2", "mile-2", 21, 1);
    const check = budget.checkTaskBudget("task-3", "mile-3");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("daily spend cap");
  });

  it("detects same-error-twice circuit breaker", () => {
    budget.recordError("task-1", "Cannot find module 'foo'");
    expect(budget.isSameErrorRepeated("task-1", "Cannot find module 'foo'")).toBe(true);
    expect(budget.isSameErrorRepeated("task-1", "Different error")).toBe(false);
  });

  it("detects no-progress circuit breaker", () => {
    expect(budget.isSpinningWheels("task-1", [])).toBe(true);
    expect(budget.isSpinningWheels("task-1", ["file.ts"])).toBe(false);
  });

  it("determines correct escalation level", () => {
    expect(budget.getEscalationLevel("task-1")).toBe("self");
    budget.recordAttempt("task-1", "self");
    budget.recordAttempt("task-1", "self");
    budget.recordAttempt("task-1", "self");
    expect(budget.getEscalationLevel("task-1")).toBe("codex-rescue");
    budget.recordAttempt("task-1", "codex-rescue");
    expect(budget.getEscalationLevel("task-1")).toBe("blocked");
  });
});
