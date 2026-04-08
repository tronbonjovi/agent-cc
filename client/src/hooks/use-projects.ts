import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to delete project");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/board"] });
    },
  });
}
