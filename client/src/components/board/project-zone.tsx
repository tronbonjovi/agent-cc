// client/src/components/board/project-zone.tsx

import { ProjectCard } from "./project-card";
import type { ProjectCardData } from "./project-card";

interface Props {
  projects: ProjectCardData[];
  onProjectClick: (project: ProjectCardData, e: React.MouseEvent) => void;
}

/** Format project count with correct pluralization */
export function formatProjectCount(count: number): string {
  return count === 1 ? "1 project" : `${count} projects`;
}

export function ProjectZone({ projects, onProjectClick }: Props) {
  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="px-3 py-2.5 flex items-center gap-2 border-b shrink-0">
        <h2 className="text-sm font-semibold">Projects</h2>
        <span className="text-xs text-muted-foreground">
          {formatProjectCount(projects.length)}
        </span>
      </div>

      {/* Vertically stacked project cards */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={(e: React.MouseEvent) => onProjectClick(project, e)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
