// client/src/components/board/project-card.tsx

export interface ProjectCardData {
  id: string;
  name: string;
  description: string;
  health: "healthy" | "warning" | "critical" | "unknown";
  sessionCount: number;
  totalCost: number;
  milestoneCount: number;
  taskCount: number;
  doneTasks: number;
  inProgressTasks: number;
  isCurrent: boolean;
}

// --- Exported utility functions (tested independently) ---

/** Map health status to Tailwind dot color class */
export function healthDotColor(health: ProjectCardData["health"]): string {
  switch (health) {
    case "healthy":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "critical":
      return "bg-red-500";
    case "unknown":
    default:
      return "bg-slate-400";
  }
}

/** Format cost as USD with 2 decimal places */
export function formatProjectCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/** Calculate done / in-progress / pending segments for the progress bar */
export function progressSegments(data: Pick<ProjectCardData, "taskCount" | "doneTasks" | "inProgressTasks">) {
  const pending = Math.max(0, data.taskCount - data.doneTasks - data.inProgressTasks);
  return {
    done: data.doneTasks,
    inProgress: data.inProgressTasks,
    pending,
  };
}

// --- Component ---

interface ProjectCardProps {
  data: ProjectCardData;
  onClick: (data: ProjectCardData) => void;
}

export function ProjectCard({ data, onClick }: ProjectCardProps) {
  const segments = progressSegments(data);
  const hasTasks = data.taskCount > 0;

  return (
    <div
      onClick={() => onClick(data)}
      className="min-w-[180px] max-w-[200px] bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all"
    >
      {/* Row 1: Health dot + name + current badge */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${healthDotColor(data.health)}`} />
        <span className="text-sm font-medium truncate flex-1">{data.name}</span>
        {data.isCurrent && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 flex-shrink-0">
            current
          </span>
        )}
      </div>

      {/* Row 2: Milestone + task counts */}
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {data.milestoneCount} milestone{data.milestoneCount !== 1 ? "s" : ""} &middot; {data.taskCount} task{data.taskCount !== 1 ? "s" : ""}
      </div>

      {/* Row 3: Stacked progress bar */}
      {hasTasks && (
        <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-muted">
          {segments.done > 0 && (
            <div
              className="bg-emerald-500"
              style={{ flex: segments.done }}
            />
          )}
          {segments.inProgress > 0 && (
            <div
              className="bg-amber-500"
              style={{ flex: segments.inProgress }}
            />
          )}
          {segments.pending > 0 && (
            <div
              className="bg-muted-foreground/20"
              style={{ flex: segments.pending }}
            />
          )}
        </div>
      )}

      {/* Row 4: Sessions + cost */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{data.sessionCount} session{data.sessionCount !== 1 ? "s" : ""}</span>
        <span>{formatProjectCost(data.totalCost)}</span>
      </div>
    </div>
  );
}
