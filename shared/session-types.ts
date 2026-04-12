/**
 * Comprehensive JSONL session parser types.
 *
 * These interfaces define the output of the session-parser module,
 * which reads each JSONL file once and produces a typed ParsedSession
 * containing all extracted data organized by domain.
 */

// ---------------------------------------------------------------------------
// Top-level container
// ---------------------------------------------------------------------------

export interface ParsedSession {
  /** Identity & metadata (from first records + file stat) */
  meta: SessionMeta;

  /** All assistant messages with usage, model, stop_reason, content summary */
  assistantMessages: AssistantRecord[];

  /** All user messages with tool results */
  userMessages: UserRecord[];

  /** System events by subtype */
  systemEvents: {
    turnDurations: TurnDuration[];
    hookSummaries: HookSummary[];
    localCommands: LocalCommand[];
    bridgeEvents: BridgeEvent[];
  };

  /** Tool usage: every tool_use matched with its tool_result */
  toolTimeline: ToolExecution[];

  /** File history snapshots */
  fileSnapshots: FileSnapshot[];

  /** Session lifecycle events */
  lifecycle: LifecycleEvent[];

  /**
   * UUID-based conversation tree (parentUuid → children).
   * @deprecated Replaced by `SessionTree` (built by `session-tree-builder`).
   * Retained only for existing test compatibility; do not read in production code.
   */
  conversationTree: ConversationNode[];

  /** Raw counts for quick access */
  counts: SessionCounts;
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export interface SessionCounts {
  totalRecords: number;
  assistantMessages: number;
  userMessages: number;
  systemEvents: number;
  toolCalls: number;
  toolErrors: number;
  fileSnapshots: number;
  sidechainMessages: number;
}

// ---------------------------------------------------------------------------
// Session metadata
// ---------------------------------------------------------------------------

export interface SessionMeta {
  sessionId: string;
  slug: string;
  firstMessage: string;
  firstTs: string | null;
  lastTs: string | null;
  sizeBytes: number;
  filePath: string;
  projectKey: string;
  cwd: string;
  version: string;
  gitBranch: string;
  entrypoint: string;
}

// ---------------------------------------------------------------------------
// Assistant records
// ---------------------------------------------------------------------------

export interface AssistantRecord {
  uuid: string;
  parentUuid: string;
  timestamp: string;
  requestId: string;
  isSidechain: boolean;
  model: string;
  stopReason: string;
  usage: TokenUsage;
  toolCalls: ToolCall[];
  hasThinking: boolean;
  textPreview: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  serviceTier: string;
  inferenceGeo: string;
  speed: string;
  serverToolUse: { webSearchRequests: number; webFetchRequests: number };
}

export interface ToolCall {
  id: string;
  name: string;
  filePath: string | null;
  command: string | null;
  pattern: string | null;
}

// ---------------------------------------------------------------------------
// User records
// ---------------------------------------------------------------------------

export interface UserRecord {
  uuid: string;
  parentUuid: string;
  timestamp: string;
  isSidechain: boolean;
  isMeta: boolean;
  permissionMode: string | null;
  toolResults: ToolResult[];
  textPreview: string;
}

export interface ToolResult {
  toolUseId: string;
  isError: boolean;
  durationMs: number | null;
  success: boolean | null;
}

// ---------------------------------------------------------------------------
// Tool execution timeline (matched pairs)
// ---------------------------------------------------------------------------

export interface ToolExecution {
  /** Matched pair: assistant's tool_use + user's tool_result */
  callId: string;
  name: string;
  filePath: string | null;
  command: string | null;
  pattern: string | null;
  timestamp: string;
  resultTimestamp: string;
  durationMs: number | null;
  isError: boolean;
  isSidechain: boolean;
  /** uuid of the AssistantRecord whose content contained this tool_use. */
  issuedByAssistantUuid: string;
}

// ---------------------------------------------------------------------------
// System events
// ---------------------------------------------------------------------------

export interface TurnDuration {
  timestamp: string;
  durationMs: number;
  messageCount: number;
  parentUuid: string;
}

export interface HookSummary {
  timestamp: string;
  hookCount: number;
  hooks: Array<{ command: string; durationMs: number }>;
  errors: string[];
  preventedContinuation: boolean;
  stopReason: string;
}

export interface LocalCommand {
  timestamp: string;
  content: string;
}

export interface BridgeEvent {
  timestamp: string;
  url: string;
  content: string;
}

// ---------------------------------------------------------------------------
// File snapshots
// ---------------------------------------------------------------------------

export interface FileSnapshot {
  messageId: string;
  isUpdate: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export interface LifecycleEvent {
  timestamp: string;
  type:
    | 'permission-change'
    | 'queue-enqueue'
    | 'queue-dequeue'
    | 'queue-remove'
    | 'tools-changed'
    | 'last-prompt';
  detail: string;
}

// ---------------------------------------------------------------------------
// Conversation tree
// ---------------------------------------------------------------------------

/**
 * @deprecated Replaced by `SessionTree` (see below). Retained only for
 * existing test compatibility; do not read in production code. Removal is
 * tracked as a separate cleanup once tests migrate.
 */
export interface ConversationNode {
  uuid: string;
  parentUuid: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  isSidechain: boolean;
}

// ---------------------------------------------------------------------------
// Session tree (hierarchical view of session + subagents)
// ---------------------------------------------------------------------------

export type SessionTreeNodeKind =
  | 'session-root'
  | 'subagent-root'
  | 'assistant-turn'
  | 'user-turn'
  | 'tool-call';

export interface NodeCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface BaseSessionTreeNode {
  /** Stable identifier. See id-mapping table in the spec. */
  id: string;

  /** Parent node id. null only for the top-level session-root. */
  parentId: string | null;

  /** Children in chronological order. */
  children: SessionTreeNode[];

  /** ISO 8601 timestamp of the first event this node represents. */
  timestamp: string;

  /** Cost attributable to this node itself, not including descendants. */
  selfCost: NodeCost;

  /** selfCost + sum of all descendants' rollup cost. */
  rollupCost: NodeCost;
}

export interface SessionRootNode extends BaseSessionTreeNode {
  kind: 'session-root';
  sessionId: string;
  slug: string;
  firstMessage: string;
  firstTs: string;
  lastTs: string;
  filePath: string;
  projectKey: string;
  gitBranch: string;
}

export interface SubagentRootNode extends BaseSessionTreeNode {
  kind: 'subagent-root';
  agentId: string;
  /** From .meta.json — "Explore", "Plan", etc. */
  agentType: string;
  /** From .meta.json — one-line purpose. */
  description: string;
  /** From parent's Agent tool_use input. */
  prompt: string;
  /** The PARENT session's uuid (back-reference). */
  sessionId: string;
  /** Path to the subagent JSONL. */
  filePath: string;
  /**
   * Tree node id of the assistant turn in the parent session that dispatched
   * this subagent (e.g. "asst:<uuid>"). null for orphan linkage.
   */
  dispatchedByTurnId: string | null;
  /**
   * Tree node id of the Agent tool-call that spawned this subagent
   * (e.g. "tool:<callId>"). null for orphan linkage.
   */
  dispatchedByToolCallId: string | null;
  /** How the link was resolved (see `SubagentLinkage`). */
  linkage: SubagentLinkage;
}

export interface AssistantTurnNode extends BaseSessionTreeNode {
  kind: 'assistant-turn';
  /** AssistantRecord.uuid */
  uuid: string;
  model: string;
  stopReason: string;
  /** Reuses the existing TokenUsage type. */
  usage: TokenUsage;
  textPreview: string;
  hasThinking: boolean;
  isSidechain: boolean;
}

export interface UserTurnNode extends BaseSessionTreeNode {
  kind: 'user-turn';
  /** UserRecord.uuid */
  uuid: string;
  textPreview: string;
  isMeta: boolean;
  isSidechain: boolean;
}

export interface ToolCallNode extends BaseSessionTreeNode {
  kind: 'tool-call';
  /** ToolExecution.callId */
  callId: string;
  /** "Bash", "Read", "Agent", etc. */
  name: string;
  filePath: string | null;
  command: string | null;
  pattern: string | null;
  durationMs: number | null;
  isError: boolean;
  isSidechain: boolean;
}

export type SessionTreeNode =
  | SessionRootNode
  | SubagentRootNode
  | AssistantTurnNode
  | UserTurnNode
  | ToolCallNode;

/**
 * Records how a subagent was matched to its parent Agent tool-call. Three-tier
 * priority: tier 1 (`agentid-in-result`) wins when the parent's tool_result
 * text contains the subagent's agentId; tier 2 (`timestamp-match`) is the
 * fallback when tier 1 has no match and the timestamps align within 10 ms;
 * tier 3 (`orphan`) is the last resort. Tiers are walked strictly in order;
 * the `method` field always names the highest tier that succeeded.
 */
export type SubagentLinkage =
  | { method: 'agentid-in-result'; confidence: 'high' }
  | { method: 'timestamp-match'; confidence: 'high'; deltaMs: number }
  | { method: 'orphan'; confidence: 'none'; reason: string };

export interface SessionTreeWarning {
  kind:
    | 'orphan-assistant-turn'
    | 'orphan-user-turn'
    | 'orphan-tool-call'
    | 'orphan-subagent'
    | 'subagent-parse-failed'
    | 'nested-subagent-skipped';
  detail: string;
}

export interface SessionTree {
  /** The root session node — always a session-root kind. */
  root: SessionTreeNode;

  /** Every node in the tree, keyed by id, for O(1) lookup. */
  nodesById: Map<string, SessionTreeNode>;

  /** Subagent roots only, keyed by agentId. Shortcut for "show me all subagents". */
  subagentsByAgentId: Map<string, SessionTreeNode>;

  /** Tree-wide totals, rolled up from all descendants. */
  totals: {
    assistantTurns: number;
    userTurns: number;
    toolCalls: number;
    toolErrors: number;
    subagents: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    durationMs: number;
  };

  /** Diagnostics from the build pass. Empty array means clean build. */
  warnings: SessionTreeWarning[];
}
