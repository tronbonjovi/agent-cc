// server/routes/pipeline.ts
import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { PipelineManager } from "../pipeline/manager";
import { PipelineEventBus } from "../pipeline/events";
import { DEFAULT_PIPELINE_CONFIG } from "../pipeline/types";
import type { PipelineConfig, MilestoneRun } from "../pipeline/types";
import { getDB, save } from "../db";
import { storage } from "../storage";
import { updateTaskField } from "../task-io";
import { scanProjectTasks } from "../scanner/task-scanner";
import { getDefaultBranch, branchExists } from "../pipeline/git-ops";
import { setPipelineManager } from "../pipeline/singleton";

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

  // Restore previously persisted run on startup
  const db = getDB();
  const restoredRun = db.pipelineRun ?? null;

  const manager = new PipelineManager({
    config: getConfig(),
    events,
    restoredRun,
    onRunStateChange: (run: MilestoneRun | null) => {
      const db = getDB();
      db.pipelineRun = run;
      save();
    },
    onTaskStatusChange: (taskId, newStatus, projectId) => {
      events.emit("task-stage-changed", { taskId, stage: newStatus });

      // Persist pipeline metadata to the task file so board state and recovery
      // context survive refreshes, SSE disconnects, and restarts.
      // Pass projectId to scope the lookup and prevent cross-project collisions.
      try {
        updateTaskField(taskId, "pipelineStage", newStatus, projectId);

        // Pull additional worker metadata for recovery context
        const run = manager.getStatus();
        const workerState = run?.workers[taskId];
        if (workerState) {
          updateTaskField(taskId, "pipelineBranch", workerState.branchName, projectId);
          updateTaskField(taskId, "pipelineCost", workerState.totalCostUsd, projectId);
          updateTaskField(taskId, "pipelineActivity", workerState.currentActivity, projectId);
          if (newStatus === "blocked") {
            updateTaskField(taskId, "pipelineBlockedReason", workerState.currentActivity, projectId);
            // Persist the stage the task was in before it got blocked
            const previousStage = workerState.stage === "blocked"
              ? workerState.attempts.length > 0 ? "build" : "queued"
              : workerState.stage;
            updateTaskField(taskId, "blockedFromStage", previousStage, projectId);
          }
        }
      } catch {
        // Non-fatal — SSE update is the primary communication channel
      }
    },
  });

  // Wire up edit-freeze guard in tasks router
  setPipelineManager(manager);

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

    // Validate config values — reject impossible settings that would deadlock or disable safeguards
    const errors: string[] = [];
    if (typeof updated.maxConcurrentWorkers !== "number" || updated.maxConcurrentWorkers < 1 || updated.maxConcurrentWorkers > 10) {
      errors.push("maxConcurrentWorkers must be 1–10");
    }
    if (typeof updated.maxClaudeCallsPerTask !== "number" || updated.maxClaudeCallsPerTask < 1) {
      errors.push("maxClaudeCallsPerTask must be >= 1");
    }
    if (typeof updated.maxSelfFixAttempts !== "number" || updated.maxSelfFixAttempts < 0) {
      errors.push("maxSelfFixAttempts must be >= 0");
    }
    if (typeof updated.maxCodexRescueAttempts !== "number" || updated.maxCodexRescueAttempts < 0) {
      errors.push("maxCodexRescueAttempts must be >= 0");
    }
    if (typeof updated.costCeilingPerTaskUsd !== "number" || updated.costCeilingPerTaskUsd <= 0) {
      errors.push("costCeilingPerTaskUsd must be > 0");
    }
    if (typeof updated.costCeilingPerMilestoneUsd !== "number" || updated.costCeilingPerMilestoneUsd <= 0) {
      errors.push("costCeilingPerMilestoneUsd must be > 0");
    }
    if (typeof updated.dailySpendCapUsd !== "number" || updated.dailySpendCapUsd <= 0) {
      errors.push("dailySpendCapUsd must be > 0");
    }
    if (typeof updated.taskTimeoutMs !== "number" || updated.taskTimeoutMs < 10000) {
      errors.push("taskTimeoutMs must be >= 10000 (10s)");
    }
    if (typeof updated.maxTurns !== "number" || updated.maxTurns < 1) {
      errors.push("maxTurns must be >= 1");
    }
    if (typeof updated.model !== "string" || !updated.model.trim()) {
      errors.push("model must be a non-empty string");
    }
    if (typeof updated.testCommand !== "string" || !updated.testCommand.trim()) {
      errors.push("testCommand must be a non-empty string (use \"auto\" for auto-detection)");
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: `Invalid config: ${errors.join("; ")}` });
    }

    saveConfig(updated);
    manager.updateConfig(updated);
    res.json(updated);
  });

  /**
   * Guard: reject mutation requests that don't match the active run's project.
   * Prevents one project's UI from pausing/cancelling/approving another project's run.
   */
  function requireActiveRun(req: Request, res: Response): boolean {
    const run = manager.getStatus();
    if (!run) {
      res.status(409).json({ error: "no active pipeline run" });
      return false;
    }
    const projectId = req.body?.projectId ?? req.query?.projectId;
    if (projectId && projectId !== run.projectId) {
      res.status(403).json({ error: `pipeline run belongs to project ${run.projectId}, not ${projectId}` });
      return false;
    }
    return true;
  }

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

    // Validate taskOrder is a valid topological sort: every dependency must appear
    // before the task that depends on it. The server enforces this because the
    // integration gate merges branches in taskOrder sequence — wrong order causes
    // avoidable merge conflicts or false test failures.
    const orderIndex = new Map((taskOrder as string[]).map((id: string, i: number) => [id, i]));
    for (const id of taskOrder as string[]) {
      const task = taskMap.get(id)!;
      for (const dep of task.dependsOn ?? []) {
        const depIdx = orderIndex.get(dep);
        if (depIdx === undefined) continue; // dep outside this milestone — validated elsewhere
        if (depIdx >= orderIndex.get(id)!) {
          return res.status(400).json({
            error: `Invalid task order: "${id}" depends on "${dep}" but "${dep}" appears later in the order. Re-order tasks so dependencies come first.`,
          });
        }
      }
    }

    // Reject duplicates in taskOrder
    if (new Set(taskOrder as string[]).size !== (taskOrder as string[]).length) {
      return res.status(400).json({ error: "taskOrder contains duplicate task IDs" });
    }

    // Resolve base branch: use client-supplied value, or detect from the repo
    const resolvedBaseBranch: string = baseBranch ?? getDefaultBranch(projectPath);
    if (!branchExists(projectPath, resolvedBaseBranch)) {
      return res.status(400).json({
        error: `Base branch "${resolvedBaseBranch}" does not exist in the repository. Specify a valid baseBranch.`,
      });
    }

    const tasks = (taskOrder as string[]).map((id: string) => taskMap.get(id)!);

    try {
      const run = await manager.startMilestone({
        milestoneTaskId,
        projectId,
        projectPath,
        baseBranch: resolvedBaseBranch,
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

  router.post("/api/pipeline/milestone/pause", (req: Request, res: Response) => {
    if (!requireActiveRun(req, res)) return;
    manager.pause("paused by user");
    res.json({ run: manager.getStatus() });
  });

  router.post("/api/pipeline/milestone/resume", (req: Request, res: Response) => {
    if (!requireActiveRun(req, res)) return;
    manager.resume();
    res.json({ run: manager.getStatus() });
  });

  router.post("/api/pipeline/milestone/approve", async (req: Request, res: Response) => {
    if (!requireActiveRun(req, res)) return;
    const result = await manager.approveMilestone();
    if (!result.approved) {
      return res.status(409).json({ approved: false, reason: result.reason });
    }
    res.json({ approved: true, milestoneBranch: result.milestoneBranch });
  });

  router.post("/api/pipeline/milestone/cancel", async (req: Request, res: Response) => {
    if (!requireActiveRun(req, res)) return;
    await manager.cancelMilestone();
    res.json({ cancelled: true });
  });

  // --- Task actions ---
  router.post("/api/pipeline/task/:taskId/descope", (req: Request, res: Response) => {
    if (!requireActiveRun(req, res)) return;
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
