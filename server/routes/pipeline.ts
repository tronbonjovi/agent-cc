// server/routes/pipeline.ts
import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { PipelineManager } from "../pipeline/manager";
import { PipelineEventBus } from "../pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../pipeline/types";
import type { PipelineConfig } from "../pipeline/types";
import { getDB, save } from "../db";
import { storage } from "../storage";
import { updateTaskField } from "../task-io";
import { scanProjectTasks } from "../scanner/task-scanner";

/** Resolve a project path from a trusted project ID. Returns null if invalid. */
function resolveProjectPath(projectId: string): string | null {
  const entities = storage.getEntities("project");
  const project = entities.find((e) => e.id === projectId);
  if (!project || !(project as any).path) return null;
  const projectPath = (project as any).path as string;
  // Verify it exists and is a git repo
  try {
    const gitDir = path.join(projectPath, ".git");
    if (!fs.existsSync(gitDir)) return null;
  } catch {
    return null;
  }
  return projectPath;
}

export function createPipelineRouter(events: PipelineEventBus): Router {
  const router = Router();

  // Load config from DB, falling back to defaults
  function getConfig(): PipelineConfig {
    const db = getDB();
    return db.pipelineConfig ?? DEFAULT_PIPELINE_CONFIG;
  }

  function saveConfig(config: PipelineConfig): void {
    const db = getDB();
    db.pipelineConfig = config;
    save();
  }

  const manager = new PipelineManager({
    config: getConfig(),
    events,
    onTaskStatusChange: (taskId, newStatus) => {
      events.emit("task-stage-changed", { taskId, stage: newStatus });

      // Persist pipeline stage to the task file so board state survives refreshes
      try {
        updateTaskField(taskId, "pipelineStage", newStatus);
      } catch {
        // Non-fatal — SSE update is the primary communication channel
      }
    },
  });

  // --- Status ---
  router.get("/api/pipeline/status", (_req: Request, res: Response) => {
    res.json({ run: manager.getStatus() });
  });

  // --- Config ---
  router.get("/api/pipeline/config", (_req: Request, res: Response) => {
    res.json(getConfig());
  });

  router.put("/api/pipeline/config", (req: Request, res: Response) => {
    const current = getConfig();
    const updated = { ...current, ...req.body };
    saveConfig(updated);
    manager.updateConfig(updated);
    res.json(updated);
  });

  // --- Milestone lifecycle ---
  router.post("/api/pipeline/milestone/start", async (req: Request, res: Response) => {
    const { milestoneTaskId, projectId, baseBranch, taskOrder, parallelGroups } = req.body;

    if (!milestoneTaskId || !projectId || !taskOrder) {
      return res.status(400).json({ error: "Missing required fields: milestoneTaskId, projectId, taskOrder" });
    }

    // Resolve project path from trusted server-side project store — never trust client-supplied paths
    const projectPath = resolveProjectPath(projectId);
    if (!projectPath) {
      return res.status(400).json({ error: `Unknown project or not a git repository: ${projectId}` });
    }

    // Load tasks from trusted server-side task store — never trust client-supplied task payloads
    const project = storage.getEntities("project").find((e) => e.id === projectId);
    const projectName = project ? (project as any).name ?? projectId : projectId;
    const board = scanProjectTasks(projectPath, projectId, projectName);

    // Validate every requested task ID exists in this project's board AND belongs to the milestone
    const taskMap = new Map(board.items.map((t) => [t.id, t]));
    const invalidIds = (taskOrder as string[]).filter((id: string) => !taskMap.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Task IDs not found in project: ${invalidIds.join(", ")}` });
    }

    // Scope: only tasks that are children of this milestone and type === "task"
    const scopeErrors = (taskOrder as string[]).filter((id: string) => {
      const task = taskMap.get(id)!;
      return task.parent !== milestoneTaskId || task.type !== "task";
    });
    if (scopeErrors.length > 0) {
      return res.status(400).json({
        error: `Task IDs not scoped to milestone ${milestoneTaskId}: ${scopeErrors.join(", ")}. Tasks must be children of the milestone with type "task".`,
      });
    }

    const tasks = (taskOrder as string[]).map((id: string) => taskMap.get(id)!);

    try {
      const run = await manager.startMilestone({
        milestoneTaskId,
        projectId,
        projectPath,
        baseBranch: baseBranch ?? "main",
        tasks,
        taskOrder,
        parallelGroups: parallelGroups ?? [],
      });
      res.json({ run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(409).json({ error: msg });
    }
  });

  router.post("/api/pipeline/milestone/pause", (_req: Request, res: Response) => {
    manager.pause("paused by user");
    res.json({ run: manager.getStatus() });
  });

  router.post("/api/pipeline/milestone/resume", (_req: Request, res: Response) => {
    manager.resume();
    res.json({ run: manager.getStatus() });
  });

  router.post("/api/pipeline/milestone/approve", async (_req: Request, res: Response) => {
    const result = await manager.approveMilestone();
    if (!result.approved) {
      return res.status(409).json({ approved: false, reason: result.reason });
    }
    res.json({ approved: true, milestoneBranch: result.milestoneBranch });
  });

  router.post("/api/pipeline/milestone/cancel", async (_req: Request, res: Response) => {
    await manager.cancelMilestone();
    res.json({ cancelled: true });
  });

  // --- Task actions ---
  router.post("/api/pipeline/task/:taskId/descope", (req: Request, res: Response) => {
    const taskId = req.params.taskId as string;
    const descoped = manager.descopeTask(taskId);
    res.json({ descoped, run: manager.getStatus() });
  });

  router.get("/api/pipeline/blocked", (_req: Request, res: Response) => {
    res.json({ blocked: manager.getBlockedTasks() });
  });

  // --- Pipeline SSE events ---
  router.get("/api/pipeline/events", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send current state
    res.write(`event: connected\ndata: ${JSON.stringify({
      run: manager.getStatus(),
    })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(":keepalive\n\n");
    }, 30000);

    const remove = events.addClient((data: string) => {
      res.write(data);
    });

    req.on("close", () => {
      clearInterval(keepAlive);
      remove();
    });
  });

  return router;
}
