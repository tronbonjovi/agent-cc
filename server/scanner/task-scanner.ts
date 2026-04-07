import fs from "fs";
import path from "path";
import { parseTaskFile, parseConfigFile, taskFileIndex, taskFileKey } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskBoardState } from "@shared/task-types";

export function scanProjectTasks(
  projectPath: string,
  projectId: string,
  projectName: string,
  opts?: { includeRemoved?: boolean }
): TaskBoardState {
  const tasksDir = path.join(projectPath, ".claude", "tasks").replace(/\\/g, "/");

  const result: TaskBoardState = {
    projectId,
    projectName,
    projectPath: projectPath.replace(/\\/g, "/"),
    config: { ...DEFAULT_TASK_CONFIG },
    items: [],
    malformedCount: 0,
  };

  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) {
    return result;
  }

  const configPath = path.join(tasksDir, "_config.md").replace(/\\/g, "/");
  const parsedConfig = parseConfigFile(configPath);
  if (parsedConfig) {
    result.config = parsedConfig;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tasksDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name === "_config.md") continue;

    const filePath = path.join(tasksDir, entry.name).replace(/\\/g, "/");
    const task = parseTaskFile(filePath);
    if (task) {
      result.items.push(task);
      taskFileIndex.set(taskFileKey(projectId, task.id), filePath);
      taskFileIndex.set(task.id, filePath); // legacy unscoped for backward compat
    } else {
      result.malformedCount++;
    }
  }

  // Filter removed tasks unless explicitly requested
  if (!opts?.includeRemoved) {
    result.items = result.items.filter(
      (item) => item.pipelineStage !== "descoped" && item.pipelineStage !== "cancelled"
    );
  }

  return result;
}
