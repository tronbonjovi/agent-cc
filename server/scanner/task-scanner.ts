import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { parseTaskFile, parseConfigFile, taskFileIndex, taskFileKey } from "../task-io";
import { DEFAULT_TASK_CONFIG } from "@shared/task-types";
import type { TaskBoardState, TaskItem } from "@shared/task-types";

/** Files to exclude when scanning .claude/roadmap/<milestone>/ directories */
const WORKFLOW_EXCLUDED_FILES = new Set(["ROADMAP.md", "MILESTONE.md", "TASK.md", "ARCHIVE.md"]);

/** Convert hyphenated directory name to Title Case (e.g. "pipeline-removal" -> "Pipeline Removal") */
function titleCaseFromDirName(dirName: string): string {
  return dirName
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Compute milestone status from child task statuses */
function computeMilestoneStatus(children: TaskItem[]): string {
  if (children.length === 0) return "backlog";
  const allDone = children.every(c => c.status === "done" || c.status === "completed");
  if (allDone) return "done";
  const anyInProgress = children.some(c => c.status === "in-progress" || c.status === "in_progress");
  if (anyInProgress) return "in-progress";
  return "backlog";
}

/** Parse ROADMAP.md milestone table — returns map of milestone name to { description, status } */
export function parseRoadmapTable(roadmapPath: string): Map<string, { description?: string; status?: string }> {
  const result = new Map<string, { description?: string; status?: string }>();
  try {
    if (!fs.existsSync(roadmapPath)) return result;
    const content = fs.readFileSync(roadmapPath, "utf-8");
    const parsed = matter(content);
    const body = parsed.content;

    // Find table rows — skip header and separator lines
    const lines = body.split("\n").filter(l => l.trim().startsWith("|"));
    if (lines.length < 3) return result; // need header + separator + at least 1 data row

    // Parse header to find column indices
    const headers = lines[0].split("|").map(h => h.trim().toLowerCase()).filter(Boolean);
    const milestoneCol = headers.indexOf("milestone");
    const statusCol = headers.indexOf("status");
    const descCol = headers.indexOf("description");

    if (milestoneCol === -1) return result;

    // Parse data rows (skip header and separator)
    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length <= milestoneCol) continue;
      const name = cols[milestoneCol];
      if (!name) continue;
      result.set(name, {
        description: descCol >= 0 && cols.length > descCol ? cols[descCol] : undefined,
        status: statusCol >= 0 && cols.length > statusCol ? cols[statusCol] : undefined,
      });
    }
  } catch { /* gracefully skip */ }
  return result;
}

/** Parse MILESTONE.md for status_override values — returns map of milestone name to override status */
export function parseMilestoneOverrides(milestonePath: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    if (!fs.existsSync(milestonePath)) return result;
    const content = fs.readFileSync(milestonePath, "utf-8");
    const lines = content.split("\n");

    let currentMilestone: string | null = null;
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(\S+)/);
      if (headingMatch) {
        currentMilestone = headingMatch[1];
        continue;
      }
      if (currentMilestone) {
        const overrideMatch = line.match(/\*\*status_override:\*\*\s*(\S+)/);
        if (overrideMatch) {
          const value = overrideMatch[1];
          if (value !== "null") {
            result.set(currentMilestone, value);
          }
        }
      }
    }
  } catch { /* gracefully skip */ }
  return result;
}

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
      // Parse ROADMAP.md and MILESTONE.md for metadata/overrides
      const roadmapMeta = parseRoadmapTable(path.join(roadmapDir, "ROADMAP.md"));
      const milestoneOverrides = parseMilestoneOverrides(path.join(roadmapDir, "MILESTONE.md"));

      // Collect child tasks per milestone directory
      const milestoneChildTasks = new Map<string, TaskItem[]>();

      const milestoneDirEntries = fs.readdirSync(roadmapDir, { withFileTypes: true });
      for (const msEntry of milestoneDirEntries) {
        if (!msEntry.isDirectory()) continue;
        if (msEntry.name === "drafts") continue;

        const msDir = path.join(roadmapDir, msEntry.name).replace(/\\/g, "/");
        const children: TaskItem[] = [];
        milestoneChildTasks.set(msEntry.name, children);

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
              children.push(task);
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

      // Create synthetic milestones for each directory
      const now = new Date().toISOString().slice(0, 10);
      for (const [dirName, children] of Array.from(milestoneChildTasks.entries())) {
        const msDir = path.join(roadmapDir, dirName).replace(/\\/g, "/");

        // Compute dates from children
        let created = now;
        let updated = now;
        if (children.length > 0) {
          created = children.reduce((min: string, c: TaskItem) => c.created < min ? c.created : min, children[0].created);
          updated = children.reduce((max: string, c: TaskItem) => c.updated > max ? c.updated : max, children[0].updated);
        }

        // Compute status: MILESTONE.md override > ROADMAP.md override > computed from children
        let status = computeMilestoneStatus(children);
        const roadmapEntry = roadmapMeta.get(dirName);
        if (roadmapEntry?.status) {
          status = roadmapEntry.status;
        }
        const milestoneOverride = milestoneOverrides.get(dirName);
        if (milestoneOverride) {
          status = milestoneOverride;
        }

        // Body from ROADMAP.md description
        const body = roadmapEntry?.description ?? "";

        const milestone: TaskItem = {
          id: dirName,
          title: titleCaseFromDirName(dirName),
          type: "milestone",
          status,
          created,
          updated,
          body,
          filePath: msDir,
        };

        result.items.push(milestone);
        taskFileIndex.set(taskFileKey(projectId, dirName), msDir);
        taskFileIndex.set(dirName, msDir);
      }
    }
  } catch {
    // Silently skip if roadmap directory can't be read
  }

  return result;
}
