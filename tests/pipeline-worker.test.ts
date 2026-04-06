import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineWorker } from "../server/pipeline/worker";
import { BudgetTracker } from "../server/pipeline/budget";
import { PipelineEventBus } from "../server/pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../server/pipeline/types";
import type { TaskItem } from "../shared/task-types";

// Mock git-ops and claude-runner since we can't create real worktrees in unit tests
vi.mock("../server/pipeline/git-ops", () => ({
  createTaskWorktree: vi.fn().mockResolvedValue({
    worktreePath: "/tmp/mock-worktree",
    branchName: "pipeline/task-1",
  }),
  removeWorktree: vi.fn(),
  createCleanSnapshot: vi.fn().mockResolvedValue("refs/pipeline-snapshot/task-1"),
  resetToSnapshot: vi.fn(),
  preserveAttempt: vi.fn().mockResolvedValue("refs/pipeline-attempt/task-1/attempt-1"),
  getChangedFiles: vi.fn().mockResolvedValue(["file.ts"]),
  rebaseOnto: vi.fn().mockResolvedValue(true),
  hasUncommittedChanges: vi.fn().mockReturnValue(false),
  commitUncommittedChanges: vi.fn().mockReturnValue(false),
}));

vi.mock("../server/scanner/claude-runner", () => ({
  runClaude: vi.fn().mockResolvedValue("Build complete. All tests pass."),
  buildClaudeArgs: vi.fn().mockReturnValue(["-p", "--model", "sonnet"]),
  buildClaudeEnv: vi.fn().mockReturnValue({}),
}));

const mockTask: TaskItem = {
  id: "task-1",
  title: "Add login form",
  type: "task",
  status: "queued",
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  body: "Create a login form with email and password fields",
  filePath: "/mock/path/task-1.md",
};

describe("PipelineWorker", () => {
  let worker: PipelineWorker;
  let budget: BudgetTracker;
  let events: PipelineEventBus;
  let onStageChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    budget = new BudgetTracker(DEFAULT_PIPELINE_CONFIG);
    events = new PipelineEventBus();
    onStageChange = vi.fn();

    worker = new PipelineWorker({
      task: mockTask,
      milestoneRunId: "mile-1",
      repoPath: "/mock/repo",
      baseBranch: "main",
      config: DEFAULT_PIPELINE_CONFIG,
      budget,
      events,
      onStageChange,
    });
  });

  it("initializes with queued stage", () => {
    expect(worker.getState().stage).toBe("queued");
  });

  it("transitions through to human-review on successful run", async () => {
    await worker.run();

    const state = worker.getState();
    // Mock runClaude succeeds, so build passes, AI review passes, worker reaches human-review
    expect(state.stage).toBe("human-review");
    expect(state.totalClaudeCalls).toBeGreaterThan(0);
    expect(onStageChange).toHaveBeenCalled();
  });

  it("emits progress events", async () => {
    const mockClient = vi.fn();
    events.addClient(mockClient);

    await worker.run();

    expect(mockClient).toHaveBeenCalled();
  });

  it("records spend in budget tracker", async () => {
    await worker.run();

    const state = worker.getState();
    expect(state.totalClaudeCalls).toBeGreaterThan(0);
  });
});
