import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { PromptTemplate } from "@shared/types";

const KEY = ["/api/sessions/prompts"];

export function usePromptTemplates() {
  return useQuery<PromptTemplate[]>({ queryKey: KEY });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; prompt: string; project?: string; tags?: string[] }) => {
      const res = await apiRequest("POST", "/api/sessions/prompts", data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt created");
    },
    onError: (err: Error) => { toast.error(`Failed to create prompt: ${err.message}`); },
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; prompt?: string; tags?: string[]; isFavorite?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/sessions/prompts/${id}`, data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update prompt: ${err.message}`); },
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/prompts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Prompt deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete prompt: ${err.message}`); },
  });
}
