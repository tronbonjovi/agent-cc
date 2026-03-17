import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateDataQueries } from "@/lib/queryClient";
import type { Entity, EntityType, ScanStatus, MCPEntity, SkillEntity, PluginEntity, MarkdownEntity, ConfigEntity, ProjectEntity } from "@shared/types";

export function makeRelativePath(fullPath: string, homeDir: string | null): string {
  if (!homeDir) return fullPath;
  const h = homeDir.replace(/\\/g, "/");
  const p = fullPath.replace(/\\/g, "/");
  return p.startsWith(h + "/") ? "~/" + p.slice(h.length + 1) : p;
}

export function useEntities<T extends Entity = Entity>(type?: EntityType, query?: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (query) params.set("q", query);
  const qs = params.toString();
  return useQuery<T[]>({
    queryKey: [`/api/entities${qs ? `?${qs}` : ""}`],
  });
}

export function useEntity(id: string | undefined) {
  return useQuery<Entity>({
    queryKey: [`/api/entities/${id}`],
    enabled: !!id,
  });
}

export function useScanStatus() {
  return useQuery<ScanStatus>({
    queryKey: ["/api/scanner/status"],
    staleTime: 5000,
  });
}

export function useRescan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scanner/rescan");
      return res.json();
    },
    onSuccess: () => {
      invalidateDataQueries(qc);
    },
  });
}
