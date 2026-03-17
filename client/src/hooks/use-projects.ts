import { useQuery } from "@tanstack/react-query";
import type { Entity } from "@shared/types";

export function useProjects() {
  return useQuery<(Entity & { mcpCount: number; skillCount: number; markdownCount: number })[]>({
    queryKey: ["/api/projects"],
  });
}

export function useProjectDetail(id: string | undefined) {
  return useQuery<{ project: Entity; relationships: any[]; linkedEntities: Entity[] }>({
    queryKey: [`/api/projects/${id}`],
    enabled: !!id,
  });
}
