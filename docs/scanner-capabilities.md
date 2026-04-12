# Scanner Capabilities

**Purpose:** A reference for developers (and anyone new to agent-cc) who want to build features that consume scanner output. This is a "what can I get out of the scanner and how do I use it" sheet — not an implementation guide. If you need to know how the scanner parses a specific JSONL field, read `server/scanner/session-parser.ts`. If you need to know what data is available and where to get it, start here.

## What the scanner does

Agent CC's scanner reads `~/.claude/projects/**/*.jsonl` (Claude Code's session logs) and turns them into structured, queryable data. Everything the scanner produces is served through `/api/*` routes and cached in-memory so the UI can read it without re-parsing JSONL on every request.

The scanner has two complementary views of a session:

- **Flat arrays (`ParsedSession`)** — Fast, stable, battle-tested. Good for summing things (token totals, cost rollups across all sessions) and for consumers that just need "list of assistant messages" or "list of tool calls."
- **Hierarchical tree (`SessionTree`)** — New. Good for consumers that need to understand parent-child relationships: which tool calls belong to which assistant turn, which subagents were dispatched by which parent turn, cost rollups that include subagent spend.

Both are built from the same raw JSONL. The tree is additive; every flat-array field still exists unchanged. `SessionTree` shipped with the session-hierarchy milestone (merged to main in PR #3).

## Data extraction — `ParsedSession` (flat arrays)

**Type location:** `shared/session-types.ts`
**Producer:** `server/scanner/session-parser.ts` → `parseSessionFile(filePath)`
**Consumers reach it via:** `sessionParseCache.getById(id)` or `getByPath(path)` or `getAll()`

### Top-level fields

| Field | Type | Purpose |
|---|---|---|
| `meta` | `SessionMeta` | Session identity (id, slug, timestamps, path, project key, git branch, version). |
| `assistantMessages` | `AssistantRecord[]` | All assistant turns in chronological order. |
| `userMessages` | `UserRecord[]` | All user messages in chronological order. |
| `systemEvents` | object | `turnDurations`, `hookSummaries`, `localCommands`, `bridgeEvents` — events extracted from system message subtypes. |
| `toolTimeline` | `ToolExecution[]` | Every tool_use matched to its tool_result. One record per executed tool call. |
| `fileSnapshots` | `FileSnapshot[]` | File history snapshots Claude Code captured during the session. |
| `lifecycle` | `LifecycleEvent[]` | Permission changes, queue operations, tool toggles, last-prompt markers. |
| `conversationTree` | `ConversationNode[]` | **Deprecated fossil.** 5-field lightweight tree (uuid, parentUuid, type, timestamp, isSidechain). Never read by production code. Use `SessionTree` instead. |
| `counts` | `SessionCounts` | Raw counts: totalRecords, assistantMessages, userMessages, systemEvents, toolCalls, toolErrors, fileSnapshots, sidechainMessages. |

### `SessionMeta`

`sessionId`, `slug`, `firstMessage`, `firstTs`, `lastTs`, `sizeBytes`, `filePath`, `projectKey`, `cwd`, `version`, `gitBranch`, `entrypoint`.

### `AssistantRecord`

`uuid`, `parentUuid`, `timestamp`, `requestId`, `isSidechain`, `model`, `stopReason`, `usage` (`TokenUsage`), `toolCalls` (`ToolCall[]`), `hasThinking`, `textPreview` (first 300 chars, newlines collapsed, `<system-reminder>` / `<command-name>` / `<command-message>` stripped).

`TokenUsage`: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `serviceTier`, `inferenceGeo`, `speed`, `serverToolUse` (webSearch + webFetch counts).

`ToolCall`: `id`, `name`, `filePath`, `command`, `pattern`.

### `UserRecord`

`uuid`, `parentUuid`, `timestamp`, `isSidechain`, `isMeta`, `permissionMode`, `toolResults` (`ToolResult[]`), `textPreview`.

`ToolResult`: `toolUseId` (matches `ToolCall.id`), `isError`, `durationMs`, `success`.

### `ToolExecution`

A matched tool_use + tool_result pair. Lifecycle record for a complete tool call:

`callId`, `name`, `filePath`, `command`, `pattern`, `timestamp` (when invoked), `resultTimestamp` (when result received), `durationMs`, `isError`, `isSidechain`, `issuedByAssistantUuid` (pointer to the assistant turn that issued this call — enables the tree builder to attach tool-call nodes under the correct assistant-turn parent).

### Cost computation

**Pricing table:** `server/scanner/pricing.ts`, USD per million tokens:

| Model family | Input | Output | Cache read | Cache creation |
|---|---|---|---|---|
| `opus-4-6` | $5 | $25 | $0.50 | $6.25 |
| `opus-4-5` | $5 | $25 | $0.50 | $6.25 |
| `opus` (4.0/4.1) | $15 | $75 | $1.50 | $18.75 |
| `sonnet` | $3 | $15 | $0.30 | $3.75 |
| `haiku-4-5` | $1 | $5 | $0.10 | $1.25 |
| `haiku` (3.5 and older) | $0.80 | $4 | $0.08 | $1 |

**Formula:** `(input × p.input + output × p.output + cacheRead × p.cacheRead + cacheCreation × p.cacheCreation) / 1_000_000`

Cost is computed per assistant message (using its `usage` and `model`) and summed per session in `session-analytics.ts`. Per-day / per-project / per-model aggregations come from `cost-indexer.ts`, which walks JSONL incrementally and builds a separate `CostRecord` index optimized for `/api/analytics/costs` reads.

## Data extraction — `SessionTree` (hierarchy)

**Type location:** `shared/session-types.ts`
**Producer:** `server/scanner/session-tree-builder.ts` → `buildSessionTree(parent, subagents)`
**Subagent discovery:** `server/scanner/subagent-discovery.ts` → `discoverSubagents(sessionFilePath)`
**Consumers reach it via:** `sessionParseCache.getTreeById(id)` or `getTreeByPath(path)`, or `GET /api/sessions/:id?include=tree`

### Top-level shape

| Field | Type | Purpose |
|---|---|---|
| `root` | `SessionTreeNode` (kind='session-root') | The top of the tree. |
| `nodesById` | `Map<string, SessionTreeNode>` | O(1) lookup for any node by its prefixed id. |
| `subagentsByAgentId` | `Map<string, SessionTreeNode>` | Shortcut — iterate subagents without walking the tree. |
| `totals` | object | Tree-wide rollups: `assistantTurns`, `userTurns`, `toolCalls`, `toolErrors`, `subagents`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `costUsd`, `durationMs`. |
| `warnings` | `SessionTreeWarning[]` | Non-fatal build diagnostics. Empty means clean build. |

### Node kinds

Every node extends a base with `id`, `parentId`, `children`, `timestamp`, `selfCost`, `rollupCost`. Five kinds:

| Kind | Adds | ID format |
|---|---|---|
| `session-root` | sessionId, slug, firstMessage, firstTs, lastTs, filePath, projectKey, gitBranch | `session:<sessionId>` |
| `subagent-root` | agentId, agentType, description, prompt, sessionId (parent), filePath, dispatchedByTurnId, dispatchedByToolCallId, linkage | `agent:<agentId>` |
| `assistant-turn` | uuid, model, stopReason, usage, textPreview, hasThinking, isSidechain | `asst:<uuid>` |
| `user-turn` | uuid, textPreview, isMeta, isSidechain | `user:<uuid>` |
| `tool-call` | callId, name, filePath, command, pattern, durationMs, isError, isSidechain | `tool:<callId>` |

### Parent-child rules

```
session-root
├── assistant-turn              (by parentUuid chain)
│   ├── tool-call               (by tool_use → tool_result pairing)
│   │   └── subagent-root       (when tool_call.name === 'Agent' and linkage resolves)
│   │       ├── assistant-turn  (recursively built from subagent JSONL)
│   │       │   └── tool-call
│   │       └── user-turn
│   └── user-turn
└── user-turn
```

Tool-call nodes always attach to the assistant-turn that issued them (not by timestamp — by the tool_use / tool_result id pairing already known at parse time). Subagent-roots attach to the `Agent` tool-call that dispatched them; when linkage fails they hang directly off `session-root` instead of vanishing.

### Three-tier subagent linkage

Applied in strict order per subagent. First tier that matches wins.

1. **`agentid-in-result`** (confidence: `high`). For each `Agent` tool-call in the parent, look up its matching `tool_result` text. If the result contains the subagent's 16-char `agentId`, link there. This is the preferred method — the agentId is effectively collision-proof.
2. **`timestamp-match`** (confidence: `high`, `deltaMs` recorded). Only if tier 1 matched nothing. Compute `Δ = |parentAgentCall.ts − subagent.firstRecordTs|` for every Agent call and pick the minimum; if `Δ ≤ 10 ms`, link there. Observed real-world max Δ is 4 ms, so 10 ms is a safety margin.
3. **`orphan`** (confidence: `none`, `reason` string). Only if tiers 1 and 2 both failed. Attach the subagent-root directly to `session-root` and emit an `orphan-subagent` warning. Subagent stays visible; we never drop data.

### `selfCost` vs `rollupCost`

- `assistant-turn.selfCost` — computed from the turn's `TokenUsage` via the pricing table. This is the only kind with non-zero self-cost.
- `selfCost` on every other kind is zero. Tool-calls, user-turns, subagent-roots, and the session-root are containers, not token consumers.
- `rollupCost` — post-order sum. `rollupCost = selfCost + Σ(children.rollupCost)`.
- `SessionTree.totals.costUsd === root.rollupCost.costUsd`.

**Usage pattern:** `root.rollupCost.costUsd - root.selfCost.costUsd` tells you exactly how much a session spent inside its subagents vs. in the parent.

### Warning kinds

`orphan-assistant-turn`, `orphan-tool-call`, `orphan-subagent`, `subagent-parse-failed`, `nested-subagent-skipped`. All non-fatal — the tree always builds.

## Other entity scanners

Sessions are the primary data but the scanner ecosystem covers several other entity types. Each produces its own shape and has its own routes.

| Scanner | Entity | Notes |
|---|---|---|
| `session-scanner.ts` | `session` | Sessions, live-updated with enrichment. |
| `task-scanner.ts` | `task`, `milestone` | Reads workflow-framework `.claude/roadmap/<milestone>/*.md` files. See CLAUDE.md → "Workflow-Framework Integration Contract." |
| `project-scanner.ts` | `project` | Groups sessions by project key; enriches with sessionCount and sessionSize. |
| `mcp-scanner.ts` | `mcp` | MCP server definitions. |
| `skill-scanner.ts` | `skill` | Skill definitions under `~/.claude/skills/`. |
| `plugin-scanner.ts` | `plugin` | Plugin definitions. |
| `agent-scanner.ts` | `agent` | Agent definitions + agent execution records. |
| `markdown-scanner.ts` | `markdown` | CLAUDE.md and other docs. |
| `config-scanner.ts` | `config` | Configuration entities. |
| `library-scanner.ts` | `library` | Uninstalled library items from `~/.claude/library/`. |
| `cost-indexer.ts` | `CostRecord` | Incremental cost index; built from session JSONL without a full parse. |
| `commit-linker.ts` | — | Links sessions to git commits via session timestamps. |
| `auto-workflows.ts` | — | Enriches sessions with detected workflows. |
| `continuation-detector.ts` | — | Flags unfinished work across sessions. |

## API endpoints

All routes under `/api/*` on the Express server (default `http://localhost:5100`). Every response is a valid shape even when data is empty (see CLAUDE.md → "Graceful degradation").

### Sessions

| Method + path | Query params | Response |
|---|---|---|
| `GET /api/sessions` | `q`, `sort` (`lastTs`\|`firstTs`\|`sizeBytes`\|`messageCount`\|`slug`), `order` (`asc`\|`desc`), `hideEmpty`, `activeOnly`, `project`, `page`, `limit` | `{ sessions, stats, canUndo, pagination }` |
| `GET /api/sessions/:id` | `include=tree` (optional) | `{ ...SessionData, records, parsed, tree? }` |
| `GET /api/sessions/search` | filter params | Full-text / structured search results |
| `GET /api/sessions/file-timeline` | `file` | Timeline of edits to a file across sessions |
| `POST /api/sessions/nl-query` | body: `{ query }` | Natural language query result (requires Claude CLI) |
| `GET /api/sessions/continuations` | — | Unfinished work items |
| `GET /api/sessions/nerve-center` | — | Operations meta view |

The `?include=tree` parameter has three states on `/api/sessions/:id`:
- **Absent** — default, no `tree` field in response (byte-identical to pre-hierarchy behavior).
- **`tree: null`** — tree requested but couldn't be built (file missing, parse failed).
- **`tree: SessionTree`** — tree requested and built. `tree.warnings` may still be non-empty; that's informational, not a failure.

### Analytics (session-derived)

| Path | Purpose |
|---|---|
| `GET /api/sessions/analytics/costs` | Cost summary across sessions |
| `GET /api/sessions/analytics/files` | File heatmap (reads/writes/edits) |
| `GET /api/sessions/analytics/health` | Session health scores + reason tags |
| `GET /api/sessions/analytics/stale` | Sessions suggested for cleanup |
| `GET /api/sessions/analytics/projects` | Per-project dashboards |
| `GET /api/sessions/analytics/digest` | Weekly activity digest |
| `GET /api/sessions/analytics/bash` | Bash command knowledge base |
| `GET /api/sessions/analytics/bash/search` | Search bash commands |

### Cost analytics (cost-indexer-backed, faster)

All accept `?days=7|30|90`.

| Path | Purpose |
|---|---|
| `GET /api/analytics/costs` | Indexed cost summary |
| `GET /api/analytics/costs/session/:id` | Detailed cost breakdown for one session |
| `GET /api/analytics/costs/anatomy` | Token usage by destination (input/output/cache read/cache write) |
| `GET /api/analytics/costs/models` | Per-model token and cost breakdown |
| `GET /api/analytics/costs/cache` | Cache efficiency metrics |
| `GET /api/analytics/costs/value` | Session and project value analysis |

### Scanner control

| Path | Purpose |
|---|---|
| `POST /api/scanner/rescan` | Trigger full rescan |
| `GET /api/scanner/status` | `{ scanning, scanVersion, lastScanDuration, parseCacheSize, entityCounts, totalEntities, totalRelationships }` |
| `GET /api/scanner/events` | Server-sent events for scan progress (`scan-start`, `scan-complete`, `:keepalive`) |

### Graph

`GET /api/graph` with scope params — returns entity nodes and relationships. Sessions appear as nodes with cost/activity annotations. See `server/routes/graph.ts`.

## What the scanner does NOT capture

Known gaps and deliberate exclusions:

- **Nested subagents.** A subagent can theoretically spawn its own subagents. The current tree builder does not recurse into `<subagent>/subagents/` directories. If a subagent JSONL contains an `Agent` tool_use, a `nested-subagent-skipped` warning is emitted and the inner agent is not attached to the tree. Deferred until a real nested example exists to test against.
- **`conversationTree` accuracy.** The legacy `ParsedSession.conversationTree` field drops ~18% of records silently (verified on a real 470 KB session: 31 of 171 records missing, 8 orphan parentUuid references, zero subagents represented). It has no production consumers. Use `SessionTree` instead.
- **Full message content.** `textPreview` is capped at 300 chars and collapses newlines. The full message bodies exist in the raw JSONL but are not indexed or exposed as search fields. Deep search walks message content linearly.
- **Tool capability parsing.** The parser only records tools that were actually invoked (`tool_use` blocks in the session). Tools that were available but never called are not tracked. Tool schemas / parameter definitions are not parsed.
- **Subagent file invalidation.** Subagent JSONL files are not tracked for invalidation independently. Cache refresh is triggered only by the parent session's file size changing. If a subagent file changes without the parent changing, the stale tree is served until a full rescan.
- **Streaming / live sessions.** The parser tolerates truncated final lines (sessions currently being written). The tree built from a partial parse is a partial tree. Next scan rebuilds. No special live-update mode.
- **Non-JSONL sources.** The scanner only reads `.jsonl` under `~/.claude/projects/`. Session data from other Claude surfaces (web, mobile, Workbench) is not ingested.
- **Silent record types.** The parser recognizes `user`, `assistant`, and `system` record types with their known subtypes. Unknown record types are logged but not surfaced to consumers.

## Cache behavior

**File:** `server/scanner/session-cache.ts`

- **What's cached:** `{ parsed, tree, fileSize }` per session file. Tree and parsed are populated together and invalidated together.
- **Cache key:** Absolute file path to the `.jsonl`, normalized to forward slashes.
- **Invalidation trigger:** File size via `fs.statSync`. Cache entry is considered stale when `stat.size !== cached.fileSize`. Mtime is not consulted — size is the signal. (For a growing JSONL, size change is guaranteed.)
- **Subagent invalidation:** Not tracked independently. Subagent JSONL files are parsed when the parent is parsed, and the resulting tree is cached as one unit with the parent. A subagent change won't trigger a rebuild unless the parent file size also changes.
- **Full scan vs single-session:**
  - **Full scan** (`scanAllSessions()` in `session-scanner.ts`) runs at startup and on `POST /api/scanner/rescan`. It calls `invalidateAll()` first, then walks every JSONL in `~/.claude/projects/**/`, building `ParsedSession` + `SessionTree` (eager subagent parse) for each.
  - **Single-session parse** happens when a route (e.g. `/api/sessions/:id`) calls `getOrParse(filePath)`. If the file size is unchanged, the cached entry is returned. Otherwise re-parse and update the cache.
- **Cost indexing runs separately.** `cost-indexer.ts` maintains its own incremental index with its own invalidation — don't confuse it with the session parse cache. Cost analytics routes read the cost index, not the session parse cache, for speed.
- **Tree accessors:**
  - `sessionParseCache.getTreeById(sessionId): SessionTree | null`
  - `sessionParseCache.getTreeByPath(filePath): SessionTree | null`
  - Existing methods (`getOrParse`, `getById`, `getByPath`, `getAll`) keep returning `ParsedSession` — backward compatible.

## Where to look next

- **Design rationale for SessionTree:** `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md`
- **Flat-to-tree migration audit:** `docs/audits/2026-04-13-flat-to-tree-audit.md`
- **Workflow-framework integration contract:** `CLAUDE.md` → "Workflow-Framework Integration Contract"
- **Parser tests (best source for "what does the parser actually produce"):** `tests/session-parser.test.ts`
- **Tree builder tests:** `tests/session-tree-builder.test.ts`, `tests/session-tree-integration.test.ts`, `tests/subagent-discovery.test.ts`
