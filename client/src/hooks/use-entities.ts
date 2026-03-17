import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Entity, EntityType, ScanStatus } from "@shared/types";

export function makeRelativePath(fullPath: string, homeDir: string | null): string {
  if (!homeDir) return fullPath;
  const h = homeDir.replace(/\\/g, "/");
  const p = fullPath.replace(/\\/g, "/");
  return p.startsWith(h + "/") ? "~/" + p.slice(h.length + 1) : p;
}

export function useEntities(type?: EntityType, query?: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (query) params.set("q", query);
  const qs = params.toString();
  return useQuery<Entity[]>({
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
      // Invalidate data queries (not settings/update)
      qc.invalidateQueries({ queryKey: ["/api/entities"] });
      qc.invalidateQueries({ queryKey: ["/api/scanner/status"] });
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/sessions"] });
      qc.invalidateQueries({ queryKey: ["/api/graph"] });
      qc.invalidateQueries({ queryKey: ["/api/apis"] });
      qc.invalidateQueries({ queryKey: ["/api/live"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
    },
  });
}
