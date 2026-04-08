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
    <div className="border-b">
      {/* Header bar */}
      <div className="px-5 py-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <span className="text-xs text-muted-foreground">
          {formatProjectCount(projects.length)}
        </span>
      </div>

      {/* Horizontal scrolling row of project cards */}
      <div className="px-5 pb-3 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={(e) => onProjectClick(project, e)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
