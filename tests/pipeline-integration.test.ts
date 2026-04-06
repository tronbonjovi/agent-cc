import { describe, it, expect, vi } from "vitest";
import { PipelineManager } from "../server/pipeline/manager";
import { PipelineEventBus } from "../server/pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../server/pipeline/types";
import type { TaskItem } from "../shared/task-types";

// Mock worker to simulate fast task completion.
// Must use a named function (not arrow) so it can be called with `new`.
vi.mock("../server/pipeline/worker", () => {
  const MockPipelineWorker = vi.fn().mockImplementation(function (this: any, opts: any) {
    let stage = "queued";
    this.getState = vi.fn().mockImplementation(() => ({
      taskId: opts.task.id,
      stage,
      totalCostUsd: 0.05,
      totalClaudeCalls: 2,
      worktreePath: "/tmp/mock",
      branchName: `pipeline/${opts.task.id}`,
    }));
    this.run = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      stage = "human-review";
      opts.events.emit("task-stage-changed", {
        taskId: opts.task.id,
        stage: "human-review",
        milestoneRunId: "mock",
      });
      opts.onStageChange(opts.task.id, "human-review");
    });
    this.cleanup = vi.fn();
  });
  return { PipelineWorker: MockPipelineWorker };
});

function makeTask(id: string, deps?: string[]): TaskItem {
  return {
    id,
    title: `Task ${id}`,
    type: "task",
    status: "queued",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    body: `Implement ${id}`,
    filePath: `/mock/${id}.md`,
    dependsOn: deps,
  };
}

describe("Pipeline integration", () => {
  it("runs sequential tasks in order", async () => {
    const events = new PipelineEventBus();
    const statusChanges: Array<{ taskId: string; status: string }> = [];

    const manager = new PipelineManager({
      config: DEFAULT_PIPELINE_CONFIG,
      events,
      onTaskStatusChange: (taskId, status) => {
        statusChanges.push({ taskId, status });
      },
    });

    const tasks = [makeTask("t-1"), makeTask("t-2", ["t-1"])];

    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1", "t-2"],
      parallelGroups: [],
    });

    // Allow async workers to complete
    await new Promise((r) => setTimeout(r, 200));

    // Both tasks should have reached human-review
    const status = manager.getStatus();
    expect(status?.status).toBe("paused"); // all tasks done, waiting for review
  });

  it("emits milestone events", async () => {
    const events = new PipelineEventBus();
    const receivedEvents: string[] = [];
    events.addClient((data) => {
      const match = data.match(/event: (\S+)/);
      if (match) receivedEvents.push(match[1]);
    });

    const manager = new PipelineManager({
      config: DEFAULT_PIPELINE_CONFIG,
      events,
      onTaskStatusChange: () => {},
    });

    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock",
      baseBranch: "main",
      tasks: [makeTask("t-1")],
      taskOrder: ["t-1"],
      parallelGroups: [],
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(receivedEvents).toContain("milestone-started");
    expect(receivedEvents).toContain("task-stage-changed");
  });
});
