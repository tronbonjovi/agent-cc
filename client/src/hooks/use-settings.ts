import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AppSettings } from "@shared/types";

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: ["/api/settings"],
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const res = await apiRequest("PATCH", "/api/settings", patch);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
      if (variables.scanPaths) {
        qc.invalidateQueries({ queryKey: ["/api/scanner/status"] });
      }
    },
  });
}

export function useResetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/reset");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });
}
