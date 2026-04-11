// shared/board-types.ts

export type BoardColumn = "queue" | "in-progress" | "review" | "done";

/** Snapshot of session metadata persisted in memory so completed tasks retain
 *  their session info even after the live session is no longer active/found. */
export interface LastSessionSnapshot {
  model: string | null;
  agentRole: string | null;
  messageCount: number;
  durationMinutes: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  // Session detail (expandable section)
  healthReasons: string[];
  totalToolCalls: number;
  retries: number;
  cacheHitRate: number | null;
  maxTokensStops: number;
  webRequests: number;
  sidechainCount: number;
  turnCount: number;
}

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
  milestoneColor?: string;      // deterministic color for milestone grouping
  priority: "high" | "medium" | "low";
  dependsOn: string[];          // task IDs
  tags: string[];
  assignee?: string;
  sessionId?: string;
  source: "db" | "workflow";
  flagged: boolean;
  flagReason?: string;
  session: SessionEnrichment | null;
  lastSession?: LastSessionSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface LinkSignal {
  name: string;
  weight: number;
  matched: boolean;
}

export interface AutoLinkResult {
  sessionId: string;
  score: number;
  signals: LinkSignal[];
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
  agentRole: string | null;
  // Session detail (expandable section)
  healthReasons: string[];
  totalToolCalls: number;
  retries: number;
  cacheHitRate: number | null;
  maxTokensStops: number;
  webRequests: number;
  sidechainCount: number;
  turnCount: number;
  // Auto-link transparency
  linkScore?: number;
  linkSignals?: LinkSignal[];
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
  color: string;                // deterministic milestone color from palette
  totalTasks: number;
  doneTasks: number;
}

export interface BoardState {
  tasks: BoardTask[];
  columns: BoardColumn[];
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
  completedTasks: BoardTask[];
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
