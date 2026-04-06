import { describe, it, expect } from "vitest";
import { DEFAULT_PIPELINE_CONFIG } from "../server/pipeline/types";
import { DEFAULT_TASK_CONFIG } from "../shared/task-types";

describe("Pipeline types", () => {
  it("has sensible default pipeline config", () => {
    expect(DEFAULT_PIPELINE_CONFIG.maxClaudeCallsPerTask).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_CONFIG.maxSelfFixAttempts).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_CONFIG.costCeilingPerTaskUsd).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_CONFIG.maxConcurrentWorkers).toBe(1);
    expect(DEFAULT_PIPELINE_CONFIG.model).toBe("sonnet");
  });

  it("default task config includes pipeline columns", () => {
    expect(DEFAULT_TASK_CONFIG.statuses).toContain("queued");
    expect(DEFAULT_TASK_CONFIG.statuses).toContain("build");
    expect(DEFAULT_TASK_CONFIG.statuses).toContain("ai-review");
    expect(DEFAULT_TASK_CONFIG.statuses).toContain("human-review");
  });

  it("pipeline columns are in correct order", () => {
    const s = DEFAULT_TASK_CONFIG.statuses;
    expect(s.indexOf("backlog")).toBeLessThan(s.indexOf("queued"));
    expect(s.indexOf("queued")).toBeLessThan(s.indexOf("build"));
    expect(s.indexOf("build")).toBeLessThan(s.indexOf("ai-review"));
    expect(s.indexOf("ai-review")).toBeLessThan(s.indexOf("human-review"));
    expect(s.indexOf("human-review")).toBeLessThan(s.indexOf("done"));
  });
});
