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

  /** UUID-based conversation tree (parentUuid → children) */
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

export interface ConversationNode {
  uuid: string;
  parentUuid: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  isSidechain: boolean;
}
