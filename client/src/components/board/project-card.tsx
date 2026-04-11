// client/src/components/board/project-card.tsx

export interface ProjectMilestoneData {
  id: string;
  title: string;
  color: string;
  totalTasks: number;
  doneTasks: number;
}

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
  milestones: ProjectMilestoneData[];
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

export interface ProjectCardProps {
  project: ProjectCardData;
  onClick: (e: React.MouseEvent) => void;
}

/** Filter milestones that are not yet complete */
export function activeMilestones(milestones: ProjectMilestoneData[]): ProjectMilestoneData[] {
  return milestones.filter(m => m.totalTasks > 0 && m.doneTasks < m.totalTasks);
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const segments = progressSegments(project);
  const hasTasks = project.taskCount > 0;
  const active = activeMilestones(project.milestones);

  return (
    <div
      onClick={onClick}
      className="bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all"
    >
      {/* Row 1: Health dot + name */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${healthDotColor(project.health)}`} />
        <span className="text-sm font-medium truncate flex-1">{project.name}</span>
      </div>

      {/* Row 2: Milestone + task counts */}
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {project.milestoneCount} milestone{project.milestoneCount !== 1 ? "s" : ""} &middot; {project.taskCount} task{project.taskCount !== 1 ? "s" : ""}
      </div>

      {/* Row 3: Overall progress bar */}
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

      {/* Row 4: Active milestone progress bars */}
      {active.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {active.map(m => {
            const pct = m.totalTasks > 0 ? Math.round((m.doneTasks / m.totalTasks) * 100) : 0;
            return (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                <span className="text-[10px] text-muted-foreground truncate flex-1">{m.title}</span>
                <span className="text-[9px] font-mono text-muted-foreground/70">{m.doneTasks}/{m.totalTasks}</span>
                <div className="w-10 h-1 bg-muted rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Row 5: Sessions + cost */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{project.sessionCount} session{project.sessionCount !== 1 ? "s" : ""}</span>
        <span>{formatProjectCost(project.totalCost)}</span>
      </div>
    </div>
  );
}
