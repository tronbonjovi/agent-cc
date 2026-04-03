import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { MarkdownEntity, MarkdownFileMeta, ContentSearchResult, ContextSummary } from "@shared/types";

export function useMarkdownFiles(category?: string) {
  const params = category ? `?category=${category}` : "";
  return useQuery<MarkdownEntity[]>({
    queryKey: [`/api/markdown${params}`],
    refetchInterval: 10_000,
  });
}

export function useMarkdownContent(id: string | undefined) {
  return useQuery<MarkdownEntity & { content: string }>({
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
      toast.success("File saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save file: ${err.message}`); },
  });
}

export function useCreateMarkdownFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filePath, content }: { filePath: string; content: string }) => {
      const res = await apiRequest("POST", "/api/markdown", { filePath, content });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown"] });
      toast.success("File created");
    },
    onError: (err: Error) => { toast.error(`Failed to create file: ${err.message}`); },
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
      toast.success("Version restored");
    },
    onError: (err: Error) => { toast.error(`Failed to restore version: ${err.message}`); },
  });
}

export interface ValidationIssue {
  type: "broken-path" | "broken-link" | "unknown-port" | "missing-section";
  line?: number;
  message: string;
  value: string;
}

export interface ValidationResult {
  validPaths: string[];
  brokenPaths: string[];
  ports: Array<{ port: number; line: number }>;
  brokenLinks: string[];
  missingSections: string[];
  issues: ValidationIssue[];
}

export function useValidateMarkdown(id: string | undefined) {
  return useQuery<ValidationResult>({
    queryKey: [`/api/markdown/${id}/validate`],
    enabled: false,
  });
}

export function useContentSearch(query: string) {
  return useQuery<ContentSearchResult[]>({
    queryKey: ["/api/markdown/search", query],
    enabled: query.length >= 2,
  });
}

export function useContextSummary() {
  return useQuery<ContextSummary>({
    queryKey: ["/api/markdown/context-summary"],
  });
}

export function useMarkdownMeta() {
  return useQuery<Record<string, MarkdownFileMeta>>({
    queryKey: ["/api/markdown/meta"],
  });
}

export function useUpdateMarkdownMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, meta }: { id: string; meta: Partial<MarkdownFileMeta> }) => {
      const res = await apiRequest("PATCH", `/api/markdown/${id}/meta`, meta);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/markdown/meta"] });
      toast.success("Metadata updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update metadata: ${err.message}`); },
  });
}

export function useBackupContent(id: string | undefined, backupId: number | undefined) {
  return useQuery<{ id: number; content: string; createdAt: string; reason: string }>({
    queryKey: [`/api/markdown/${id}/backup/${backupId}`],
    enabled: !!id && !!backupId,
  });
}
