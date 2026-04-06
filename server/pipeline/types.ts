// server/pipeline/types.ts

/** Which stage a task is in within the pipeline */
export type PipelineStage =
  | "queued"
  | "build"
  | "ai-review"
  | "human-review"
  | "done"
  | "blocked";

/** Tracks one attempt to build a task */
export interface BuildAttempt {
  attemptNumber: number;
  startedAt: string;       // ISO date
  completedAt?: string;
  snapshotRef: string;      // git ref for the clean snapshot
  patchRef?: string;        // git ref preserving this attempt's changes
  claudeCalls: number;
  tokensUsed: number;
  costUsd: number;
  error?: string;           // error message if attempt failed
  escalation: "self" | "codex-rescue" | "blocked";
}

/** Live state of a pipeline worker processing a task */
export interface WorkerState {
  taskId: string;
  milestoneRunId: string;
  stage: PipelineStage;
  worktreePath: string;
  branchName: string;
  currentActivity: string;  // human-readable, e.g. "running tests"
  startedAt: string;
  attempts: BuildAttempt[];
  totalClaudeCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  sessionIds: string[];     // linked Claude Code session IDs
  model: string;
}

/** A milestone execution run */
export interface MilestoneRun {
  id: string;
  milestoneTaskId: string;  // the milestone task's ID on the board
  projectId: string;
  projectPath: string;
  baseBranch: string;       // branch all task worktrees branch from
  milestoneBranch: string;  // branch where completed tasks merge into
  status: "running" | "paused" | "completed" | "stalled";
  startedAt: string;
  completedAt?: string;
  taskOrder: string[];      // task IDs in execution order
  parallelGroups: string[][]; // groups of task IDs that can run concurrently
  workers: Record<string, WorkerState>; // taskId → worker state
  totalCostUsd: number;
  pauseReason?: string;
}

/** Budget and limit configuration */
export interface PipelineConfig {
  maxClaudeCallsPerTask: number;    // default: 5
  maxSelfFixAttempts: number;       // default: 3
  maxCodexRescueAttempts: number;   // default: 1
  costCeilingPerTaskUsd: number;    // default: 5
  costCeilingPerMilestoneUsd: number; // default: 50
  dailySpendCapUsd: number;         // default: 100
  maxConcurrentWorkers: number;     // default: 1
  taskTimeoutMs: number;            // default: 600000 (10 min)
  model: string;                    // default: "sonnet"
  maxTurns: number;                 // default: 10
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxClaudeCallsPerTask: 5,
  maxSelfFixAttempts: 3,
  maxCodexRescueAttempts: 1,
  costCeilingPerTaskUsd: 5,
  costCeilingPerMilestoneUsd: 50,
  dailySpendCapUsd: 100,
  maxConcurrentWorkers: 1,
  taskTimeoutMs: 600000,
  model: "sonnet",
  maxTurns: 10,
};

/** Summary written when a task finishes (stored in task body/metadata) */
export interface TaskCompletionSummary {
  whatWasDone: string;          // plain language summary
  filesChanged: string[];       // list of changed file paths
  testResults: { passed: number; failed: number; skipped: number } | null;
  aiReviewVerdict: "pass" | "concerns" | "fail";
  aiReviewNotes: string;
  escalationHistory: string[];  // human-readable log of retries/rescues
  totalCostUsd: number;
  totalClaudeCalls: number;
  durationMs: number;
}
