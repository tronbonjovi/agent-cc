import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Entity } from "@shared/types";

export function useMarkdownFiles(category?: string) {
  const params = category ? `?category=${category}` : "";
  return useQuery<Entity[]>({
    queryKey: [`/api/markdown${params}`],
  });
}

export function useMarkdownContent(id: string | undefined) {
  return useQuery<Entity & { content: string }>({
    queryKey: [`/api/markdown/${id}`],
    enabled: !!id,
  });
}

export function useMarkdownHistory(id: string | undefined) {
  return useQuery<{ id: number; createdAt: string; reason: string; sizeBytes: number }[]>({
    queryKey: [`/api/markdown/${id}/history`],
    enabled: !!id,
  });
}

export function useSaveMarkdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("PUT", `/api/markdown/${id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
    },
  });
}

export function useRestoreMarkdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, backupId }: { id: string; backupId: number }) => {
      const res = await apiRequest("POST", `/api/markdown/${id}/restore/${backupId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
    },
  });
}
