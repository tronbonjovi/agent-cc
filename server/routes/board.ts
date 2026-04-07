// server/routes/board.ts

import { Router } from "express";
import { aggregateBoardState, computeBoardStats } from "../board/aggregator";
import { validateMove, checkAutoUnflag } from "../board/validator";
import { updateTaskField } from "../task-io";
import type { BoardEventBus } from "../board/events";
import type { MoveTaskInput, BoardColumn } from "@shared/board-types";

const VALID_COLUMNS = ["backlog", "ready", "in-progress", "review", "done"];

export function createBoardRouter(events: BoardEventBus): Router {
  const router = Router();

  // GET /api/board — full aggregated board state
  router.get("/api/board", (req, res) => {
    const filterProjects = req.query.projects
      ? (req.query.projects as string).split(",")
      : undefined;
    const state = aggregateBoardState(filterProjects);
    return res.json(state);
  });

  // GET /api/board/stats — quick stats
  router.get("/api/board/stats", (_req, res) => {
    const state = aggregateBoardState();
    const stats = computeBoardStats(state);
    return res.json(stats);
  });

  // POST /api/board/tasks/:id/move — move task to column with validation
  router.post("/api/board/tasks/:id/move", (req, res) => {
    const { id } = req.params;
    const { column, force }: MoveTaskInput = req.body;

    if (!column || !VALID_COLUMNS.includes(column)) {
      return res.status(400).json({ error: `Invalid column: ${column}` });
    }

    // Find the task across all projects
    const state = aggregateBoardState();
    const task = state.tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Validate dependencies
    const validation = validateMove(task, column as BoardColumn, state.tasks, force);

    try {
      // Update the task status
      updateTaskField(id, "status", column, task.project);

      // Update flag state
      if (validation.flag) {
        updateTaskField(id, "flagged", true, task.project);
        updateTaskField(id, "flagReason", validation.flag.reason, task.project);
      } else if (task.flagged) {
        // Clear flag if previously flagged and now valid
        updateTaskField(id, "flagged", false, task.project);
        updateTaskField(id, "flagReason", undefined, task.project);
      }

      // Check if any other flagged tasks should auto-unflag
      if (column === "done") {
        const updatedTask = { ...task, column: column as BoardColumn };
        const otherTasks = state.tasks.filter(t => t.id !== id);
        const allTasksUpdated = [...otherTasks, updatedTask];

        for (const other of otherTasks) {
          if (other.flagged && checkAutoUnflag(other, allTasksUpdated)) {
            updateTaskField(other.id, "flagged", false, other.project);
            updateTaskField(other.id, "flagReason", undefined, other.project);
            events.emit("task-unflagged", { taskId: other.id });
          }
        }
      }
    } catch {
      return res.status(500).json({ error: "Failed to update task" });
    }

    // Emit event
    events.emit("task-moved", { taskId: id, column, flagged: !!validation.flag });
    if (validation.flag) {
      events.emit("task-flagged", { taskId: id, reason: validation.flag.reason });
    }

    return res.json({
      id,
      column,
      flagged: !!validation.flag,
      flagReason: validation.flag?.reason,
    });
  });

  // GET /api/board/events — SSE stream
  router.get("/api/board/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connected event
    res.write("event: connected\ndata: {}\n\n");

    const cleanup = events.addClient((data: string) => {
      res.write(data);
    });

    req.on("close", cleanup);
  });

  return router;
}
