import { Router } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { scanProjectTasks } from "../scanner/task-scanner";
import { parseTaskFile, writeTaskFile, parseConfigFile, writeConfigFile, generateTaskId, taskFilename } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskItem, CreateTaskInput, UpdateTaskInput, ReorderInput } from "@shared/task-types";

const router = Router();

function getProjectPath(projectId: string): string | null {
  const entity = storage.getEntity(projectId);
  if (!entity || entity.type !== "project") return null;
  return entity.path;
}

function getTasksDir(projectPath: string): string {
  return path.join(projectPath, ".claude", "tasks").replace(/\\/g, "/");
}

function findTaskFile(tasksDir: string, taskId: string): TaskItem | null {
  if (!fs.existsSync(tasksDir)) return null;
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_config.md") continue;
    const filePath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const task = parseTaskFile(filePath);
    if (task && task.id === taskId) return task;
  }
  return null;
}

// GET /api/tasks/project/:projectId
router.get("/api/tasks/project/:projectId", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const entity = storage.getEntity(req.params.projectId)!;
  const board = scanProjectTasks(projectPath, req.params.projectId, entity.name);
  return res.json(board);
});

// GET /api/tasks/project/:projectId/config — must be before /:taskId to avoid collision
router.get("/api/tasks/project/:projectId/config", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const configPath = path.join(getTasksDir(projectPath), "_config.md");
  const config = parseConfigFile(configPath);
  return res.json(config || DEFAULT_TASK_CONFIG);
});

// GET /api/tasks/:taskId
router.get("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });
  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const task = findTaskFile(getTasksDir(projectPath), req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  return res.json(task);
});

// POST /api/tasks/project/:projectId
router.post("/api/tasks/project/:projectId", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const tasksDir = getTasksDir(projectPath);
  if (!fs.existsSync(tasksDir)) {
    try {
      fs.mkdirSync(tasksDir, { recursive: true });
      writeConfigFile(path.join(tasksDir, "_config.md"), { ...DEFAULT_TASK_CONFIG });
    } catch (err) {
      return res.status(403).json({ error: "Cannot create tasks directory — not writable" });
    }
  }
  const input: CreateTaskInput = req.body;
  if (!input.title) return res.status(400).json({ error: "title is required" });
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath) || { ...DEFAULT_TASK_CONFIG };
  const id = generateTaskId();
  const now = new Date().toISOString().split("T")[0];
  const task: TaskItem = {
    id,
    title: input.title,
    type: input.type || config.defaultType,
    status: input.status || config.statuses[0],
    parent: input.parent,
    priority: input.priority || config.defaultPriority,
    labels: input.labels,
    created: now,
    updated: now,
    body: input.body || "",
    filePath: "",
  };
  const filename = taskFilename(task.type, task.title, id);
  task.filePath = path.join(tasksDir, filename).replace(/\\/g, "/");
  try {
    writeTaskFile(task.filePath, task);
  } catch (err) {
    return res.status(500).json({ error: "Failed to write task file" });
  }
  const col = config.columnOrder[task.status];
  if (col) { col.push(id); } else { config.columnOrder[task.status] = [id]; }
  writeConfigFile(configPath, config);
  return res.status(201).json(task);
});

// PUT /api/tasks/project/:projectId/reorder — must be before /:taskId to avoid collision
router.put("/api/tasks/project/:projectId/reorder", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const tasksDir = getTasksDir(projectPath);
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath);
  if (!config) return res.status(404).json({ error: "Board not initialized" });
  const input: ReorderInput = req.body;
  if (!input.columnOrder) return res.status(400).json({ error: "columnOrder required" });
  config.columnOrder = input.columnOrder;
  writeConfigFile(configPath, config);
  return res.json(config);
});

// PUT /api/tasks/project/:projectId/config
router.put("/api/tasks/project/:projectId/config", (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const tasksDir = getTasksDir(projectPath);
  if (!fs.existsSync(tasksDir)) {
    try {
      fs.mkdirSync(tasksDir, { recursive: true });
    } catch {
      return res.status(403).json({ error: "Cannot create tasks directory — not writable" });
    }
  }
  const configPath = path.join(tasksDir, "_config.md");
  const existing = parseConfigFile(configPath);
  const config = { ...(existing || DEFAULT_TASK_CONFIG), ...req.body };
  if (!req.body.columnOrder && existing) {
    config.columnOrder = existing.columnOrder;
  }
  writeConfigFile(configPath, config);
  return res.json(config);
});

// PUT /api/tasks/:taskId
router.put("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });
  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const tasksDir = getTasksDir(projectPath);
  const existing = findTaskFile(tasksDir, req.params.taskId);
  if (!existing) return res.status(404).json({ error: "Task not found" });
  const input: UpdateTaskInput = req.body;
  if (input.expectedUpdated && existing.updated !== input.expectedUpdated) {
    return res.status(409).json({ error: "Conflict — task was modified", current: existing });
  }
  const oldStatus = existing.status;
  const now = new Date().toISOString().split("T")[0];
  if (input.title !== undefined) existing.title = input.title;
  if (input.type !== undefined) existing.type = input.type;
  if (input.status !== undefined) existing.status = input.status;
  if (input.priority !== undefined) existing.priority = input.priority;
  if (input.labels !== undefined) existing.labels = input.labels;
  if (input.parent !== undefined) existing.parent = input.parent || undefined;
  if (input.body !== undefined) existing.body = input.body;
  existing.updated = now;
  try {
    writeTaskFile(existing.filePath, existing);
  } catch (err) {
    return res.status(500).json({ error: "Failed to write task file" });
  }
  if (input.status !== undefined && input.status !== oldStatus) {
    const configPath = path.join(tasksDir, "_config.md");
    const config = parseConfigFile(configPath) || { ...DEFAULT_TASK_CONFIG };
    if (config.columnOrder[oldStatus]) {
      config.columnOrder[oldStatus] = config.columnOrder[oldStatus].filter((id: string) => id !== existing.id);
    }
    if (!config.columnOrder[input.status]) config.columnOrder[input.status] = [];
    config.columnOrder[input.status].push(existing.id);
    writeConfigFile(configPath, config);
  }
  return res.json(existing);
});

// DELETE /api/tasks/:taskId
router.delete("/api/tasks/:taskId", (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error: "projectId query param required" });
  const projectPath = getProjectPath(projectId);
  if (!projectPath) return res.status(404).json({ error: "Project not found" });
  const tasksDir = getTasksDir(projectPath);
  const task = findTaskFile(tasksDir, req.params.taskId);
  if (!task) return res.status(404).json({ error: "Task not found" });
  try {
    fs.unlinkSync(task.filePath);
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete task file" });
  }
  const configPath = path.join(tasksDir, "_config.md");
  const config = parseConfigFile(configPath);
  if (config) {
    for (const status of Object.keys(config.columnOrder)) {
      config.columnOrder[status] = config.columnOrder[status].filter((id: string) => id !== task.id);
    }
    writeConfigFile(configPath, config);
  }
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_config.md") continue;
    const childPath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const child = parseTaskFile(childPath);
    if (child && child.parent === task.id) {
      child.parent = undefined;
      child.updated = new Date().toISOString().split("T")[0];
      writeTaskFile(childPath, child);
    }
  }
  return res.json({ deleted: true, id: task.id });
});

export default router;
