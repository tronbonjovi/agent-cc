// shared/task-types.ts

export interface TaskItem {
  id: string;
  title: string;
  type: string;
  status: string;
  parent?: string;
  priority?: string;
  labels?: string[];
  created: string;
  updated: string;
  body: string;
  filePath: string;
  dependsOn?: string[];            // task IDs this task depends on
  flagged?: boolean;
  flagReason?: string;
  assignee?: string;             // human name or "ai"
  sessionId?: string;            // linked Claude session (manual or auto)
}

export interface TaskConfig {
  statuses: string[];
  types: string[];
  defaultType: string;
  defaultPriority: string;
  columnOrder: Record<string, string[]>;
}

export const DEFAULT_TASK_CONFIG: TaskConfig = {
  statuses: ["backlog", "todo", "in-progress", "blocked", "review", "done"],
  types: ["roadmap", "milestone", "task"],
  defaultType: "task",
  defaultPriority: "medium",
  columnOrder: {},
};

export interface TaskBoardState {
  projectId: string;
  projectName: string;
  projectPath: string;
  config: TaskConfig;
  items: TaskItem[];
  malformedCount: number;
}

export interface CreateTaskInput {
  title: string;
  type?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  parent?: string;
  body?: string;
}

export interface UpdateTaskInput {
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  parent?: string | null;
  body?: string;
  expectedUpdated?: string;
}

export interface ReorderInput {
  columnOrder: Record<string, string[]>;
}
