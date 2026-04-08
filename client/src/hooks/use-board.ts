// client/src/hooks/use-board.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { BoardState, BoardStats, BoardFilter, BoardTask, MoveTaskInput, BoardColumn, SessionEnrichment } from "@shared/board-types";

const BOARD_KEY = ["/api/board"];
const STATS_KEY = ["/api/board/stats"];

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Fetch full board state. Polls every 10s to catch non-board mutations (pipeline, task edits). */
export function useBoardState(filterProjects?: string[]) {
  const params = filterProjects?.length
    ? `?projects=${filterProjects.join(",")}`
    : "";
  return useQuery<BoardState>({
    queryKey: [...BOARD_KEY, filterProjects],
    queryFn: () => apiFetch(`/api/board${params}`),
    refetchInterval: 10_000,
  });
}

/** Fetch board stats. Polls every 10s as fallback for non-board mutations. */
export function useBoardStats() {
  return useQuery<BoardStats>({
    queryKey: STATS_KEY,
    queryFn: () => apiFetch("/api/board/stats"),
    refetchInterval: 10_000,
  });
}

/** Move a task to a column. */
export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, column, force }: { taskId: string; column: BoardColumn; force?: boolean }) =>
      apiFetch(`/api/board/tasks/${taskId}/move`, {
        method: "POST",
        body: JSON.stringify({ column, force } satisfies MoveTaskInput),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Unflag a task without moving it or touching pipeline state. */
export function useUnflagTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/board/tasks/${taskId}/unflag`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Ingest a roadmap into a project. */
export function useIngestRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content }: { projectId: string; content: string }) =>
      apiFetch("/api/board/ingest", {
        method: "POST",
        body: JSON.stringify({ projectId, content }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Subscribe to board SSE events with auto-reconnect. Invalidates queries on events. */
export function useBoardEvents() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let disposed = false;

    const eventTypes = [
      "task-moved", "task-created", "task-updated", "task-deleted",
      "task-flagged", "task-unflagged", "board-refresh", "session-updated",
    ];

    function connect() {
      if (disposed) return;
      es = new EventSource("/api/board/events");

      es.addEventListener("connected", () => {
        setConnected(true);
        retryDelay = 1000; // reset backoff on success
      });

      for (const type of eventTypes) {
        es.addEventListener(type, () => {
          setLastEvent(type);
          qc.invalidateQueries({ queryKey: BOARD_KEY });
          qc.invalidateQueries({ queryKey: STATS_KEY });
        });
      }

      es.onerror = () => {
        setConnected(false);
        es?.close();
        // Reconnect with exponential backoff (max 30s)
        if (!disposed) {
          reconnectTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setConnected(false);
    };
  }, [qc]);

  return { connected, lastEvent };
}

/** Fetch full session data for a board task. Only fetches when sessionId is present. */
export function useTaskSession(taskId: string | null) {
  return useQuery<SessionEnrichment>({
    queryKey: ["/api/board/tasks", taskId, "session"],
    queryFn: () => apiFetch(`/api/board/tasks/${taskId}/session`),
    enabled: !!taskId,
    refetchInterval: 5_000,
  });
}

/** Client-side filter logic. */
export function applyBoardFilters(tasks: BoardTask[], filter: BoardFilter): BoardTask[] {
  return tasks.filter(t => {
    if (filter.projects?.length && !filter.projects.includes(t.project)) return false;
    if (filter.milestones?.length && (!t.milestoneId || !filter.milestones.includes(t.milestoneId))) return false;
    if (filter.priorities?.length && !filter.priorities.includes(t.priority)) return false;
    if (filter.columns?.length && !filter.columns.includes(t.column)) return false;
    if (filter.flagged !== undefined && t.flagged !== filter.flagged) return false;
    if (filter.assignee === "human" && (!t.assignee || t.assignee === "ai")) return false;
    if (filter.assignee === "ai" && t.assignee !== "ai") return false;
    if (filter.assignee === "unassigned" && t.assignee) return false;
    return true;
  });
}
