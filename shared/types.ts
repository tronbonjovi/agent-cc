export interface TerminalInstanceData {
  id: string;
  name: string;
}

export interface TerminalGroupData {
  id: string;
  instances: TerminalInstanceData[];
}

export type TerminalConnectionState =
  | "initializing"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "expired"
  | "idle";

export interface TerminalPanelState {
  height: number;
  collapsed: boolean;
  explorerWidth?: number;
  groups: TerminalGroupData[];
  activeGroupId: string | null;
}

export type EntityType = "project" | "mcp" | "plugin" | "skill" | "markdown" | "config";
export type GraphNodeType = EntityType | "session" | "agent" | "custom";

export type CustomNodeSubType = "service" | "database" | "api" | "cicd" | "deploy" | "queue" | "cache" | "other";

export interface CustomNode {
  id: string;
  subType: CustomNodeSubType;
  label: string;
  description?: string;
  url?: string;
  icon?: string;
  color?: string;
  source: "manual" | "config-file" | "api-config" | "ai-suggested" | "docker-compose" | "auto-discovered";
}

export interface CustomEdge {
  id: string;
  source: string;  // entity ID or custom node ID
  target: string;
  label: string;
  color?: string;
  dashed?: boolean;
  source_origin: "manual" | "config-file" | "api-config" | "ai-suggested" | "docker-compose" | "auto-discovered";
}

// API registry types
export type ApiCategory = "voice" | "communication" | "google" | "infrastructure" | "ai-llm" | "design" | "database";
export type ApiAuthMethod = "api-key" | "oauth2" | "sdk" | "none" | "cdp" | "mcp";
export type ApiStatus = "active" | "configured" | "inactive" | "via-proxy";

export interface ApiDefinition {
  id: string;
  name: string;
  description: string;
  baseUrl?: string;
  authMethod: ApiAuthMethod;
  category: ApiCategory;
  status: ApiStatus;
  envKeys?: string[];
  consumers: string[];
  color?: string;
  website?: string;
  notes?: string;
}

export interface EntityOverride {
  description?: string;
  color?: string;
  label?: string;
}

export interface GraphConfigYaml {
  nodes?: Array<{
    id: string;
    type?: CustomNodeSubType;
    label: string;
    description?: string;
    url?: string;
    icon?: string;
    color?: string;
  }>;
  edges?: Array<{
    source: string;
    target: string;
    label: string;
    color?: string;
    dashed?: boolean;
  }>;
  overrides?: Array<{
    entity: string;  // matches by entity name or ID
    description?: string;
    color?: string;
    label?: string;
  }>;
}

/** Shape of a single MCP server config from .mcp.json */
export interface MCPServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

/** Shape of a .mcp.json file (top-level or wrapped) */
export interface MCPConfigFile {
  mcpServers?: Record<string, MCPServerConfig>;
  [key: string]: unknown;
}

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  path: string;
  description: string | null;
  lastModified: string | null;
  tags: string[];
  health: "ok" | "warning" | "error" | "unknown";
  data: Record<string, unknown>;
  scannedAt: string;
}

export interface Relationship {
  id: number;
  sourceId: string;
  sourceType: EntityType;
  targetId: string;
  targetType: EntityType;
  relation: string;
}

export interface MarkdownBackup {
  id: number;
  filePath: string;
  content: string;
  createdAt: string;
  reason: string;
}

export interface ProjectEntity extends Entity {
  type: "project";
  data: {
    projectKey: string;
    sessionCount: number;
    sessionSize: number;
    hasClaudeMd: boolean;
    hasMemory: boolean;
    longDescription?: string;
    techStack?: string[];
    keyFeatures?: string[];
  };
}

export interface MCPEntity extends Entity {
  type: "mcp";
  data: {
    transport: "stdio" | "sse" | "streamable-http";
    command?: string;
    args?: string[];
    url?: string;
    sourceFile: string;
    projectId?: string;
    env?: Record<string, string>;
    category?: string;
    capabilities?: string[];
    website?: string;
  };
}

export interface SkillEntity extends Entity {
  type: "skill";
  data: {
    userInvocable: boolean;
    args: string | null;
    content: string;
  };
}

export interface PluginEntity extends Entity {
  type: "plugin";
  data: {
    marketplace: string | null;
    installed: boolean;
    blocked: boolean;
    blockReason?: string;
    hasMCP: boolean;
    category?: string;
  };
}

export interface MarkdownSection {
  level: number;
  title: string;
  startLine: number;
  endLine: number;
}

export interface MarkdownEntity extends Entity {
  type: "markdown";
  data: {
    category: "claude-md" | "memory" | "skill" | "readme" | "other";
    projectId?: string;
    sizeBytes: number;
    lineCount?: number;
    preview: string;
    frontmatter: Record<string, unknown> | null;
    links?: string[];
    sections?: MarkdownSection[];
    tokenEstimate?: number;
  };
}

export interface MarkdownFileMeta {
  locked?: boolean;
  pinned?: boolean;
}

export interface ContentSearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  category: string;
  matches: Array<{ line: number; text: string }>;
  matchCount: number;
}

export interface ContextSummary {
  claudeMdFiles: Array<{ name: string; lines: number; tokens: number; sections: number }>;
  memoryFiles: Array<{ name: string; type: string; lines: number; tokens: number }>;
  skillFiles: Array<{ name: string; slash: string }>;
  totalLines: number;
  totalTokens: number;
  memoryMdUsage: { lines: number; limit: number; percentage: number };
}

export interface ConfigEntity extends Entity {
  type: "config";
  data: {
    configType: "settings" | "settings-local" | "mcp";
    content: Record<string, unknown>;
  };
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description?: string;
  health: "ok" | "warning" | "error" | "unknown";
  position: { x: number; y: number };
  parentId?: string;
  group?: { width: number; height: number };
  subType?: CustomNodeSubType;
  color?: string;
  url?: string;
  source?: string;  // origin of custom node
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  style?: { color: string; strokeWidth: number; dashed?: boolean; dotted?: boolean; animated?: boolean };
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- Force-directed graph (entity graph visualization) ---

export interface ForceGraphData {
  nodes: ForceNode[];
  edges: ForceEdge[];
  stats: {
    totalSessions: number;
    totalCost: number;
    totalEntities: number;
  };
}

export interface ForceNode {
  id: string;
  type: EntityType | "session" | "cost" | "tool" | "agent";
  label: string;
  weight: number;       // 0-1, normalized by server. Drives node radius.
  health: "ok" | "warning" | "error" | "unknown";
  meta: Record<string, unknown>;  // Type-specific data for detail panel
}

export interface ForceEdge {
  source: string;
  target: string;
  relation: string;     // "defines_mcp" | "has_skill" | "has_session" | etc.
}

export interface ScanStatus {
  scanning: boolean;
  lastScanAt: string | null;
  entityCounts: Record<EntityType, number>;
  totalEntities: number;
  totalRelationships: number;
  sessionCount?: number;
  agentCount?: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  model: string;
  color: string;
  tools: string[];
  source: "plugin" | "user" | "project";
  pluginName?: string;
  marketplace?: string;
  filePath: string;
  content: string;
  writable: boolean;
  lastUsed?: string | null;
}

export interface AgentExecution {
  agentId: string;
  slug: string;
  sessionId: string;
  projectKey: string;
  agentType: string | null;
  model: string | null;
  firstMessage: string;
  firstTs: string | null;
  lastTs: string | null;
  messageCount: number;
  sizeBytes: number;
  filePath: string;
}

export interface AgentStats {
  totalExecutions: number;
  totalDefinitions: number;
  sessionsWithAgents: number;
  byType: Record<string, number>;
  byModel: Record<string, number>;
}

export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  activeAgents: ActiveAgent[];
  firstMessage?: string;
  lastMessage?: string;
  slug?: string;
  projectKey?: string;
  contextUsage?: {
    tokensUsed: number;
    maxTokens: number;
    percentage: number;
    model?: string;
  };
  messageCount?: number;
  sizeBytes?: number;
  costEstimate?: number;  // USD
  status?: "thinking" | "waiting" | "idle" | "stale";
  permissionMode?: "default" | "auto-accept" | "bypass";
  gitBranch?: string;
  isPinned?: boolean;
  hasHistory?: boolean;  // true if a matching JSONL session file exists
}

export interface ActiveAgent {
  agentId: string;
  slug: string;
  agentType: string | null;
  model: string | null;
  lastWriteTs: string;
  task?: string;  // first user message — what the agent is doing
  status: "running" | "recent";  // running = modified <60s, recent = modified <10min
}

export interface LiveData {
  activeSessions: ActiveSession[];
  recentActivity: AgentExecution[];
  stats: {
    activeSessionCount: number;
    activeAgentCount: number;
    agentsToday: number;
    modelsInUse: string[];
  };
}

export interface RuntimeInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  homeDir: string;
  claudeDir: string;
  uptime: number;
  appVersion?: string;
  memoryUsage?: { rss: number; heapTotal: number; heapUsed: number; external: number };
}

export interface UpdateStatus {
  updateAvailable: boolean;
  currentVersion: string;
  currentCommit: string;
  latestCommit: string | null;
  commitsBehind: number;
  lastCheckedAt: string | null;
  hasGitRemote: boolean;
  updateInProgress: boolean;
  error: string | null;
  remote?: string;
}

export interface UpdateApplyResult {
  success: boolean;
  steps: { name: string; status: "success" | "failed" | "skipped"; output: string }[];
  restartRequired: boolean;
  error: string | null;
}

export interface UpdatePreferences {
  enabled: boolean;        // master toggle — false = no checking at all
  autoUpdate: boolean;     // auto-apply updates when found
  dismissedCommit: string | null; // commit hash that was dismissed (ignore)
}

export interface SessionData {
  id: string;
  slug: string;
  firstMessage: string;
  firstTs: string | null;
  lastTs: string | null;
  messageCount: number;
  sizeBytes: number;
  isEmpty: boolean;
  isActive: boolean;
  filePath: string;
  projectKey: string;
  cwd: string;
  version: string;
  gitBranch: string;
  hasSummary?: boolean;
  summaryTopics?: string[];
  summaryOutcome?: string | null;
  isPinned?: boolean;
  note?: string;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  topics: string[];
  toolsUsed: string[];
  outcome: "completed" | "abandoned" | "ongoing" | "error";
  filesModified: string[];
  generatedAt: string;
  model: string;
}

export interface DeepSearchMatch {
  sessionId: string;
  session: SessionData;
  matches: Array<{
    role: "user" | "assistant";
    text: string;
    timestamp: string;
    lineIndex: number;
  }>;
  matchCount: number;
  summary?: SessionSummary;
}

export interface DeepSearchResult {
  results: DeepSearchMatch[];
  totalMatches: number;
  totalSessions: number;
  searchedSessions: number;
  durationMs: number;
}

export interface SessionCostData {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  models: string[];
  modelBreakdown: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }>;
}

export interface CostAnalytics {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalSessions: number;
  byProject: Record<string, { cost: number; sessions: number; tokens: number }>;
  byDay: Array<{ date: string; cost: number; sessions: number; tokens: number }>;
  byModel: Record<string, { cost: number; tokens: number; sessions: number }>;
  topSessions: Array<{ sessionId: string; firstMessage: string; cost: number; tokens: number }>;
  durationMs: number;
}

export interface FileHeatmapEntry {
  filePath: string;
  fileName: string;
  touchCount: number;
  sessionCount: number;
  operations: { read: number; write: number; edit: number };
  lastTouched: string;
  sessions: string[];
}

export interface FileHeatmapResult {
  files: FileHeatmapEntry[];
  totalFiles: number;
  totalOperations: number;
  durationMs: number;
}

export interface SessionHealth {
  sessionId: string;
  toolErrors: number;
  retries: number;
  totalToolCalls: number;
  healthScore: "good" | "fair" | "poor";
  healthReasons?: string[];
  projectKey?: string;
  lastTs?: string;
  estimatedCostUsd?: number;
  /**
   * Assistant-message count actually fed into computeHealthReasons. On the
   * tree path this is the count of `kind === "assistant-turn"` nodes in
   * `tree.nodesById` (so subagent turns are included). On the legacy flat
   * fallback this mirrors `SessionData.messageCount`.
   */
  messageCount?: number;
}

export interface HealthAnalytics {
  sessions: SessionHealth[];
  avgToolErrors: number;
  avgRetries: number;
  poorCount: number;
  fairCount: number;
  goodCount: number;
  durationMs: number;
}

export interface CommitLink {
  hash: string;
  message: string;
  timestamp: string;
  filesChanged: number;
}

export interface StaleAnalytics {
  stale: Array<{ id: string; firstMessage: string; lastTs: string; messageCount: number; sizeBytes: number }>;
  empty: Array<{ id: string; sizeBytes: number }>;
  totalStale: number;
  totalEmpty: number;
  reclaimableBytes: number;
}

export interface ContextLoaderResult {
  prompt: string;
  sessionsUsed: number;
  tokensEstimate: number;
}

export interface ProjectDashboard {
  projectKey: string;
  projectPath: string;
  totalSessions: number;
  totalCost: number;
  totalTokens: number;
  totalMessages: number;
  totalSize: number;
  healthBreakdown: { good: number; fair: number; poor: number };
  topFiles: Array<{ fileName: string; touchCount: number }>;
  recentSessions: Array<{ id: string; firstMessage: string; lastTs: string; cost: number; hasSummary: boolean }>;
  commits: number;
  summaryTopics: string[];
}

export interface ProjectDashboardResult {
  projects: ProjectDashboard[];
  durationMs: number;
}

export interface SessionDiff {
  tool: "Write" | "Edit";
  filePath: string;
  timestamp: string;
  oldString?: string;
  newString?: string;
  content?: string;
}

export interface SessionDiffsResult {
  sessionId: string;
  diffs: SessionDiff[];
  totalDiffs: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  project?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  isFavorite?: boolean;
}

export interface WeeklyDigest {
  weekStart: string;
  weekEnd: string;
  totalSessions: number;
  totalCost: number;
  totalTokens: number;
  projectBreakdown: Array<{ project: string; sessions: number; cost: number }>;
  topAccomplishments: string[];
  topFiles: Array<{ fileName: string; touchCount: number }>;
  healthSummary: { good: number; fair: number; poor: number };
}

export interface WorkflowConfig {
  autoSummarize: boolean;
  autoArchiveStale: boolean;
  costAlertThreshold: number | null;
}

export interface SessionNote {
  sessionId: string;
  text: string;
  updatedAt: string;
}

export interface FileTimelineEntry {
  sessionId: string;
  firstMessage: string;
  lastTs: string;
  tool: "Write" | "Edit";
  timestamp: string;
  oldString?: string;
  newString?: string;
  content?: string;
}

export interface FileTimelineResult {
  filePath: string;
  entries: FileTimelineEntry[];
  totalSessions: number;
}

export interface NLQueryResult {
  answer: string;
  context: string;
  durationMs: number;
}

// --- Continuation Intelligence ---
export interface ContinuationItem {
  sessionId: string;
  firstMessage: string;
  lastTs: string;
  outcome: string;
  summary?: string;
  gitBranch?: string;
  uncommittedFiles?: number;
  lastFiles: string[];
  score: number;
}

export interface ContinuationBrief {
  items: ContinuationItem[];
  generatedAt: string;
}

// --- Bash Knowledge Base ---
export interface BashCommand {
  command: string;
  description: string;
  category: string;
  succeeded: boolean;
  errorOutput?: string;
  timestamp: string;
  sessionId: string;
  projectKey: string;
}

export interface BashKnowledgeBase {
  uniqueCommands: number;
  totalExecutions: number;
  byCategory: Record<string, { count: number; successRate: number }>;
  frequentCommands: Array<{ command: string; count: number; successRate: number; lastUsed: string }>;
  failureHotspots: Array<{ command: string; failCount: number; lastError: string }>;
  durationMs: number;
}

export interface BashSearchResult {
  matches: BashCommand[];
  totalMatches: number;
}

// --- Operations Nerve Center ---
export interface ServiceStatus {
  name: string;
  port: number;
  status: "up" | "down" | "unknown";
  responseMs?: number;
}

export interface NerveCenterData {
  services: ServiceStatus[];
  costPacing: { thisWeek: number; avgWeek: number; pacingPct: number };
  uncommittedWork: Array<{ filePath: string; sessionCount: number; editCount: number }>;
  overnightActivity: string[];
  attentionItems: Array<{ severity: "info" | "warning" | "critical"; message: string }>;
  generatedAt: string;
}

export interface SessionStats {
  totalCount: number;
  totalSize: number;
  activeCount: number;
  emptyCount: number;
}

export type BillingMode = "subscription" | "pay-as-you-go" | "auto";

export interface SessionHealthThresholds {
  context: { yellow: number; red: number };
  cost: { yellow: number; red: number };
  messages: { yellow: number; red: number };
  dataSize: { yellow: number; red: number };
}

export interface AppSettings {
  appName: string;
  onboarded: boolean;
  billingMode: BillingMode;
  healthThresholds: SessionHealthThresholds;
  scanPaths: {
    homeDir: string | null;
    claudeDir: string | null;
    extraMcpFiles: string[];
    extraProjectDirs: string[];
    extraSkillDirs: string[];
    extraPluginDirs: string[];
  };
}

// --- Cost Data Precision ---

export interface CostPricingSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface CostRecord {
  id: string;                     // hash of sessionId + timestamp + model
  sessionId: string;
  parentSessionId: string | null; // non-null if this is a subagent
  projectKey: string;
  model: string;                  // exact: "claude-opus-4-6"
  modelFamily: string;            // derived: "opus-4-6"
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;                   // USD at time of indexing
  pricingSnapshot: CostPricingSnapshot;
  timestamp: string;              // ISO 8601 from JSONL
  indexedAt: string;
}

export interface CostIndexState {
  files: Record<string, {
    filePath: string;
    lastOffset: number;
    lastTimestamp: string;
    recordCount: number;
    fileSize: number;             // detect truncation/rewrite
  }>;
  totalRecords: number;
  lastIndexAt: string;
  version: number;
}

export interface CostTokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

/**
 * Cost totals grouped by `InteractionSource`. Always fully keyed — every
 * `InteractionSource` variant is present, with 0 for variants that didn't
 * contribute anything. Clients can assume shape without defensive checks.
 *
 * The legacy scanner backend only sees `scanner-jsonl` events (it reads
 * from JSONL on disk), so its breakdown is degenerate: the full cost sits
 * under `scanner-jsonl` and every other key is 0. The store backend
 * populates whichever keys it sees in the events table.
 */
export type CostBySource = Record<InteractionSource, number>;

export interface CostSummary {
  totalCost: number;
  totalTokens: CostTokenBreakdown;
  /** Cost totals broken down by `InteractionSource`. See `CostBySource`. */
  bySource: CostBySource;
  /**
   * Event counts broken down by `InteractionSource` (task006). Unlike
   * `bySource` (which excludes `cost === null` events), counts INCLUDE
   * every event regardless of cost — deterministic sources like
   * `chat-slash` / `chat-hook` / `chat-workflow` accrue counts even
   * though they contribute zero cost. The asymmetry is the whole point:
   * the AI-vs-deterministic ratio needs counts that the cost-only view
   * can't supply. Always fully keyed (every `InteractionSource`).
   */
  countBySource: CostBySource;
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  monthlyTotalCost: number;
  byModel: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    sessions: number;
  }>;
  byProject: Array<{
    projectKey: string;
    projectName: string;
    cost: number;
    sessions: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
    computeCost: number;
    cacheCost: number;
    /** Per-day cost broken down by `InteractionSource`. Always fully keyed. */
    bySource: CostBySource;
    /** Per-day event counts by `InteractionSource` (task006). Includes
     *  null-cost deterministic events. Always fully keyed. */
    countBySource: CostBySource;
  }>;
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    model: string;
    cost: number;
    subagentCount: number;
    subagentCost: number;
    tokens: CostTokenBreakdown;
  }>;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
}

// --- Integrated Chat (walking skeleton) ---

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string; // ISO
}

export interface SessionCostDetail {
  sessionId: string;
  firstMessage: string;
  totalCost: number;
  directCost: number;
  directTokens: CostTokenBreakdown;
  directModel: string;
  subagents: Array<{
    sessionId: string;
    model: string;
    cost: number;
    tokens: CostTokenBreakdown;
  }>;
  ratesApplied: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
}

// ---------------------------------------------------------------------------
// Unified capture: InteractionEvent (milestone unified-capture, task001)
// ---------------------------------------------------------------------------
// Foundational type for M2–M5. Represents any observable interaction
// (AI call, shell command, hook fire, imported JSONL line) in a uniform shape
// with rich metadata for source tagging and cost tracking.
// ---------------------------------------------------------------------------

export type InteractionSource =
  | 'chat-ai'
  | 'chat-slash'
  | 'chat-hook'
  | 'chat-workflow'
  | 'scanner-jsonl'
  // Placeholders for future platform sources (M5)
  | 'github-issue'
  | 'telegram'
  | 'discord'
  | 'imessage';

/**
 * Every `InteractionSource` variant as a readonly tuple — single source of
 * truth for code that needs to enumerate sources (e.g. initializing a
 * fully-keyed `CostBySource` object with zeros). Keep in the same order as
 * the union above so diffs stay readable.
 */
export const ALL_INTERACTION_SOURCES: readonly InteractionSource[] = [
  'chat-ai',
  'chat-slash',
  'chat-hook',
  'chat-workflow',
  'scanner-jsonl',
  'github-issue',
  'telegram',
  'discord',
  'imessage',
] as const;

export type InteractionRole = 'user' | 'assistant' | 'system' | 'tool';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolCallContent {
  type: 'tool_call';
  toolName: string;
  input: unknown;
  toolUseId: string;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  output: unknown;
  isError?: boolean;
}

export interface ThinkingContent {
  type: 'thinking';
  text: string;
}

export interface SystemContent {
  type: 'system';
  subtype: 'workflow_step' | 'hook_fire' | 'info';
  text: string;
  data?: unknown;
}

export type InteractionContent =
  | TextContent
  | ToolCallContent
  | ToolResultContent
  | ThinkingContent
  | SystemContent;

export interface InteractionCost {
  usd: number;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  durationMs: number;
  model?: string;
}

export interface InteractionEvent {
  id: string; // ULID or UUID
  conversationId: string;
  parentEventId?: string | null; // for tool_call → tool_result linking
  timestamp: string; // ISO
  source: InteractionSource;
  role: InteractionRole;
  content: InteractionContent;
  cost: InteractionCost | null; // null = deterministic event, no AI cost
  metadata?: Record<string, unknown>;
}

export function isAiEvent(e: InteractionEvent): boolean {
  return e.cost !== null && e.source !== 'scanner-jsonl'
    ? true
    : e.source === 'chat-ai' || e.source === 'scanner-jsonl';
}

export function isDeterministicEvent(e: InteractionEvent): boolean {
  return e.source === 'chat-slash' || e.source === 'chat-hook' || e.source === 'chat-workflow';
}

// ---------------------------------------------------------------------------
// Chat UI tab state — chat-workflows-tabs milestone (task001)
// ---------------------------------------------------------------------------
//
// Persisted across sessions in `DBData.chatUIState`. Held on the client by a
// Zustand store (`client/src/stores/chat-tabs-store.ts`) and hydrated via
// `GET /api/chat/tabs`. Every mutation on the client optimistically updates
// local state and persists the full new shape via `PUT /api/chat/tabs`; on
// failure the client reverts. Keeping openTabs and tabOrder separate lets
// us reorder without rewriting the tab metadata, but for the skeleton the
// two arrays are kept in lockstep.

/** One open chat tab. `conversationId` is the durable key; `title` is UI label. */
export interface ChatTabEntry {
  conversationId: string;
  title: string;
}

/** Full persisted chat tab state. */
export interface ChatTabState {
  openTabs: ChatTabEntry[];
  activeTabId: string | null;
  tabOrder: string[];
}

// ---------------------------------------------------------------------------
// Chat composer settings — chat-composer-controls milestone (task001)
// ---------------------------------------------------------------------------
//
// Two layers:
//
//   - `ChatGlobalDefaults` lives on the server in `DBData.chatDefaults`. New
//     conversations inherit this shape as their starting configuration. The
//     user edits it via `GET/PUT /api/settings/chat-defaults`.
//   - `ChatSettings` is the resolved shape the composer actually uses for a
//     given conversation — `globalDefaults ∪ overrides[conversationId]`. The
//     client-side Zustand store (`chat-settings-store.ts`) holds both layers
//     and exposes `getSettings(conversationId)` for reads.
//
// Per-tab changes are transient (in-memory only, survive tab switches but
// die on reload) — intentionally out-of-scope to persist for this first
// milestone. Only the global defaults round-trip through the server.

/**
 * Composer configuration for a single conversation. A field set here wins
 * over the matching field in `ChatGlobalDefaults`. Fields are optional on
 * purpose: most are provider-specific (e.g. `effort` is Claude Code only,
 * `temperature` is OpenAI-compatible only).
 */
export interface ChatSettings {
  /** Provider identifier, e.g. "claude-code", "ollama", or a custom ID. */
  providerId: string;
  /** Model identifier, e.g. "claude-sonnet-4-6", "llama3.2:8b". */
  model: string;
  /** "low" | "medium" | "high" — Claude Code only. */
  effort?: string;
  /** Extended thinking toggle — model-dependent. */
  thinking?: boolean;
  /** Web search toggle — Claude Code only. */
  webSearch?: boolean;
  /** Custom system prompt appended to the provider's default. */
  systemPrompt?: string;
  /** Project context cwd. `null`/undefined means "General" (no project). */
  projectPath?: string;
  /** Sampling temperature 0–2 — OpenAI-compatible providers only. */
  temperature?: number;
}

/**
 * Global defaults for new conversations. Same shape as `ChatSettings` — the
 * alias exists so call-sites can express intent ("this is the global
 * defaults record, not a per-conversation resolved value").
 */
export type ChatGlobalDefaults = ChatSettings;

// ---------------------------------------------------------------------------
// Provider configuration — chat-composer-controls task004
// ---------------------------------------------------------------------------
//
// `ProviderConfig` is the stable interface that the capability system
// (task007) and the provider-system milestone (M11) build against. Defining
// it now — even though only Claude Code is hardcoded in the UI today — means
// M11 can ship server-side provider CRUD without breaking changes here.
//
// Auth note: credential fields (`apiKey`, `oauthConfig`) are intentionally
// OMITTED from the client-side type. The client only sees `auth.type` so it
// knows what kind of auth is configured; the secret itself lives server-side
// and never crosses the wire.

/**
 * Capability flags describing what a provider supports. Drives task007's
 * show/hide logic on the settings popover so controls unavailable for the
 * selected provider stay hidden. All fields optional because a missing flag
 * is treated as "not supported" — safer default than assuming support.
 */
export interface ProviderCapabilities {
  /** Extended thinking (hidden reasoning) — Claude Code only today. */
  thinking?: boolean;
  /** Reasoning effort (low / medium / high) — Claude Code only. */
  effort?: boolean;
  /** Web search tool — Claude Code only. */
  webSearch?: boolean;
  /** Sampling temperature — OpenAI-compatible providers only. */
  temperature?: boolean;
  /** Custom system prompt append. */
  systemPrompt?: boolean;
  /** Attaching files to a prompt. */
  fileAttachments?: boolean;
  /** Project context (cwd) selection. */
  projectContext?: boolean;
}

/**
 * One provider the user can route a conversation through. The `id` is the
 * durable key referenced by `ChatSettings.providerId`; `name` is the human
 * label shown in the provider selector.
 */
export interface ProviderConfig {
  id: string;
  name: string;
  /**
   * Shape of backend the provider talks to. `claude-cli` shells out to
   * `claude -p`; `openai-compatible` POSTs to an OpenAI-style chat
   * completions endpoint (Ollama, vLLM, etc.).
   */
  type: "claude-cli" | "openai-compatible";
  /** Base URL for HTTP providers (ignored by `claude-cli`). */
  baseUrl?: string;
  /**
   * What kind of auth the provider uses. The secret itself stays server-side
   * — the client only sees the `type` so the settings UI can render an
   * appropriate indicator / editor.
   */
  auth: {
    type: "none" | "api-key" | "oauth";
  };
  capabilities: ProviderCapabilities;
}

