// server/routes/pipeline.ts
import { Router, type Request, type Response } from "express";
import { PipelineManager } from "../pipeline/manager";
import { PipelineEventBus } from "../pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../pipeline/types";
import type { PipelineConfig } from "../pipeline/types";
import { getDB, save } from "../db";

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
    res.json(updated);
  });

  // --- Milestone lifecycle ---
  router.post("/api/pipeline/milestone/start", async (req: Request, res: Response) => {
    const { milestoneTaskId, projectId, projectPath, baseBranch, tasks, taskOrder, parallelGroups } = req.body;

    if (!milestoneTaskId || !projectId || !projectPath || !tasks || !taskOrder) {
      return res.status(400).json({ error: "Missing required fields: milestoneTaskId, projectId, projectPath, tasks, taskOrder" });
    }

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
    res.json({ approved: true });
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
