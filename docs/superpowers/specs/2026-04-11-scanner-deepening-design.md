# Scanner Deepening — Comprehensive JSONL Extraction

**Date:** 2026-04-11
**Status:** Draft
**Priority:** Critical — this is the data foundation for board cards, analytics, auto-linking, and all future session intelligence.

## Problem

The session scanner was built incrementally for a dashboard that needed "list sessions with basic stats." The app has evolved into a kanban board with rich info-radiator cards, cost analytics, session-task linking, and agent behavior insights. The extraction layer hasn't kept up.

Current state:
- **8 record types** exist in each JSONL session file
- The scanner meaningfully reads **2** (assistant, user) and ignores the other 6
- ~70% of available fields are never examined
- `session-scanner.ts` reads only the **first 25 lines** for metadata
- `session-analytics.ts` reads the entire file but only extracts token usage and tool errors
- `cost-indexer.ts` reads the entire file a **third time** for cost records
- Three separate full-file reads of the same data, each extracting different slices

## Approach

**Parse once, consume many.** A new `session-parser.ts` module reads each JSONL file exactly once and produces a comprehensive typed `ParsedSession` object. Existing scanner modules migrate to consuming this parsed output instead of re-reading raw files. No change to refresh timing, caching strategy, or user-facing behavior.

## JSONL Record Types (Complete Schema)

Based on analysis of real session files, these are all 8 record types and every field they contain.

### Common Fields (present on most record types)

```
timestamp        string    ISO 8601
sessionId        string    Session UUID
uuid             string    Record UUID
parentUuid       string    UUID of parent record (conversation threading)
isSidechain      boolean   Whether this is a branched conversation path
entrypoint       string    "cli" | "web" | etc.
userType         string    "external" | etc.
cwd              string    Working directory at time of record
version          string    Claude Code version
gitBranch        string    Active git branch
slug             string    Human-readable session name (appears after first turn)
```

### 1. `assistant` — AI responses

**Record-level fields:** Common fields + `requestId`, `message`

**`message` object:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Anthropic API message ID |
| `model` | string | Model used (e.g. "claude-sonnet-4-20250514") |
| `role` | string | Always "assistant" |
| `type` | string | Always "message" |
| `stop_reason` | string | "end_turn", "tool_use", "max_tokens" |
| `stop_details` | object | Additional stop context |
| `stop_sequence` | string\|null | Stop sequence if triggered |
| `content` | array | Content blocks (see below) |
| `usage` | object | Token usage (see below) |

**`usage` object:**
| Field | Type | Description |
|-------|------|-------------|
| `input_tokens` | number | Input tokens consumed |
| `output_tokens` | number | Output tokens generated |
| `cache_read_input_tokens` | number | Tokens served from cache |
| `cache_creation_input_tokens` | number | Tokens written to cache |
| `cache_creation` | object | Ephemeral cache details |
| `service_tier` | string | API service tier |
| `inference_geo` | string | Inference geography |
| `iterations` | array | Iteration metadata |
| `speed` | string | "standard" etc. |
| `server_tool_use` | object | `{ web_search_requests, web_fetch_requests }` |

**Content block types:**
- `thinking` — reasoning trace (has `thinking` text field)
- `text` — response text (has `text` field)
- `tool_use` — tool invocation (has `id`, `name`, `input` fields)

### 2. `user` — Human messages and tool results

**Record-level fields:** Common fields + `message`, `promptId`, `permissionMode`, `isMeta`, `sourceToolAssistantUUID`, `sourceToolUseID`, `toolUseResult`

**`toolUseResult` object (present on tool result records):**
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Result type |
| `durationMs` | number | Tool execution time |
| `numFiles` | number | Files matched (glob results) |
| `filenames` | string[] | File paths matched |
| `truncated` | boolean | Whether output was truncated |
| `success` | boolean | Whether tool succeeded |
| `commandName` | string | Skill/command name (for Skill tool) |
| `file` | object | File content (for Read tool): `{ filePath, content, numLines, startLine, totalLines }` |
| `matches` | array | Search matches (for ToolSearch) |
| `task` | object | Task details (for TaskCreate/Update) |

**Content block types:**
- `text` — user message text
- `tool_result` — tool execution result (has `tool_use_id`, `content`, `is_error`)

### 3. `system` — Framework events

**Record-level fields:** Common fields + `subtype`, `level`, `isMeta`

**Subtypes:**

**`turn_duration`** — Emitted after each agent turn completes
| Field | Type | Description |
|-------|------|-------------|
| `durationMs` | number | Total turn wall-clock time |
| `messageCount` | number | Messages in the turn |

**`stop_hook_summary`** — Hook execution results at turn end
| Field | Type | Description |
|-------|------|-------------|
| `hookCount` | number | Hooks that ran |
| `hookInfos` | array | `[{ command, durationMs }]` per hook |
| `hookErrors` | array | Errors from hooks |
| `preventedContinuation` | boolean | Whether a hook blocked the next turn |
| `stopReason` | string | Why the turn stopped |
| `hasOutput` | boolean | Whether hooks produced output |
| `toolUseID` | string | Associated tool use |

**`local_command`** — Slash command invoked
| Field | Type | Description |
|-------|------|-------------|
| `content` | string | XML with command-name, command-message, command-args |

**`bridge_status`** — Remote control session
| Field | Type | Description |
|-------|------|-------------|
| `content` | string | Status message |
| `url` | string | Remote session URL |
| `upgradeNudge` | string | Upgrade prompt |

### 4. `file-history-snapshot` — File backup timeline
| Field | Type | Description |
|-------|------|-------------|
| `messageId` | string | Which message triggered this snapshot |
| `isSnapshotUpdate` | boolean | Incremental vs full snapshot |
| `snapshot` | object | File state data |

### 5. `queue-operation` — Session lifecycle
| Field | Type | Description |
|-------|------|-------------|
| `operation` | string | "enqueue", "dequeue", "remove" |
| `content` | string | Optional context |

### 6. `attachment` — Tool availability changes
| Field | Type | Description |
|-------|------|-------------|
| `attachment.type` | string | "deferred_tools_delta" |
| `attachment.addedNames` | string[] | Tools that became available |
| `attachment.removedNames` | string[] | Tools that were removed |

### 7. `permission-mode` — Permission changes
| Field | Type | Description |
|-------|------|-------------|
| `permissionMode` | string | New permission mode |

### 8. `last-prompt` — Final prompt reference
Terminal record marking end of session content.

### Subagent Files

Subagent JSONL files live at `{sessionId}/subagents/agent-{id}.jsonl` and have identical record structure to parent sessions, plus an `agentId` field on records.

Companion `.meta.json` files contain:
| Field | Type | Description |
|-------|------|-------------|
| `agentType` | string | "Explore", "Plan", "general-purpose", etc. |
| `description` | string | What the agent was dispatched to do |

## New Module: `session-parser.ts`

### Responsibility

Read a JSONL file once. Return a typed `ParsedSession` containing all extracted data, organized by domain. No computation — just faithful translation of raw records into structured types.

### Output: `ParsedSession`

```typescript
interface ParsedSession {
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
  counts: {
    totalRecords: number;
    assistantMessages: number;
    userMessages: number;
    systemEvents: number;
    toolCalls: number;
    toolErrors: number;
    fileSnapshots: number;
    sidechainMessages: number;
  };
}
```

### Supporting Types

```typescript
interface SessionMeta {
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

interface AssistantRecord {
  uuid: string;
  parentUuid: string;
  timestamp: string;
  requestId: string;
  isSidechain: boolean;
  model: string;
  stopReason: string;        // "end_turn" | "tool_use" | "max_tokens"
  usage: TokenUsage;
  toolCalls: ToolCall[];     // tool_use blocks from content
  hasThinking: boolean;      // whether thinking block was present
  textPreview: string;       // first 300 chars of text content
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  serviceTier: string;
  inferenceGeo: string;
  speed: string;
  serverToolUse: { webSearchRequests: number; webFetchRequests: number };
}

interface ToolCall {
  id: string;
  name: string;
  filePath: string | null;   // extracted from input.file_path or input.path
  command: string | null;     // extracted from input.command (Bash tool)
  pattern: string | null;     // extracted from input.pattern (Grep/Glob)
}

interface UserRecord {
  uuid: string;
  parentUuid: string;
  timestamp: string;
  isSidechain: boolean;
  isMeta: boolean;
  permissionMode: string | null;
  toolResults: ToolResult[];
  textPreview: string;       // first 300 chars of user text content
}

interface ToolResult {
  toolUseId: string;
  isError: boolean;
  durationMs: number | null;
  success: boolean | null;
}

interface ToolExecution {
  /** Matched pair: assistant's tool_use + user's tool_result */
  callId: string;             // tool_use.id
  name: string;
  filePath: string | null;
  command: string | null;
  pattern: string | null;
  timestamp: string;          // from the assistant record
  resultTimestamp: string;     // from the user record
  durationMs: number | null;  // from toolUseResult
  isError: boolean;
  isSidechain: boolean;
}

interface TurnDuration {
  timestamp: string;
  durationMs: number;
  messageCount: number;
  parentUuid: string;
}

interface HookSummary {
  timestamp: string;
  hookCount: number;
  hooks: Array<{ command: string; durationMs: number }>;
  errors: string[];
  preventedContinuation: boolean;
  stopReason: string;
}

interface LocalCommand {
  timestamp: string;
  content: string;            // raw XML content — consumer can parse command name/args
}

interface BridgeEvent {
  timestamp: string;
  url: string;
  content: string;
}

interface FileSnapshot {
  messageId: string;
  isUpdate: boolean;
  timestamp: string;          // inferred from surrounding records
}

interface LifecycleEvent {
  timestamp: string;
  type: "permission-change" | "queue-enqueue" | "queue-dequeue" | "queue-remove" | "tools-changed" | "last-prompt";
  detail: string;             // permission mode, operation name, or tool count
}

interface ConversationNode {
  uuid: string;
  parentUuid: string;
  type: "user" | "assistant" | "system";
  timestamp: string;
  isSidechain: boolean;
}
```

### Parser Function Signature

```typescript
/** Parse a single JSONL file into a comprehensive ParsedSession.
 *  Reads the file once, extracts all record types. */
export function parseSessionFile(filePath: string, projectKey: string): ParsedSession | null;
```

### Tool Execution Matching

The parser matches `tool_use` blocks (from assistant messages) with `tool_result` blocks (from the next user message) using the tool call ID. This produces the `ToolExecution` timeline — a paired record of what was called, how long it took, and whether it failed.

The matching strategy: assistant content blocks contain `tool_use` items with an `id`. The subsequent user message contains `tool_result` items with a `tool_use_id` that references back. The parser tracks pending tool calls and resolves them when the matching result arrives.

For `toolUseResult` (the record-level field on user records, separate from `tool_result` content blocks), the parser extracts `durationMs` and `success` when present and attaches them to the corresponding `ToolExecution`.

## Cache Layer: `session-cache.ts`

A new module that manages parsed session data with the same TTL-based caching strategy used today.

```typescript
/** Get parsed session data, using cache when valid.
 *  On cache miss, calls parseSessionFile() for each session file. */
export function getParsedSessions(): Map<string, ParsedSession>;

/** Get a single parsed session by ID. */
export function getParsedSession(sessionId: string): ParsedSession | null;

/** Invalidate cache (called at scan cycle start). */
export function invalidateCache(): void;
```

The cache stores `ParsedSession` objects keyed by session ID. Cache TTL matches the existing 5-minute window. The existing `scanAllSessions()` call triggers cache population.

## Migration Plan

The migration is incremental — existing consumers switch to reading from the parsed cache one at a time. Nothing breaks during transition.

### Phase 1: New parser + cache (additive, no changes to existing code)
- Create `session-parser.ts` with `parseSessionFile()`
- Create `session-cache.ts` with cache management
- Create `ParsedSession` and all supporting types in `shared/session-types.ts`
- Add comprehensive tests for the parser against real JSONL structure
- Wire cache population into the scan cycle (`scanner/index.ts`)

### Phase 2: Migrate session-scanner.ts
- `parseSession()` switches from `readHead()` + `readTailTs()` to reading from the parsed cache
- `SessionData` fields populated from `ParsedSession.meta` + computed fields (isEmpty, isActive, messageCount)
- `readHead()` and `readTailTs()` become unused (keep for now, remove later)
- **Validation:** All existing session-scanner tests must pass unchanged

### Phase 3: Migrate session-analytics.ts
- `analyzeSession()` switches from raw file reading to consuming `ParsedSession`
- Cost, health, file ops, and message timestamps all derived from parsed data
- This is the biggest win — eliminates the largest redundant file read
- **Validation:** All existing analytics tests must pass unchanged

### Phase 4: Migrate cost-indexer.ts
- `parseJSONLForCosts()` switches to consuming `ParsedSession.assistantMessages`
- Incremental indexing continues to work via byte-offset tracking on the cache layer
- **Validation:** Cost summary numbers must match pre-migration values

### Phase 5: New data consumers (post-migration)
With all data now available in the parsed cache, new features can consume it:
- Session enricher gets richer data (stop reasons, turn durations, tool timeline)
- Board cards can show new signals (hook health, performance, session behavior)
- Auto-linking can use tool timelines and file paths for matching
- Analytics page can show new dimensions (turn performance, tool efficiency, cache hit rates)

## What This Enables (Future Consumers)

These are not part of this spec — they're downstream features that become possible once the parser exists:

- **Auto session-task linking** — match sessions to tasks via tool file paths, git branch, timing
- **Richer board cards** — stop reason distribution, turn performance, tool efficiency
- **Session behavior analysis** — sidechain detection, thinking patterns, tool retry rates
- **Performance analytics** — turn duration trends, hook overhead, cache efficiency
- **Session replay/timeline** — full conversation tree with tool execution detail
- **Cost optimization insights** — cache hit rates, wasted tokens, external API usage

## Testing Strategy

- **Parser unit tests:** Feed known JSONL content, verify every field in `ParsedSession` is correctly extracted
- **Round-trip validation:** For each migrated consumer, compare output before and after migration — numbers must match exactly
- **Edge cases:** Empty sessions, malformed records, truncated files, sessions with only system records, subagent files
- **Performance benchmark:** Parse all 790 sessions, verify total time stays under 3 seconds
- **Safety tests:** Existing `new-user-safety.test.ts` continues to pass (no PII in new types)

## Files Created/Modified

**New files:**
- `shared/session-types.ts` — ParsedSession and all supporting types
- `server/scanner/session-parser.ts` — JSONL parser
- `server/scanner/session-cache.ts` — Cache management
- `tests/session-parser.test.ts` — Parser tests

**Modified files (during migration phases):**
- `server/scanner/index.ts` — Wire cache into scan cycle
- `server/scanner/session-scanner.ts` — Switch to parsed cache
- `server/scanner/session-analytics.ts` — Switch to parsed cache
- `server/scanner/cost-indexer.ts` — Switch to parsed cache
- `shared/types.ts` — Import/re-export from session-types.ts

**Not modified:**
- `server/board/session-enricher.ts` — Continues consuming SessionData/SessionCostData as before; richer enrichment is a separate future task
- `server/routes/` — API contracts unchanged
- `client/` — No frontend changes
