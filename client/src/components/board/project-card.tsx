// Stub — will be replaced by the real component from a parallel task
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

export function ProjectCard({ project, onClick }: { project: ProjectCardData; onClick: (e: React.MouseEvent) => void }) {
  return <div onClick={onClick}>{project.name}</div>;
}
