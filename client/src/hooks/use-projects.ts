import { useQuery } from "@tanstack/react-query";
import type { Entity, Relationship, ProjectEntity } from "@shared/types";

export function useProjects() {
  return useQuery<(ProjectEntity & { mcpCount: number; skillCount: number; markdownCount: number })[]>({
    queryKey: ["/api/projects"],
  });
}

export function useProjectDetail(id: string | undefined) {
  return useQuery<{ project: ProjectEntity; relationships: Relationship[]; linkedEntities: Entity[] }>({
    queryKey: [`/api/projects/${id}`],
    enabled: !!id,
  });
}
