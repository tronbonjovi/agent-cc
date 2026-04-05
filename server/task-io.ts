import fs from "fs";
import crypto from "crypto";
import matter from "gray-matter";
import type { TaskItem, TaskConfig } from "@shared/task-types";

export function generateTaskId(): string {
  return "itm-" + crypto.randomBytes(4).toString("hex");
}

export function taskFilename(type: string, title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  // id may be full "itm-a1b2c3d4" or bare hex — take first 4 hex chars after any prefix
  const hexPart = id.startsWith("itm-") ? id.slice(4) : id;
  const suffix = hexPart.slice(0, 4);
  return `${type}-${slug}-${suffix}.md`;
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
      created: String(d.created),
      updated: String(d.updated),
      body: parsed.content,
      filePath: filePath.replace(/\\/g, "/"),
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

  const content = matter.stringify(task.body || "", frontmatter);
  writeAtomic(filePath, content);
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
