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
]);

const HIDDEN_STAGES = new Set(["descoped", "cancelled"]);

const STAGE_TO_COLUMN: Record<string, string> = {
  queued: "queued",
  build: "build",
  "ai-review": "ai-review",
  "human-review": "human-review",
  done: "done",
};

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
