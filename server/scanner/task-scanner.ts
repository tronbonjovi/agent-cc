import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { parseTaskFile, parseConfigFile, taskFileIndex, taskFileKey } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskBoardState, TaskItem } from "@shared/task-types";

/** Files to exclude when scanning .claude/roadmap/<milestone>/ directories */
const WORKFLOW_EXCLUDED_FILES = new Set(["ROADMAP.md", "MILESTONE.md", "TASK.md", "ARCHIVE.md"]);

/**
 * Convert claude-workflow frontmatter into a TaskItem.
 * Takes already-parsed frontmatter (plain object), body string, and file path.
 * Returns null if required fields (id, title, status, created, updated) are missing.
 */
export function mapWorkflowToTaskItem(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): TaskItem | null {
  const d = frontmatter;
  if (!d.id || !d.title || !d.status || !d.created || !d.updated) {
    return null;
  }

  // Build labels from workflow-specific fields
  const labels: string[] = [];
  if (d.complexity) labels.push(`complexity:${d.complexity}`);
  if (d.parallelSafe) labels.push("parallel-safe");
  if (d.phase) labels.push(`phase:${d.phase}`);
  if (Array.isArray(d.filesTouch)) {
    for (const f of d.filesTouch) {
      labels.push(`touches:${f}`);
    }
  }

  return {
    id: String(d.id),
    title: String(d.title),
    type: "task",
    status: String(d.status),
    parent: d.milestone ? String(d.milestone) : undefined,
    created: String(d.created),
    updated: String(d.updated),
    body,
    filePath: filePath.replace(/\\/g, "/"),
    dependsOn: Array.isArray(d.dependsOn) ? d.dependsOn.map(String) : undefined,
    labels: labels.length > 0 ? labels : undefined,
  };
}

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

  // --- Scan .claude/tasks/ (existing behavior) ---
  if (fs.existsSync(tasksDir) && fs.statSync(tasksDir).isDirectory()) {
    const configPath = path.join(tasksDir, "_config.md").replace(/\\/g, "/");
    const parsedConfig = parseConfigFile(configPath);
    if (parsedConfig) {
      result.config = parsedConfig;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    } catch {
      entries = [];
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
        taskFileIndex.set(task.id, filePath);
      } else {
        result.malformedCount++;
      }
    }
  }

  // --- Scan .claude/roadmap/<milestone>/ (workflow tasks) ---
  const roadmapDir = path.join(projectPath, ".claude", "roadmap").replace(/\\/g, "/");
  try {
    if (fs.existsSync(roadmapDir) && fs.statSync(roadmapDir).isDirectory()) {
      const milestones = fs.readdirSync(roadmapDir, { withFileTypes: true });
      for (const msEntry of milestones) {
        if (!msEntry.isDirectory()) continue;
        if (msEntry.name === "drafts") continue;

        const msDir = path.join(roadmapDir, msEntry.name).replace(/\\/g, "/");
        let files: fs.Dirent[];
        try {
          files = fs.readdirSync(msDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const fileEntry of files) {
          if (!fileEntry.isFile()) continue;
          if (!fileEntry.name.endsWith(".md")) continue;
          if (WORKFLOW_EXCLUDED_FILES.has(fileEntry.name)) continue;

          const filePath = path.join(msDir, fileEntry.name).replace(/\\/g, "/");
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            const parsed = matter(content);
            const task = mapWorkflowToTaskItem(parsed.data, parsed.content, filePath);
            if (task) {
              result.items.push(task);
              taskFileIndex.set(taskFileKey(projectId, task.id), filePath);
              taskFileIndex.set(task.id, filePath);
            } else {
              result.malformedCount++;
            }
          } catch {
            result.malformedCount++;
          }
        }
      }
    }
  } catch {
    // Silently skip if roadmap directory can't be read
  }

  return result;
}
