// server/board/aggregator.ts

import { storage } from "../storage";
import { scanProjectTasks, isDbStoredTask } from "../scanner/task-scanner";
import { getDB, save } from "../db";
import { deleteTaskFile } from "../task-io";
import { enrichTaskSession } from "./session-enricher";
import { getCachedSessions } from "../scanner/session-scanner";
import type { SessionData } from "@shared/types";
import type { TaskItem } from "@shared/task-types";
import type { BoardTask, BoardState, BoardColumn, ProjectMeta, MilestoneMeta, BoardStats } from "@shared/board-types";
import { getMilestoneColor } from "@shared/milestone-colors";

// 10 distinct project colors — visually separated, accessible on light/dark
const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
];

/** Get or assign a color for a project. Persisted in DB. */
export function getProjectColor(projectId: string, index: number): string {
  const db = getDB();
  if (db.boardConfig.projectColors[projectId]) {
    return db.boardConfig.projectColors[projectId];
  }
  const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
  db.boardConfig.projectColors[projectId] = color;
  save();
  return color;
}

/** Check if a milestone is archived. */
export function isArchived(milestoneId: string): boolean {
  const db = getDB();
  return db.boardConfig.archivedMilestones.includes(milestoneId);
}

/** Set archive state for a milestone. */
export function setArchived(milestoneId: string, archived: boolean): void {
  const db = getDB();
  const list = db.boardConfig.archivedMilestones;
  const idx = list.indexOf(milestoneId);
  if (archived && idx === -1) {
    list.push(milestoneId);
  } else if (!archived && idx !== -1) {
    list.splice(idx, 1);
  }
  save();
}

/** Delete a DB-stored task by ID. Rejects workflow tasks (non itm- prefix). */
export function deleteDbTask(taskId: string): { deleted: boolean; id?: string; error?: string } {
  if (!isDbStoredTask(taskId)) {
    return { deleted: false, error: "Only DB-stored tasks (itm- prefix) can be deleted" };
  }

  const result = deleteTaskFile(taskId);
  if (!result.deleted) {
    return { deleted: false, error: result.error || `Task not found: ${taskId}` };
  }

  return { deleted: true, id: taskId };
}

/** Get all archived milestone IDs. */
export function getArchivedMilestones(): string[] {
  return getDB().boardConfig.archivedMilestones;
}

/** Map a status string to a board column. Handles both regular task statuses and claude-workflow statuses. */
export function statusToColumn(status: string): BoardColumn {
  switch (status) {
    case "pending":
    case "planned":
    case "todo":
    case "ready":
    case "backlog":
      return "queue";
    case "in-progress":
    case "in_progress":
    case "blocked":
      return "in-progress";
    case "review":
      return "review";
    case "done":
    case "completed":
    case "cancelled":
      return "done";
    default:
      return "queue";
  }
}

/** Map a TaskItem to a BoardTask. Returns null for non-task types (milestone, roadmap). */
export function mapTaskToBoard(
  task: TaskItem,
  projectId: string,
  projectName: string,
  projectColor: string,
  milestones: TaskItem[],
  sessions?: SessionData[],
  milestoneColorMap?: Map<string, string>,
): BoardTask | null {
  // Skip milestones and roadmaps — they're metadata, not board cards
  if (task.type === "milestone" || task.type === "roadmap") return null;

  const milestone = task.parent
    ? milestones.find(m => m.id === task.parent)
    : undefined;

  const linkedSessionId = task.sessionId;
  const enrichment = enrichTaskSession(linkedSessionId, sessions);

  // Blocked workflow tasks get flagged on the board
  const isBlocked = task.status === "blocked";
  const flagged = isBlocked || (task.flagged || false);
  const flagReason = isBlocked ? "Blocked in workflow" : task.flagReason;

  // Milestone color: from pre-computed map, or compute on the fly
  const milestoneColor = milestone?.id
    ? (milestoneColorMap?.get(milestone.id) ?? getMilestoneColor(milestone.id))
    : undefined;

  return {
    id: task.id,
    title: task.title,
    description: task.body,
    column: statusToColumn(task.status),
    project: projectId,
    projectName,
    projectColor,
    milestone: milestone?.title,
    milestoneId: milestone?.id,
    milestoneColor,
    priority: (task.priority as "high" | "medium" | "low") || "medium",
    dependsOn: task.dependsOn || [],
    tags: task.labels || [],
    assignee: task.assignee,
    sessionId: linkedSessionId,
    source: isDbStoredTask(task.id) ? "db" : "workflow",
    flagged,
    flagReason,
    session: enrichment,
    createdAt: task.created,
    updatedAt: task.updated,
  };
}

/** Aggregate tasks from all projects into a single BoardState. */
export function aggregateBoardState(filterProjects?: string[], includeArchived?: boolean): BoardState {
  const allEntities = storage.getAllEntities();
  const projectEntities = allEntities.filter(e => e.type === "project");

  const tasks: BoardTask[] = [];
  const projects: ProjectMeta[] = [];
  const milestoneMap = new Map<string, MilestoneMeta>();
  const sessions = getCachedSessions();

  for (let i = 0; i < projectEntities.length; i++) {
    const entity = projectEntities[i];
    if (filterProjects && !filterProjects.includes(entity.id)) continue;

    const color = getProjectColor(entity.id, i);
    projects.push({ id: entity.id, name: entity.name, color });

    let board;
    try {
      board = scanProjectTasks(entity.path, entity.id, entity.name);
    } catch {
      continue; // Skip projects that fail to scan
    }

    // Extract milestones for parent resolution
    const milestoneItems = board.items.filter(t => t.type === "milestone");

    // Determine which milestones are archived (for filtering)
    const archivedSet = includeArchived ? new Set<string>() : new Set(getArchivedMilestones());

    // Build milestone progress metadata with colors
    const milestoneColorMap = new Map<string, string>();
    for (const ms of milestoneItems) {
      if (archivedSet.has(ms.id)) continue;
      const msColor = getMilestoneColor(ms.id);
      milestoneColorMap.set(ms.id, msColor);
      const children = board.items.filter(t => t.parent === ms.id && t.type === "task");
      milestoneMap.set(ms.id, {
        id: ms.id,
        title: ms.title,
        project: entity.id,
        color: msColor,
        totalTasks: children.length,
        doneTasks: children.filter(t => statusToColumn(t.status) === "done").length,
      });
    }

    // Map tasks to board format (skip tasks belonging to archived milestones)
    for (const item of board.items) {
      if (item.parent && archivedSet.has(item.parent)) continue;
      const boardTask = mapTaskToBoard(item, entity.id, entity.name, color, milestoneItems, sessions, milestoneColorMap);
      if (boardTask) tasks.push(boardTask);
    }
  }

  // Identify fully-completed milestones (all tasks done/cancelled/completed)
  // and filter their tasks out of kanban columns — they show in the completed milestones zone instead
  const allMilestones = Array.from(milestoneMap.values());
  const completedMilestoneIds = new Set<string>();
  for (const ms of allMilestones) {
    if (ms.totalTasks > 0 && ms.doneTasks === ms.totalTasks) {
      completedMilestoneIds.add(ms.id);
    }
  }

  const kanbanTasks = completedMilestoneIds.size > 0
    ? tasks.filter(t => !t.milestoneId || !completedMilestoneIds.has(t.milestoneId))
    : tasks;

  return {
    tasks: kanbanTasks,
    columns: ["queue", "in-progress", "review", "done"],
    projects,
    milestones: allMilestones,
  };
}

/** Compute quick stats from board state. */
export function computeBoardStats(state: BoardState): BoardStats {
  const byColumn: Record<BoardColumn, number> = {
    "queue": 0, "in-progress": 0, "review": 0, "done": 0,
  };
  let activeAgents = 0;
  let flaggedCount = 0;

  for (const task of state.tasks) {
    byColumn[task.column]++;
    if (task.assignee === "ai" && task.column === "in-progress") activeAgents++;
    if (task.flagged) flaggedCount++;
  }

  return {
    totalTasks: state.tasks.length,
    byColumn,
    activeAgents,
    totalSpend: 0,
    flaggedCount,
  };
}
