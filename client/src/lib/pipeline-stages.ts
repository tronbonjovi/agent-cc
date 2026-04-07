export interface PipelineColumn {
  id: string;
  label: string;
  color: string;
  bgTint: string;
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: "backlog",      label: "Backlog",       color: "text-zinc-400",   bgTint: "" },
  { id: "queued",       label: "Queued",        color: "text-zinc-400",   bgTint: "" },
  { id: "build",        label: "Build",         color: "text-blue-400",   bgTint: "bg-blue-500/5" },
  { id: "ai-review",    label: "AI Review",     color: "text-purple-400", bgTint: "bg-purple-500/5" },
  { id: "human-review", label: "Human Review",  color: "text-amber-400",  bgTint: "bg-amber-500/5" },
  { id: "done",         label: "Done",          color: "text-green-400",  bgTint: "" },
];

const KNOWN_STAGES = new Set([
  "queued", "build", "ai-review", "human-review", "done",
  "blocked", "descoped", "cancelled",
  // Board column names (written by /api/board/tasks/:id/move into status)
  "backlog", "ready", "in-progress", "review",
]);

const HIDDEN_STAGES = new Set(["descoped", "cancelled"]);

const STAGE_TO_COLUMN: Record<string, string> = {
  queued: "queued",
  build: "build",
  "ai-review": "ai-review",
  "human-review": "human-review",
  done: "done",
  // Board column names → nearest pipeline column
  backlog: "backlog",
  ready: "queued",
  "in-progress": "build",
  review: "human-review",
};

/**
 * Resolve a task's effective stage from pipelineStage and status fields.
 * pipelineStage is authoritative when present (set by pipeline worker);
 * status is the fallback (used when board clears pipelineStage on manual moves).
 */
export function resolveTaskStage(pipelineStage: string | undefined, status: string | undefined): string {
  // pipelineStage is set by the pipeline worker and cleared by board moves,
  // so it's authoritative when present
  if (pipelineStage) return pipelineStage;
  return status || "backlog";
}

export function stageToColumn(stage: string | undefined): string | null {
  if (!stage) return "backlog";
  if (stage === "blocked") return null;
  if (HIDDEN_STAGES.has(stage)) return null;
  if (STAGE_TO_COLUMN[stage]) return STAGE_TO_COLUMN[stage];
  return "unknown";
}

export function isKnownStage(stage: string): boolean {
  return KNOWN_STAGES.has(stage);
}

export const MILESTONE_BADGES: Record<string, { label: string; color: string; pulse?: boolean }> = {
  not_started:       { label: "Not Started",   color: "bg-zinc-500/15 text-zinc-400" },
  running:           { label: "Running",       color: "bg-blue-500/15 text-blue-400" },
  pausing:           { label: "Pausing...",    color: "bg-yellow-500/15 text-yellow-400", pulse: true },
  paused:            { label: "Paused",        color: "bg-yellow-500/15 text-yellow-400" },
  awaiting_approval: { label: "Review",        color: "bg-amber-500/15 text-amber-400" },
  cancelling:        { label: "Cancelling...", color: "bg-red-500/15 text-red-400", pulse: true },
  completed:         { label: "Done",          color: "bg-green-500/15 text-green-400" },
  cancelled:         { label: "Cancelled",     color: "bg-red-500/15 text-red-400" },
};

export const NON_TERMINAL_STATES = new Set([
  "running", "pausing", "paused", "awaiting_approval", "cancelling",
]);

/**
 * Topological sort of tasks respecting dependsOn edges.
 * Dependencies outside the input set are ignored.
 * Falls back gracefully on cycles (appends remaining tasks).
 */
export function topoSortTasks(tasks: { id: string; dependsOn?: string[] }[]): string[] {
  const ids = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const t of tasks) {
    adj.set(t.id, []);
    inDeg.set(t.id, 0);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn ?? []) {
      if (!ids.has(dep)) continue;
      adj.get(dep)!.push(t.id);
      inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1);
    }
  }
  const queue = tasks.filter((t) => inDeg.get(t.id) === 0).map((t) => t.id);
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const next of adj.get(id) ?? []) {
      const deg = inDeg.get(next)! - 1;
      inDeg.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  // Cycle fallback: append any remaining
  for (const t of tasks) {
    if (!result.includes(t.id)) result.push(t.id);
  }
  return result;
}
