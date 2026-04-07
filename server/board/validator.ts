// server/board/validator.ts

import type { BoardTask, BoardColumn } from "@shared/board-types";

interface MoveValidation {
  allowed: boolean;
  flag?: { flagged: boolean; reason: string };
}

// Columns that trigger dependency validation
const WORK_COLUMNS = new Set<BoardColumn>(["in-progress", "review", "done"]);

/** Validate a task move. Returns allowed + optional flag info. */
export function validateMove(
  task: BoardTask,
  targetColumn: BoardColumn,
  allTasks: BoardTask[],
  force = false,
): MoveValidation {
  // Always allow the move — we flag, not block
  const result: MoveValidation = { allowed: true };

  // Only validate dependencies for work columns (not backlog/ready)
  if (force || !WORK_COLUMNS.has(targetColumn) || task.dependsOn.length === 0) {
    return result;
  }

  // Find unfinished dependencies
  const unfinished: string[] = [];
  for (const depId of task.dependsOn) {
    const dep = allTasks.find(t => t.id === depId);
    if (!dep || dep.column !== "done") {
      unfinished.push(dep ? `${dep.title} (${depId})` : depId);
    }
  }

  if (unfinished.length > 0) {
    result.flag = {
      flagged: true,
      reason: `Waiting on: ${unfinished.join(", ")}`,
    };
  }

  return result;
}

/** Check if a flagged task's dependencies are now all done. */
export function checkAutoUnflag(task: BoardTask, allTasks: BoardTask[]): boolean {
  if (!task.flagged || task.dependsOn.length === 0) return false;

  return task.dependsOn.every(depId => {
    const dep = allTasks.find(t => t.id === depId);
    return dep?.column === "done";
  });
}
