// server/board/aggregator.ts

import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { getDB, save } from "../db";
import type { TaskItem } from "@shared/task-types";
import type { BoardTask, BoardState, BoardColumn, ProjectMeta, MilestoneMeta, BoardStats } from "@shared/board-types";

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

/** Map a status string to a board column. */
function statusToColumn(status: string, pipelineStage?: string): BoardColumn {
  // Pipeline stage takes precedence if set
  const effective = pipelineStage || status;

  switch (effective) {
    case "backlog":
      return "backlog";
    case "todo":
    case "ready":
    case "queued":
      return "ready";
    case "in-progress":
    case "build":
    case "ai-review":
    case "brainstorm":
    case "plan":
    case "blocked":
      return "in-progress";
    case "review":
    case "human-review":
      return "review";
    case "done":
      return "done";
    default:
      return "backlog";
  }
}

/** Map a TaskItem to a BoardTask. Returns null for non-task types (milestone, roadmap). */
export function mapTaskToBoard(
  task: TaskItem,
  projectId: string,
  projectName: string,
  projectColor: string,
  milestones: TaskItem[],
): BoardTask | null {
  // Skip milestones and roadmaps — they're metadata, not board cards
  if (task.type === "milestone" || task.type === "roadmap") return null;

  const milestone = task.parent
    ? milestones.find(m => m.id === task.parent)
    : undefined;

  return {
    id: task.id,
    title: task.title,
    description: task.body,
    column: statusToColumn(task.status, task.pipelineStage),
    project: projectId,
    projectName,
    projectColor,
    milestone: milestone?.title,
    milestoneId: milestone?.id,
    priority: (task.priority as "high" | "medium" | "low") || "medium",
    dependsOn: task.dependsOn || [],
    tags: task.labels || [],
    assignee: task.assignee,
    sessionId: task.pipelineSessionIds?.[0],
    flagged: task.flagged || (task.pipelineStage === "blocked") || false,
    flagReason: task.flagReason || task.pipelineBlockedReason,
    activity: task.pipelineActivity,
    cost: task.pipelineCost,
    createdAt: task.created,
    updatedAt: task.updated,
  };
}

/** Aggregate tasks from all projects into a single BoardState. */
export function aggregateBoardState(filterProjects?: string[]): BoardState {
  const allEntities = storage.getAllEntities();
  const projectEntities = allEntities.filter(e => e.type === "project");

  const tasks: BoardTask[] = [];
  const projects: ProjectMeta[] = [];
  const milestoneMap = new Map<string, MilestoneMeta>();

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

    // Build milestone progress metadata
    for (const ms of milestoneItems) {
      const children = board.items.filter(t => t.parent === ms.id && t.type === "task");
      milestoneMap.set(ms.id, {
        id: ms.id,
        title: ms.title,
        project: entity.id,
        totalTasks: children.length,
        doneTasks: children.filter(t => statusToColumn(t.status, t.pipelineStage) === "done").length,
      });
    }

    // Map tasks to board format
    for (const item of board.items) {
      const boardTask = mapTaskToBoard(item, entity.id, entity.name, color, milestoneItems);
      if (boardTask) tasks.push(boardTask);
    }
  }

  return {
    tasks,
    columns: ["backlog", "ready", "in-progress", "review", "done"],
    projects,
    milestones: Array.from(milestoneMap.values()),
  };
}

/** Compute quick stats from board state. */
export function computeBoardStats(state: BoardState): BoardStats {
  const byColumn: Record<BoardColumn, number> = {
    "backlog": 0, "ready": 0, "in-progress": 0, "review": 0, "done": 0,
  };
  let activeAgents = 0;
  let totalSpend = 0;
  let flaggedCount = 0;

  for (const task of state.tasks) {
    byColumn[task.column]++;
    if (task.assignee === "ai" && task.column === "in-progress") activeAgents++;
    if (task.cost) totalSpend += task.cost;
    if (task.flagged) flaggedCount++;
  }

  return {
    totalTasks: state.tasks.length,
    byColumn,
    activeAgents,
    totalSpend,
    flaggedCount,
  };
}
