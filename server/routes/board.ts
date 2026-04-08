// server/routes/board.ts

import { Router } from "express";
import path from "path";
import fs from "fs";
import { aggregateBoardState, computeBoardStats, setArchived, getArchivedMilestones } from "../board/aggregator";
import { validateMove, checkAutoUnflag } from "../board/validator";
import { updateTaskField, generateTaskId, taskFilename, writeTaskFile, taskFileIndex } from "../task-io";
import { parseRoadmapMarkdown } from "../board/ingest";
import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import type { BoardEventBus } from "../board/events";
import type { MoveTaskInput, BoardColumn } from "@shared/board-types";
import type { TaskItem } from "@shared/task-types";

const VALID_COLUMNS = ["backlog", "ready", "in-progress", "review", "done"];

export function createBoardRouter(events: BoardEventBus): Router {
  const router = Router();

  // GET /api/board — full aggregated board state
  router.get("/api/board", (req, res) => {
    const filterProjects = req.query.projects
      ? (req.query.projects as string).split(",")
      : undefined;
    const includeArchived = req.query.includeArchived === "true";
    const state = aggregateBoardState(filterProjects, includeArchived);
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

  // POST /api/board/tasks/:id/unflag — clear flag without moving
  router.post("/api/board/tasks/:id/unflag", (req, res) => {
    const { id } = req.params;
    const state = aggregateBoardState();
    const task = state.tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    try {
      updateTaskField(id, "flagged", false, task.project);
      updateTaskField(id, "flagReason", undefined, task.project);
    } catch {
      return res.status(500).json({ error: "Failed to unflag task" });
    }

    events.emit("task-unflagged", { taskId: id });
    return res.json({ id, flagged: false });
  });

  // POST /api/board/milestones/:id/archive — archive a completed milestone
  router.post("/api/board/milestones/:id/archive", (req, res) => {
    const { id } = req.params;

    // Verify milestone exists (check with archived included so we can find it)
    const state = aggregateBoardState(undefined, true);
    const milestone = state.milestones.find(m => m.id === id);
    if (!milestone) {
      return res.status(404).json({ error: "Milestone not found" });
    }

    setArchived(id, true);
    events.emit("board-refresh", { milestoneId: id, action: "archived" });
    return res.json({ id, archived: true });
  });

  // GET /api/board/milestones/archived — list archived milestones
  router.get("/api/board/milestones/archived", (_req, res) => {
    const archivedIds = getArchivedMilestones();
    // Get full milestone metadata by fetching with archived included
    const state = aggregateBoardState(undefined, true);
    const archivedMilestones = state.milestones.filter(m => archivedIds.includes(m.id));
    return res.json(archivedMilestones);
  });

  // GET /api/board/tasks/:id/session — Get session enrichment for a board task
  router.get("/api/board/tasks/:id/session", (req, res) => {
    try {
      const state = aggregateBoardState();
      const task = state.tasks.find(t => t.id === req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      if (!task.session) return res.status(404).json({ error: "No session linked to this task" });
      res.json(task.session);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch session data" });
    }
  });

  // POST /api/board/tasks/:id/link-session — Link or unlink a session
  router.post("/api/board/tasks/:id/link-session", (req, res) => {
    try {
      const { sessionId } = req.body;  // null or string
      const state = aggregateBoardState();
      const task = state.tasks.find(t => t.id === req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      updateTaskField(req.params.id, "sessionId", sessionId || undefined, task.project);
      events.emit("session-updated", { taskId: req.params.id, sessionId: sessionId || null });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to link session" });
    }
  });

  // DELETE /api/board/tasks/:id — delete a DB-stored task
  router.delete("/api/board/tasks/:id", (req, res) => {
    const { id } = req.params;

    // Only allow deleting DB-stored tasks (itm- prefix)
    if (!id.startsWith("itm-")) {
      return res.status(403).json({ error: "Only DB-stored tasks can be deleted" });
    }

    const state = aggregateBoardState();
    const task = state.tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Workflow tasks cannot be deleted via API
    if (task.source === "workflow") {
      return res.status(403).json({ error: "Workflow tasks cannot be deleted" });
    }

    try {
      // Find and delete the task file
      const key = `${task.project}:${id}`;
      const filePath = taskFileIndex.get(key);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      return res.status(500).json({ error: "Failed to delete task" });
    }

    events.emit("task-deleted", { taskId: id });
    return res.json({ id, deleted: true });
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
