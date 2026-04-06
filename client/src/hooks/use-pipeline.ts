// client/src/hooks/use-pipeline.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// --- API hooks ---

export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline", "status"],
    queryFn: async () => {
      const res = await fetch("/api/pipeline/status");
      if (!res.ok) throw new Error("Failed to fetch pipeline status");
      return res.json();
    },
    refetchInterval: 5000, // poll as backup to SSE
  });
}

export function usePipelineConfig() {
  return useQuery({
    queryKey: ["pipeline", "config"],
    queryFn: async () => {
      const res = await fetch("/api/pipeline/config");
      if (!res.ok) throw new Error("Failed to fetch pipeline config");
      return res.json();
    },
  });
}

export function useUpdatePipelineConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      const res = await fetch("/api/pipeline/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to update pipeline config");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline", "config"] });
    },
  });
}

export function useStartMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opts: {
      milestoneTaskId: string;
      projectId: string;
      baseBranch?: string;
      tasks: unknown[];
      taskOrder: string[];
      parallelGroups?: string[][];
    }) => {
      const res = await fetch("/api/pipeline/milestone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start milestone");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function usePauseMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pipeline/milestone/pause", { method: "POST" });
      if (!res.ok) throw new Error("Failed to pause milestone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useResumeMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pipeline/milestone/resume", { method: "POST" });
      if (!res.ok) throw new Error("Failed to resume milestone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useApproveMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pipeline/milestone/approve", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.reason ?? "Failed to approve milestone");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDescopeTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/pipeline/task/${taskId}/descope`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to descope task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// --- Pipeline SSE ---

interface PipelineEvent {
  type: string;
  taskId?: string;
  stage?: string;
  activity?: string;
  milestoneRunId?: string;
  [key: string]: unknown;
}

export function usePipelineEvents() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/pipeline/events");
    let retryTimer: ReturnType<typeof setTimeout>;

    es.addEventListener("connected", (e) => {
      setConnected(true);
      setLastEvent({ type: "connected", ...JSON.parse(e.data) });
    });

    const eventTypes = [
      "milestone-started", "milestone-paused", "milestone-completed", "milestone-stalled",
      "task-stage-changed", "task-progress", "task-blocked", "task-completed",
      "budget-warning", "budget-exceeded",
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e) => {
        const data = JSON.parse(e.data);
        setLastEvent({ type: eventType, ...data });

        // Invalidate relevant queries on stage changes
        if (eventType.startsWith("task-") || eventType.startsWith("milestone-")) {
          queryClient.invalidateQueries({ queryKey: ["pipeline", "status"] });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
      es.close();
      retryTimer = setTimeout(() => {
        // Will reconnect on next render cycle
      }, 5000);
    };

    return () => {
      es.close();
      clearTimeout(retryTimer);
    };
  }, [queryClient]);

  return { connected, lastEvent };
}
