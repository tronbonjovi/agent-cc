// server/routes/board.ts

import { Router } from "express";
import path from "path";
import fs from "fs";
import { aggregateBoardState, computeBoardStats } from "../board/aggregator";
import { validateMove, checkAutoUnflag } from "../board/validator";
import { updateTaskField, generateTaskId, taskFilename, writeTaskFile } from "../task-io";
import { parseRoadmapMarkdown } from "../board/ingest";
import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { getPipelineManager } from "./tasks";
import type { BoardEventBus } from "../board/events";
import type { MoveTaskInput, BoardColumn } from "@shared/board-types";
import type { TaskItem } from "@shared/task-types";

const NON_TERMINAL_PIPELINE = new Set(["running", "pausing", "paused", "awaiting_approval", "cancelling"]);

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

    // Pipeline freeze check: reject moves for tasks in active pipeline runs
    const pm = getPipelineManager();
    if (pm) {
      const ps = pm.getStatus();
      if (ps && NON_TERMINAL_PIPELINE.has(ps.status)) {
        // Check if this task's parent milestone is the active run's milestone
        const parentId = state.tasks.find(t => t.id === id)?.milestoneId;
        if (parentId && parentId === ps.milestoneTaskId) {
          return res.status(409).json({
            error: "Cannot move — this task belongs to an active pipeline run. Wait for it to complete or cancel it first.",
          });
        }
      }
    }

    // Validate dependencies
    const validation = validateMove(task, column as BoardColumn, state.tasks, force);

    try {
      // Update the task status
      updateTaskField(id, "status", column, task.project);
      // Clear pipelineStage so the aggregator uses the new status as source of truth
      updateTaskField(id, "pipelineStage", undefined, task.project);

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
        // Use post-write state: column is done, flag reflects what we just wrote
        const updatedTask = { ...task, column: column as BoardColumn, flagged: !!validation.flag };
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

  // POST /api/board/ingest — bulk import from roadmap
  router.post("/api/board/ingest", (req, res) => {
    const { projectId, content } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    if (!content) return res.status(400).json({ error: "content is required" });

    const entity = storage.getEntity(projectId);
    if (!entity || entity.type !== "project") {
      return res.status(404).json({ error: "Project not found" });
    }

    const parsed = parseRoadmapMarkdown(content);

    const tasksDir = path.join(entity.path, ".claude", "tasks").replace(/\\/g, "/");
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true, mode: 0o775 });
    }

    // Build composite-key→ID index from existing items for dedup and dependency resolution
    // Key: "type:parent:title" to avoid merging unrelated tasks with same title
    const existingByKey = new Map<string, string>();
    try {
      const existing = scanProjectTasks(entity.path, entity.id, entity.name, { includeRemoved: true });
      for (const item of existing.items) {
        const key = `${item.type}:${item.parent || ""}:${item.title}`;
        existingByKey.set(key, item.id);
      }
    } catch {
      // If scan fails, proceed without dedup — safe because we only skip, never overwrite
    }

    // Create milestone tasks (skip duplicates by composite key, resolve existing IDs)
    let milestonesCreated = 0;
    let milestonesSkipped = 0;
    const milestoneIdMap = new Map<string, string>();
    for (const ms of parsed.milestones) {
      const key = `milestone::${ms.title}`;
      const existingId = existingByKey.get(key);
      if (existingId) {
        // Map the roadmap ID to the existing task's real ID so children resolve correctly
        milestoneIdMap.set(ms.id, existingId);
        milestonesSkipped++;
        continue;
      }
      const id = generateTaskId();
      milestoneIdMap.set(ms.id, id);
      const task: TaskItem = {
        id,
        title: ms.title,
        type: "milestone",
        status: "backlog",
        priority: ms.priority,
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
        body: "",
        filePath: path.join(tasksDir, taskFilename("milestone", ms.title, id)).replace(/\\/g, "/"),
      };
      writeTaskFile(task.filePath, task);
      milestonesCreated++;
    }

    // Create task items (skip duplicates by composite key, resolve existing IDs for deps)
    let tasksCreated = 0;
    let tasksSkipped = 0;
    const taskIdMap = new Map<string, string>();
    const skippedTaskIds = new Set<string>();
    // First pass: generate IDs for new tasks, resolve existing for duplicates
    for (const t of parsed.tasks) {
      const parentId = t.milestone ? milestoneIdMap.get(t.milestone) : undefined;
      const key = `task:${parentId || ""}:${t.title}`;
      const existingId = existingByKey.get(key);
      if (existingId) {
        // Map the roadmap ID to the existing task's real ID so deps resolve correctly
        taskIdMap.set(t.id, existingId);
        skippedTaskIds.add(t.id);
        tasksSkipped++;
        continue;
      }
      taskIdMap.set(t.id, generateTaskId());
    }
    // Second pass: create only new tasks, with fully resolved dependencies
    for (const t of parsed.tasks) {
      if (skippedTaskIds.has(t.id)) continue;
      const id = taskIdMap.get(t.id)!;
      const deps = t.dependsOn
        .map((d: string) => taskIdMap.get(d))
        .filter((d: string | undefined): d is string => !!d);

      const task: TaskItem = {
        id,
        title: t.title,
        type: "task",
        status: "backlog",
        priority: t.priority,
        parent: t.milestone ? milestoneIdMap.get(t.milestone) : undefined,
        dependsOn: deps.length > 0 ? deps : undefined,
        created: new Date().toISOString().split("T")[0],
        updated: new Date().toISOString().split("T")[0],
        body: "",
        filePath: path.join(tasksDir, taskFilename("task", t.title, id)).replace(/\\/g, "/"),
      };
      writeTaskFile(task.filePath, task);
      tasksCreated++;
    }

    events.emit("board-refresh", { projectId });

    return res.status(201).json({
      tasksCreated,
      milestonesCreated,
      tasksSkipped,
      milestonesSkipped,
      taskIdMap: Object.fromEntries(taskIdMap),
      milestoneIdMap: Object.fromEntries(milestoneIdMap),
    });
  });

  return router;
}
