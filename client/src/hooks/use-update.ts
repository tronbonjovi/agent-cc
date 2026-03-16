import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UpdateStatus, UpdateApplyResult, UpdatePreferences } from "@shared/types";

const SIX_HOURS = 6 * 60 * 60 * 1000;

type StatusWithPrefs = UpdateStatus & { prefs?: UpdatePreferences };

export function useUpdateStatus() {
  return useQuery<StatusWithPrefs>({
    queryKey: ["/api/update/status"],
    staleTime: SIX_HOURS,
    refetchInterval: SIX_HOURS,
  });
}

export function useCheckForUpdate() {
  const qc = useQueryClient();
  return useMutation<StatusWithPrefs>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/check");
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(["/api/update/status"], data);
    },
  });
}

export function useApplyUpdate() {
  const qc = useQueryClient();
  return useMutation<UpdateApplyResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/apply");
      return res.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/update/status"] });
      if (result.success && result.restartRequired) {
        // Server will restart in ~2s. Poll until it's back, then reload.
        const poll = setInterval(async () => {
          try {
            const resp = await fetch("/health");
            if (resp.ok) {
              clearInterval(poll);
              window.location.reload();
            }
          } catch {
            // Server still restarting
          }
        }, 2000);
        // Stop polling after 60s
        setTimeout(() => clearInterval(poll), 60000);
      }
    },
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation<UpdatePreferences, Error, Partial<UpdatePreferences>>({
    mutationFn: async (patch) => {
      const res = await apiRequest("PATCH", "/api/update/prefs", patch);
      return res.json();
    },
    onSuccess: (newPrefs) => {
      // Update the cached status to include new prefs
      qc.setQueryData<StatusWithPrefs>(["/api/update/status"], (old) =>
        old ? { ...old, prefs: newPrefs } : old
      );
    },
  });
}
