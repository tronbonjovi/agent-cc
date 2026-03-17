import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SessionData, SessionStats } from "@shared/types";

export function useSessions(params?: { q?: string; sort?: string; order?: string; hideEmpty?: boolean; activeOnly?: boolean; project?: string }) {
  const p = new URLSearchParams();
  if (params?.q) p.set("q", params.q);
  if (params?.sort) p.set("sort", params.sort);
  if (params?.order) p.set("order", params.order);
  if (params?.hideEmpty) p.set("hideEmpty", "true");
  if (params?.activeOnly) p.set("activeOnly", "true");
  if (params?.project) p.set("project", params.project);
  const qs = p.toString();
  return useQuery<{ sessions: SessionData[]; stats: SessionStats }>({
    queryKey: [`/api/sessions${qs ? `?${qs}` : ""}`],
  });
}

export function useSessionDetail(id: string | undefined) {
  return useQuery<SessionData & { records: { type: string; role?: string; timestamp: string; contentPreview: string }[] }>({
    queryKey: [`/api/sessions/${id}`],
    enabled: !!id,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });
}

export function useBulkDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/sessions", { ids });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });
}

export function useOpenSession() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/open`);
      return res.json();
    },
  });
}

export function useDeleteAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/delete-all");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });
}

export function useUndoDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/undo");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });
}
