import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TerminalPanelState } from "@shared/types";

export function useTerminalPanel() {
  return useQuery<TerminalPanelState>({
    queryKey: ["/api/terminal/panel"],
  });
}

export function useUpdateTerminalPanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TerminalPanelState>) => {
      const res = await apiRequest("PATCH", "/api/terminal/panel", patch);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          (q.queryKey[0] as string)?.startsWith("/api/terminal"),
      });
    },
  });
}
