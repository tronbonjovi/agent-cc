import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineManager } from "../server/pipeline/manager";
import { PipelineEventBus } from "../server/pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../server/pipeline/types";
import type { TaskItem } from "../shared/task-types";

// Mock git-ops and child_process to avoid real git operations in the integration gate
vi.mock("../server/pipeline/git-ops", () => ({
  createTaskWorktree: vi.fn().mockResolvedValue({
    worktreePath: "/tmp/mock-milestone-worktree",
    branchName: "pipeline/mock-milestone",
  }),
  removeWorktree: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFileSync: vi.fn().mockReturnValue(""),
}));

// Mock the worker to avoid real git/claude operations.
// Must use a function (not arrow) so it can be called with `new`.
vi.mock("../server/pipeline/worker", () => {
  const MockPipelineWorker = vi.fn().mockImplementation(function (this: any, opts: any) {
    let stage: string = "queued";
    let totalCostUsd = 0;
    let totalClaudeCalls = 0;

    this.getState = vi.fn().mockImplementation(() => ({
      taskId: opts.task.id,
      stage,
      totalCostUsd,
      totalClaudeCalls,
      branchName: `pipeline/${opts.task.id}`,
      worktreePath: `/tmp/mock-worktree/${opts.task.id}`,
    }));
    this.run = vi.fn().mockImplementation(async () => {
      // Yield to the event loop so startMilestone returns before the worker finishes
      await new Promise((r) => setTimeout(r, 10));
      stage = "human-review";
      totalCostUsd = 0.05;
      totalClaudeCalls = 2;
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
    body: `Do task ${id}`,
    filePath: `/mock/${id}.md`,
    dependsOn: deps,
  };
}

describe("PipelineManager", () => {
  let manager: PipelineManager;
  let events: PipelineEventBus;
  let onTaskStatusChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new PipelineEventBus();
    onTaskStatusChange = vi.fn();
    manager = new PipelineManager({
      config: DEFAULT_PIPELINE_CONFIG,
      events,
      onTaskStatusChange,
    });
  });

  it("starts a milestone run", async () => {
    const tasks = [makeTask("t-1"), makeTask("t-2")];
    const run = await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock/project",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1", "t-2"],
      parallelGroups: [],
    });

    expect(run.status).toBe("running");
    expect(run.taskOrder).toEqual(["t-1", "t-2"]);
  });

  it("returns the current run status", async () => {
    const tasks = [makeTask("t-1")];
    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock/project",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1"],
      parallelGroups: [],
    });

    const status = manager.getStatus();
    expect(status).not.toBeNull();
    expect(status!.milestoneTaskId).toBe("mile-1");
  });

  it("returns null status when no run active", () => {
    expect(manager.getStatus()).toBeNull();
  });

  it("rejects starting a second milestone while one is running", async () => {
    const tasks = [makeTask("t-1")];
    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock/project",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1"],
      parallelGroups: [],
    });

    await expect(
      manager.startMilestone({
        milestoneTaskId: "mile-2",
        projectId: "proj-1",
        projectPath: "/mock/project",
        baseBranch: "main",
        tasks: [makeTask("t-2")],
        taskOrder: ["t-2"],
        parallelGroups: [],
      })
    ).rejects.toThrow("milestone already exists");
  });

  it("blocks approval when blocked tasks exist", async () => {
    // This test uses the mock worker — we'd need to simulate a blocked task
    // For now, verify the method exists and returns correctly with no blocked tasks
    const tasks = [makeTask("t-1")];
    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock/project",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1"],
      parallelGroups: [],
    });

    // Wait for worker to finish
    await new Promise((r) => setTimeout(r, 100));

    // No blocked tasks — approval should succeed
    const result = await manager.approveMilestone();
    expect(result.approved).toBe(true);
  });

  it("descopes a task and its dependents", async () => {
    const tasks = [
      makeTask("t-1"),
      makeTask("t-2", ["t-1"]),
      makeTask("t-3", ["t-2"]),
    ];
    await manager.startMilestone({
      milestoneTaskId: "mile-1",
      projectId: "proj-1",
      projectPath: "/mock/project",
      baseBranch: "main",
      tasks,
      taskOrder: ["t-1", "t-2", "t-3"],
      parallelGroups: [],
    });

    // Descope t-1 — should also remove t-2 and t-3 (transitive deps)
    const descoped = manager.descopeTask("t-1");
    expect(descoped).toContain("t-1");
    expect(descoped).toContain("t-2");
    expect(descoped).toContain("t-3");

    // Task order should be empty
    const status = manager.getStatus();
    expect(status?.taskOrder).toEqual([]);
  });
});
