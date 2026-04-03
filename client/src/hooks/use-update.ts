import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
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
      toast.success(data.updateAvailable ? "Update available" : "Already up to date");
    },
    onError: (err: Error) => { toast.error(`Update check failed: ${err.message}`); },
  });
}

export function useApplyUpdate() {
  const qc = useQueryClient();
  return useMutation<UpdateApplyResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/apply");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/update/status"] });
      toast.success("Update applied");
    },
    onError: (err: Error) => { toast.error(`Update failed: ${err.message}`); },
  });
}

export function useRestartServer() {
  return useMutation<{ message: string }>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/update/restart");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Server restarting…");
      // Server will die and respawn. Poll until it's back, then reload.
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
      }, 1500);
      // Stop polling after 30s — show manual restart instructions
      setTimeout(() => {
        clearInterval(poll);
        document.title = "Restart failed — restart manually";
      }, 30000);
    },
    onError: (err: Error) => { toast.error(`Restart failed: ${err.message}`); },
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
      toast.success("Update preferences saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save preferences: ${err.message}`); },
  });
}
