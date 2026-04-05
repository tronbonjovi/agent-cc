import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type { TaskBoardState, TaskItem, TaskConfig, CreateTaskInput, UpdateTaskInput, ReorderInput } from "@shared/task-types";

export function useTaskBoard(projectId: string | undefined) {
  return useQuery<TaskBoardState>({
    queryKey: [`/api/tasks/project/${projectId}`],
    enabled: !!projectId,
  });
}

export function useTaskConfig(projectId: string | undefined) {
  return useQuery<TaskConfig>({
    queryKey: [`/api/tasks/project/${projectId}/config`],
    enabled: !!projectId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const res = await apiRequest("POST", `/api/tasks/project/${projectId}`, input);
      return res.json() as Promise<TaskItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to create task: ${err.message}`); },
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...input }: UpdateTaskInput & { taskId: string }) => {
      const res = await apiRequest("PUT", `/api/tasks/${taskId}?projectId=${projectId}`, input);
      return res.json() as Promise<TaskItem>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to update task: ${err.message}`); },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("DELETE", `/api/tasks/${taskId}?projectId=${projectId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to delete task: ${err.message}`); },
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderInput) => {
      const res = await apiRequest("PUT", `/api/tasks/project/${projectId}/reorder`, input);
      return res.json() as Promise<TaskConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to reorder: ${err.message}`); },
  });
}

export function useUpdateTaskConfig(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<TaskConfig>) => {
      const res = await apiRequest("PUT", `/api/tasks/project/${projectId}/config`, config);
      return res.json() as Promise<TaskConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/project/${projectId}`] });
    },
    onError: (err: Error) => { toast.error(`Failed to update config: ${err.message}`); },
  });
}
