// client/src/hooks/use-board.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import type { BoardState, BoardStats, BoardFilter, BoardTask, MoveTaskInput, BoardColumn, SessionEnrichment, MilestoneMeta } from "@shared/board-types";
import type { ProjectCardData } from "@/components/board/project-card";
import { useProjects } from "./use-projects";

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

/** Fetch full board state. Polls every 10s to catch non-board mutations (task edits). */
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

/** Unflag a task without moving it. */
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

/** Archive a completed milestone. */
export function useArchiveMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: string) =>
      apiFetch(`/api/board/milestones/${milestoneId}/archive`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
      qc.invalidateQueries({ queryKey: ARCHIVED_KEY });
    },
  });
}

/** Fetch archived milestones. */
const ARCHIVED_KEY = ["/api/board/milestones/archived"];
export function useArchivedMilestones() {
  return useQuery<MilestoneMeta[]>({
    queryKey: ARCHIVED_KEY,
    queryFn: () => apiFetch("/api/board/milestones/archived"),
  });
}

/** Link or unlink a session to a board task. */
export function useLinkSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, sessionId }: { taskId: string; sessionId: string | null }) =>
      apiFetch(`/api/board/tasks/${taskId}/link-session`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
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

/** Delete a DB-stored task. */
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/board/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY });
      qc.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

/** Map entity health to ProjectCardData health */
function mapHealth(health: string): ProjectCardData["health"] {
  switch (health) {
    case "ok": return "healthy";
    case "warning": return "warning";
    case "error": return "critical";
    default: return "unknown";
  }
}

/** Merge project API data with board state to produce ProjectCardData[]. */
export function useBoardProjects(): ProjectCardData[] {
  const { data: projects } = useProjects();
  const { data: board } = useBoardState();

  return useMemo(() => {
    if (!projects || !board) return [];

    const boardProjectIds = board.projects.map((bp) => bp.id);

    return projects.map((p) => {
      const isCurrent = boardProjectIds.length > 0 && boardProjectIds[0] === p.id;
      const projectMilestones = board.milestones.filter((m) => m.project === p.id);
      const projectTasks = board.tasks.filter((t) => t.project === p.id);
      const doneTasks = projectTasks.filter((t) => t.column === "done").length;
      const inProgressTasks = projectTasks.filter((t) => t.column === "in-progress").length;
      const totalCost = projectTasks.reduce(
        (sum, t) => sum + (t.session?.costUsd ?? 0),
        0,
      );

      return {
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        health: mapHealth(p.health),
        sessionCount: p.data.sessionCount,
        totalCost,
        milestoneCount: projectMilestones.length,
        taskCount: projectTasks.length,
        doneTasks,
        inProgressTasks,
        isCurrent,
      };
    });
  }, [projects, board]);
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
