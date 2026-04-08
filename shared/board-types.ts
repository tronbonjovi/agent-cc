// shared/board-types.ts

export type BoardColumn = "backlog" | "ready" | "in-progress" | "review" | "done";

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  column: BoardColumn;
  project: string;              // project entity ID
  projectName: string;          // display name
  projectColor: string;         // hex color
  milestone?: string;           // milestone task title (not ID — for display)
  milestoneId?: string;         // milestone task ID (for filtering)
  priority: "high" | "medium" | "low";
  dependsOn: string[];          // task IDs
  tags: string[];
  assignee?: string;
  sessionId?: string;
  source: "db" | "workflow";
  flagged: boolean;
  flagReason?: string;
  session: SessionEnrichment | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionEnrichment {
  sessionId: string;
  isActive: boolean;
  model: string | null;
  lastActivity: string | null;
  lastActivityTs: string | null;
  messageCount: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  healthScore: "good" | "fair" | "poor" | null;
  toolErrors: number;
  durationMinutes: number | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  color: string;
}

export interface MilestoneMeta {
  id: string;
  title: string;
  project: string;
  totalTasks: number;
  doneTasks: number;
}

export interface BoardState {
  tasks: BoardTask[];
  columns: BoardColumn[];
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
}

export interface BoardStats {
  totalTasks: number;
  byColumn: Record<BoardColumn, number>;
  activeAgents: number;
  totalSpend: number;
  flaggedCount: number;
}

export interface BoardFilter {
  projects?: string[];
  milestones?: string[];
  priorities?: string[];
  columns?: BoardColumn[];
  assignee?: "human" | "ai" | "unassigned";
  flagged?: boolean;
}

export interface MoveTaskInput {
  column: BoardColumn;
  force?: boolean;              // skip dependency validation
}
