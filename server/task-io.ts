import fs from "fs";
import crypto from "crypto";
import matter from "gray-matter";
import type { TaskItem, TaskConfig } from "@shared/task-types";

export function generateTaskId(): string {
  return "itm-" + crypto.randomBytes(4).toString("hex");
}

export function taskFilename(type: string, title: string, id: string): string {
  const safeType = type
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "item";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    || "untitled";
  const suffix = id.replace(/^itm-/, "").slice(0, 4);
  return `${safeType}-${slug}-${suffix}.md`;
}

function normalizeDate(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }
  return String(val);
}

export function parseTaskFile(filePath: string): TaskItem | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    const d = parsed.data;

    if (!d.id || !d.title || !d.type || !d.status || !d.created || !d.updated) {
      return null;
    }

    return {
      id: String(d.id),
      title: String(d.title),
      type: String(d.type),
      status: String(d.status),
      parent: d.parent ? String(d.parent) : undefined,
      priority: d.priority ? String(d.priority) : undefined,
      labels: Array.isArray(d.labels) ? d.labels.map(String) : undefined,
      created: normalizeDate(d.created),
      updated: normalizeDate(d.updated),
      body: parsed.content,
      filePath: filePath.replace(/\\/g, "/"),
      // Pipeline metadata
      pipelineStage: d.pipelineStage ? String(d.pipelineStage) : undefined,
      pipelineBranch: d.pipelineBranch ? String(d.pipelineBranch) : undefined,
      pipelineCost: d.pipelineCost != null ? Number(d.pipelineCost) : undefined,
      pipelineActivity: d.pipelineActivity ? String(d.pipelineActivity) : undefined,
      pipelineSessionIds: Array.isArray(d.pipelineSessionIds) ? d.pipelineSessionIds.map(String) : undefined,
      pipelineSummary: d.pipelineSummary ? String(d.pipelineSummary) : undefined,
      pipelineBlockedReason: d.pipelineBlockedReason ? String(d.pipelineBlockedReason) : undefined,
      blockedFromStage: d.blockedFromStage ? String(d.blockedFromStage) : undefined,
      removedFromStage: d.removedFromStage ? String(d.removedFromStage) : undefined,
      removedAt: d.removedAt ? String(d.removedAt) : undefined,
      dependsOn: Array.isArray(d.dependsOn) ? d.dependsOn.map(String) : undefined,
      flagged: d.flagged !== undefined ? Boolean(d.flagged) : undefined,
      flagReason: d.flagReason ? String(d.flagReason) : undefined,
      assignee: d.assignee ? String(d.assignee) : undefined,
      sessionId: d.sessionId ? String(d.sessionId) : undefined,
    };
  } catch {
    return null;
  }
}

function writeAtomic(filePath: string, content: string): void {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function writeTaskFile(filePath: string, task: TaskItem): void {
  const frontmatter: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    created: task.created,
    updated: task.updated,
  };
  if (task.parent) frontmatter.parent = task.parent;
  if (task.priority) frontmatter.priority = task.priority;
  if (task.labels && task.labels.length > 0) frontmatter.labels = task.labels;
  // Pipeline metadata
  if (task.pipelineStage) frontmatter.pipelineStage = task.pipelineStage;
  if (task.pipelineBranch) frontmatter.pipelineBranch = task.pipelineBranch;
  if (task.pipelineCost != null) frontmatter.pipelineCost = task.pipelineCost;
  if (task.pipelineActivity) frontmatter.pipelineActivity = task.pipelineActivity;
  if (task.pipelineSessionIds && task.pipelineSessionIds.length > 0) frontmatter.pipelineSessionIds = task.pipelineSessionIds;
  if (task.pipelineSummary) frontmatter.pipelineSummary = task.pipelineSummary;
  if (task.pipelineBlockedReason) frontmatter.pipelineBlockedReason = task.pipelineBlockedReason;
  if (task.blockedFromStage) frontmatter.blockedFromStage = task.blockedFromStage;
  if (task.removedFromStage) frontmatter.removedFromStage = task.removedFromStage;
  if (task.removedAt) frontmatter.removedAt = task.removedAt;
  if (task.dependsOn && task.dependsOn.length > 0) frontmatter.dependsOn = task.dependsOn;
  if (task.flagged !== undefined) frontmatter.flagged = task.flagged;
  if (task.flagReason) frontmatter.flagReason = task.flagReason;
  if (task.assignee) frontmatter.assignee = task.assignee;
  if (task.sessionId) frontmatter.sessionId = task.sessionId;

  const content = matter.stringify(task.body || "", frontmatter);
  writeAtomic(filePath, content);
}

/**
 * Update a single field on a task file by ID.
 * Looks up the file path from the scanner's index, scoped by projectId to
 * prevent cross-project collisions when different projects reuse task IDs.
 * Best-effort — does nothing if task not found.
 */
export function updateTaskField(taskId: string, field: keyof TaskItem, value: unknown, projectId?: string): void {
  // Try project-scoped lookup first (safe), fall back to legacy unscoped for backward compat
  const key = projectId ? taskFileKey(projectId, taskId) : taskId;
  const filePath = taskFileIndex.get(key);
  if (!filePath) return;
  const task = parseTaskFile(filePath);
  if (!task) return;
  (task as any)[field] = value;
  task.updated = new Date().toISOString().split("T")[0];
  writeTaskFile(filePath, task);
}

/**
 * In-memory index of (projectId:taskId) → filePath, populated by task scanner.
 * Keyed by compound key to prevent cross-project collisions when multiple
 * projects contain tasks with the same ID.
 */
export const taskFileIndex = new Map<string, string>();

/** Build compound key for taskFileIndex */
export function taskFileKey(projectId: string, taskId: string): string {
  return `${projectId}:${taskId}`;
}

export function parseConfigFile(filePath: string): TaskConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(content);
    const d = parsed.data;

    if (d.type !== "task-config") return null;

    return {
      statuses: Array.isArray(d.statuses) ? d.statuses.map(String) : ["backlog", "todo", "in-progress", "review", "done"],
      types: Array.isArray(d.types) ? d.types.map(String) : ["roadmap", "milestone", "task"],
      defaultType: d.default_type ? String(d.default_type) : "task",
      defaultPriority: d.default_priority ? String(d.default_priority) : "medium",
      columnOrder: (d.column_order && typeof d.column_order === "object")
        ? Object.fromEntries(
            Object.entries(d.column_order as Record<string, unknown>).map(
              ([k, v]) => [k, Array.isArray(v) ? v.map(String) : []]
            )
          )
        : {},
    };
  } catch {
    return null;
  }
}

export function writeConfigFile(filePath: string, config: TaskConfig): void {
  const frontmatter: Record<string, unknown> = {
    type: "task-config",
    statuses: config.statuses,
    types: config.types,
    default_type: config.defaultType,
    default_priority: config.defaultPriority,
    column_order: config.columnOrder,
  };
  const content = matter.stringify("", frontmatter);
  writeAtomic(filePath, content);
}
