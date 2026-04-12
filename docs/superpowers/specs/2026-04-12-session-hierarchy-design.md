# Session Hierarchy — Scanner Data Modeling

**Date:** 2026-04-12
**Status:** Draft
**Priority:** High — unblocks accurate cost attribution, full session browsing, and proper subagent visibility.

## Problem

A Claude Code session is a tree: a root session spawns subagents, subagents make tool calls and may spawn further subagents, and costs accumulate at every level. The scanner stores and exposes this data as flat arrays (`assistantMessages`, `userMessages`, `toolTimeline`), forcing every downstream consumer to reconstruct hierarchy on its own or ignore it entirely. The result:

- **Subagents are invisible.** The scanner only reads the top-level `<session>.jsonl` file. Subagent runs live in `<session>/subagents/agent-<id>.jsonl` and are never parsed. A session that dispatched 5 subagents reports `sidechainMessages: 0`.
- **Costs are undercounted.** A parent session's cost excludes every token spent inside its subagents. Cost analytics attribute everything to the root.
- **No tree view is possible.** Browsing a session means scrolling a flat list. There is no way to see "this assistant turn spawned this subagent, which made these tool calls."
- **Tool calls are orphaned.** `ToolExecution` records carry a `callId` but no `parentUuid`, so you cannot tell which assistant turn issued a given tool call without correlating by timestamp.

The existing `conversationTree: ConversationNode[]` field is a fossil. It stores only `{ uuid, parentUuid, type, timestamp, isSidechain }` per node — 5 fields, no content, no tools, no tree structure — and is never read by any route or UI component. Investigation on a real 470 KB session (see Appendix A) showed it drops ~18% of records silently, produces 8 orphan parent references, and does not represent subagents at all.

## Approach

**Option B: add a new `SessionTree` type alongside the existing flat arrays.** `ParsedSession` stays exactly as it is today. Every current consumer (~60 files, ~200 field reads across analytics, enrichment, routes, UI) keeps working unchanged. A new `SessionTree` object is built by the parser pipeline and cached alongside `ParsedSession`. Consumers that need hierarchy opt into the tree; consumers that need totals keep iterating flat arrays.

### Why not Option A (evolve `ParsedSession` into a tree)

`assistantMessages` and `userMessages` are read as flat arrays by 9+ files that want to sum tokens, count models, compute cache efficiency, etc. Forcing those consumers to tree-walk buys nothing — they want totals, not hierarchy. Rewriting 15+ well-tested files to satisfy 2 new consumers is churn without payoff.

### Why not Option D (no stored tree, compute at read-time)

The tree is expensive to build: it requires scanning subagent JSONL files, parsing each one, and resolving parent linkage. Building this on every route hit would reintroduce the problem the scanner-deepening milestone solved — reading JSONL multiple times per request. A cached tree is O(1) to read; a recomputed tree is O(subagent count × file size).

### Why keep `conversationTree` around

It has five test references but zero production consumers. Removing it is a separate cleanup that would churn tests for no functional gain. It is marked deprecated in types, stays in place, and is removed in a later milestone when the tests migrate. **This spec does not touch it.**

## Investigation findings (what the data shows)

See Appendix A for the full dump. Summary of what matters for this design:

- **Subagent files.** Live at `<project>/<session-uuid>/subagents/agent-<agentId>.jsonl`. Each has a sibling `.meta.json` containing `{ agentType, description }` — e.g. `{ "agentType": "Explore", "description": "Check git log for workflow-bridge commits" }`.
- **Back-reference.** Every record inside a subagent JSONL carries `sessionId` pointing to the parent session UUID, plus `agentId` identifying the subagent.
- **Parent linkage.** The parent session's `Agent` tool_use block contains `{ subagent_type, description, prompt }` in its `input` field. The matching tool_result message in the parent session contains the `agentId` in its result text (verified: exactly one line in the parent session matches a given subagent's `agentId`).
- **Timestamp alignment.** Every subagent's first-record timestamp matches its parent's `Agent` tool_use timestamp within 1–4 milliseconds in tested sessions.
- **`parseSessionFile` works on subagent files.** It parses them as standalone sessions. Output is usable but `meta.sessionId` is wrong (it takes the agent filename, not the parent session UUID).
- **One session, five subagents, clean mapping.** In the tested session, `parent.toolTimeline` had 5 Agent calls and the `subagents/` directory had exactly 5 JSONL files. No orphans, no duplicates.

## Data model

### `SessionTree`

A wrapper around the root node plus fast-lookup indices and aggregate counts.

```typescript
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
```

### `SessionTreeNode`

A single node in the tree. Five kinds, distinguished by the `kind` discriminator, each carrying only the fields relevant to that kind.

```typescript
export type SessionTreeNodeKind =
  | 'session-root'
  | 'subagent-root'
  | 'assistant-turn'
  | 'user-turn'
  | 'tool-call';

export interface BaseSessionTreeNode {
  /** Stable identifier. See id-mapping table below. */
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

export interface NodeCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
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
  agentType: string;           // from .meta.json — "Explore", "Plan", etc.
  description: string;          // from .meta.json — one-line purpose
  prompt: string;               // from parent's Agent tool_use input
  sessionId: string;            // the PARENT session's uuid (back-reference)
  filePath: string;             // path to the subagent JSONL
  /** Tree node id (prefixed form, e.g. "asst:<uuid>") of the assistant turn in the parent session that dispatched this subagent. null for orphan linkage. */
  dispatchedByTurnId: string | null;
  /** Tree node id (prefixed form, "tool:<callId>") of the Agent tool-call that spawned this subagent. null for orphan linkage. */
  dispatchedByToolCallId: string | null;
  linkage: SubagentLinkage;     // how the link was resolved (see below)
}

export interface AssistantTurnNode extends BaseSessionTreeNode {
  kind: 'assistant-turn';
  uuid: string;                 // AssistantRecord.uuid
  model: string;
  stopReason: string;
  usage: TokenUsage;            // existing type reused
  textPreview: string;
  hasThinking: boolean;
  isSidechain: boolean;
}

export interface UserTurnNode extends BaseSessionTreeNode {
  kind: 'user-turn';
  uuid: string;
  textPreview: string;
  isMeta: boolean;
  isSidechain: boolean;
}

export interface ToolCallNode extends BaseSessionTreeNode {
  kind: 'tool-call';
  callId: string;               // ToolExecution.callId
  name: string;                 // "Bash", "Read", "Agent", etc.
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
```

### ID mapping per kind

| Kind | `id` value | Source |
|---|---|---|
| `session-root` | `session:<sessionId>` | `ParsedSession.meta.sessionId` |
| `subagent-root` | `agent:<agentId>` | filename `agent-<agentId>.jsonl` |
| `assistant-turn` | `asst:<uuid>` | `AssistantRecord.uuid` |
| `user-turn` | `user:<uuid>` | `UserRecord.uuid` |
| `tool-call` | `tool:<callId>` | `ToolExecution.callId` |

Prefixed IDs avoid collisions between the namespaces (a tool callId and an assistant uuid can never clash) and make tree inspection human-readable.

### Parent-child rules

```
session-root
├── assistant-turn (by parentUuid chain or insertion order when chain is broken)
│   ├── tool-call (by tool_use → tool_result pairing in the same assistant turn)
│   │   └── subagent-root (when the tool-call.name === 'Agent' AND linkage resolves)
│   │       ├── assistant-turn (in the subagent's JSONL)
│   │       │   └── tool-call
│   │       │       └── subagent-root (nested — see Open Questions)
│   │       └── user-turn
│   └── user-turn
└── user-turn
```

**Key rules:**
1. When linkage resolves, a `subagent-root` is a child of the `tool-call` that dispatched it. When linkage fails, the `subagent-root` is a direct child of the `session-root` with `linkage.method === 'orphan'`. Orphans are visible but unattached; they never vanish.
2. `tool-call` nodes hang off the `assistant-turn` that issued them. We know which assistant-turn because the tool_use appears in that turn's `content` array. We do NOT need timestamps for this — the parser already knows the pairing from parsing the same message.
3. Within a subagent's tree, the same rules apply recursively using the subagent's own root.

### Linkage resolution — three-tier priority

Every subagent is matched to a parent `Agent` tool-call using **three tiers, tried strictly in order**. The first tier that succeeds wins; once a tier matches, lower tiers are never evaluated. This is the canonical definition — the algorithm below and the `SubagentLinkage` type both implement exactly this.

**Tier 1 — Strong link (`agentid-in-result`).**
For the candidate Agent call, inspect the matching `tool_result` content in `parent.userMessages` (located via the tool_use's `callId`). If the result text contains the subagent's `agentId` as a substring, link with method `agentid-in-result`, confidence `high`. This is the preferred tier because the agentId is a 17-char hex string — effectively zero collision risk, and the link is a property of the data, not wall-clock timing.

**Tier 2 — Timestamp fallback (`timestamp-match`).**
Only reached when tier 1 returns no match for this Agent call. Compute `Δ = |parentAgentCall.timestamp − subagent.firstRecordTimestamp|`. If `Δ ≤ 10 ms`, link with method `timestamp-match`, confidence `high`, and record `deltaMs: Δ`. Observed worst-case delta in real sessions is 4 ms, so 10 ms is a safety margin, not a target.

**Tier 3 — Orphan fallback (`orphan`).**
Only reached when tiers 1 and 2 both failed for every candidate Agent call. Attach the `subagent-root` directly to `session-root` with method `orphan`, confidence `none`, and a `reason` string explaining why (e.g. `"no tool_result match and no timestamp within 10ms"`). Emit an `orphan-subagent` warning. The subagent stays visible in the tree — we never drop data, we just can't place it precisely.

**Tier-skipping is not allowed.** The algorithm walks tiers 1 → 2 → 3 for each subagent, never backwards, never skipping. A subagent that would match both tier 1 and tier 2 records only tier 1 — tier 2 is not even checked. This keeps the recorded `SubagentLinkage` deterministic: the method field is always the highest tier that succeeded.

### `SubagentLinkage` — how the parent-subagent edge was established

Implements the three-tier priority above. The `method` field names the tier that won.

```typescript
export type SubagentLinkage =
  // Tier 1 — strong link (preferred)
  | { method: 'agentid-in-result'; confidence: 'high' }
  // Tier 2 — timestamp fallback (only when tier 1 returned no match)
  | { method: 'timestamp-match'; confidence: 'high'; deltaMs: number }
  // Tier 3 — orphan fallback (only when tiers 1 and 2 both failed)
  | { method: 'orphan'; confidence: 'none'; reason: string };
```

### Warnings collected during build

```typescript
export interface SessionTreeWarning {
  kind:
    | 'orphan-assistant-turn'     // parentUuid doesn't match any known node
    | 'orphan-tool-call'          // tool_use.id doesn't match any assistant turn in scope
    | 'orphan-subagent'            // no parent Agent call matched
    | 'subagent-parse-failed'     // parseSessionFile returned null for a subagent file
    | 'nested-subagent-skipped';  // see Open Questions
  detail: string;
}
```

Warnings are **non-fatal**. The tree always builds; warnings surface problems in the data or gaps in the algorithm without blocking.

## Subagent discovery

A new function in a new file.

```typescript
// server/scanner/subagent-discovery.ts

export interface DiscoveredSubagent {
  agentId: string;
  filePath: string;           // absolute path to agent-<id>.jsonl
  metaFilePath: string;       // absolute path to agent-<id>.meta.json (may not exist)
  meta: { agentType: string; description: string } | null;  // null if meta.json missing
}

export function discoverSubagents(sessionFilePath: string): DiscoveredSubagent[];
```

**Algorithm:**

1. Derive the subagents directory: `<dirname(sessionFilePath)>/<basename(sessionFilePath, ".jsonl")>/subagents/`.
2. If that directory does not exist, return `[]`. Not an error — most sessions have no subagents.
3. `readdir` the directory. For each file matching `agent-<hex>.jsonl`:
   - Extract `agentId` from the filename via regex `/^agent-([a-z0-9]+)\.jsonl$/`.
   - Look for a sibling `.meta.json`. If present, parse it. If missing or malformed, set `meta: null` and emit a warning at tree-build time.
   - Construct the record.
4. Return the array sorted by filename (stable order).

**Does not parse the subagent files.** Discovery is cheap; parsing is delegated to the pipeline below.

## Parser pipeline changes

Three files change, one is added. `session-parser.ts` gets one small additive change (see "Tool linkage fix" below) but its contract — "parse one JSONL file into one `ParsedSession`" — stays stable. Every existing field on `ParsedSession` keeps its exact current shape.

### New: `server/scanner/session-tree-builder.ts`

```typescript
export function buildSessionTree(
  parent: ParsedSession,
  subagents: Array<{ parsed: ParsedSession; meta: DiscoveredSubagent }>
): SessionTree;
```

**Algorithm:**

1. Construct the `session-root` node from `parent.meta`.
2. **Build the parent's in-session tree** in two passes over `parent.assistantMessages` and `parent.userMessages` merged and sorted by timestamp:
   - **Pass 1 (first attempt):** For each message, resolve `parentUuid` → parent node via the id map (lookup by `asst:<uuid>` or `user:<uuid>`). If the lookup succeeds, attach as a child. If it fails, push the message into a `pending` list and continue.
   - **Pass 2 (retry):** Walk `pending` and try the lookup again. The first pass may have inserted the needed parent later in timestamp order.
   - **Fallback:** Messages still unresolved after pass 2 attach directly to `session-root` and emit `orphan-assistant-turn` or `orphan-user-turn` warnings. Two passes are sufficient; we never loop.
3. **Attach tool calls.** Walk `parent.toolTimeline`. For each `ToolExecution`, find the assistant turn that issued it by matching on `callId` → `AssistantRecord.toolCalls[].id`. Attach the `tool-call` node as a child of that assistant-turn. If no match, attach to session-root and emit an `orphan-tool-call` warning. **This pass requires `ToolExecution` to carry its parent assistant uuid — see "Tool linkage fix" below.**
4. **Attach subagents.** For each subagent in the input array, resolve its parent using the three-tier priority defined in "Linkage resolution — three-tier priority" above. The tiers are walked strictly in order; the first match wins.
   - **Tier 1 (strong link):** Scan every `Agent` tool-call in `parent.toolTimeline`. For each, look up the matching `tool_result` in `parent.userMessages` by `callId`. If the result text contains the subagent's `agentId`, attach the subagent-root as a child of that `tool-call` node with `linkage.method === 'agentid-in-result'`. Stop walking tiers for this subagent.
   - **Tier 2 (timestamp fallback):** Only if tier 1 found no match. Compute `Δ = |agentCall.timestamp − subagent.firstRecordTs|` for every `Agent` call and pick the minimum. If `Δ ≤ 10 ms`, attach under that tool-call with `linkage.method === 'timestamp-match'` and `deltaMs: Δ`. Stop walking tiers.
   - **Tier 3 (orphan fallback):** Only reached when tiers 1 and 2 both failed. Attach the subagent-root directly to `session-root` with `linkage.method === 'orphan'` and a `reason` string. Emit an `orphan-subagent` warning.
   - Once attached (regardless of tier), build the subagent's own in-tree structure by recursively calling steps 2–3 of this algorithm on its `ParsedSession`. Step 1 is skipped (the subagent-root already exists). Discovery of nested subagents is deferred — see "Nested subagents" in Open Questions.
5. **Compute `selfCost` and `rollupCost`** for every node. Self-cost is per-kind:
   - `assistant-turn`: derived from `AssistantRecord.usage` using the existing cost math in `session-analytics.ts`.
   - `user-turn`, `tool-call`, `subagent-root`, `session-root`: zero self-cost.
6. Rollup is a post-order traversal: `rollupCost = selfCost + sum(children.rollupCost)`.
7. Populate `SessionTree.totals` from the session-root's rollup.
8. Return the constructed `SessionTree`.

**Complexity:** O(n) in the number of records across parent + subagents.

### Modified: `server/scanner/session-cache.ts`

The cache currently stores one `ParsedSession` per session. It grows to store a combined entry `{ parsed: ParsedSession; tree: SessionTree }` per session.

**Backward compatibility:** the existing public methods (`getById`, `getByPath`, `getOrParse`, `getAll`) keep their current signatures and still return `ParsedSession` — they read the `parsed` field out of the combined entry. No existing consumer changes.

**New public methods:**

```typescript
getTreeById(sessionId: string): SessionTree | null;
getTreeByPath(filePath: string): SessionTree | null;
```

Cache invalidation still keys on the parent JSONL's file size; when the parent invalidates, its tree invalidates too, and subagent files are re-parsed on the next miss. Subagent file mtimes are not tracked independently — a parent-level cache miss is the only trigger for rebuilding the tree.

### Modified: `server/scanner/session-scanner.ts`

During a full scan, after a session's main JSONL is parsed, the scanner calls `discoverSubagents()` + `parseSessionFile()` per subagent + `buildSessionTree()` and stores the result in the cache. Subagent parsing is eager at scan time because the cost is small (typical subagent JSONL is 50–250 KB) and doing it lazily would split the cache lifecycle in a confusing way.

### Modified: `server/routes/sessions.ts`

One addition. The existing `GET /api/sessions/:id` endpoint response shape gains an optional `tree` field with three distinct states:

```typescript
{
  // ... existing fields unchanged ...
  tree?: SessionTree | null;
}
```

- **Key absent** — the client did not pass `?include=tree`. Default behavior, byte-identical to current response.
- **`tree: null`** — the client passed `?include=tree` but the parser could not produce a tree (e.g. session file missing, parse failed entirely).
- **`tree: SessionTree`** — the client passed `?include=tree` and the tree was built successfully. `tree.warnings` may still be non-empty; that is not a failure.

This keeps existing clients working unchanged and lets the new UI opt in explicitly.

No other routes change in this spec. (Costs tab, analytics, graph, etc. will adopt the tree in a later milestone once the data is stable.)

## Tool linkage fix (required for tree build)

`ToolExecution` today has no pointer back to the assistant turn that issued it. The tree builder needs this link. The fix is a small additive change to `session-parser.ts` and the `ToolExecution` type:

```typescript
// shared/session-types.ts
export interface ToolExecution {
  // ...existing fields unchanged...
  /** uuid of the AssistantRecord whose content contained this tool_use. */
  issuedByAssistantUuid: string;
}
```

The parser already iterates assistant messages and matches tool_use to tool_result by `id`. Adding the issuing assistant's uuid to each `ToolExecution` is a one-line addition in the existing loop. Zero risk to existing consumers — the field is additive; nothing reads the list destructuring all fields.

This change lives in this spec (not a separate one) because the tree build depends on it.

## Cost rollup semantics

- **selfCost** on an `assistant-turn` is the cost of that single assistant message — input tokens, output tokens, cache read, cache creation — priced using the existing `session-analytics.ts` model table.
- **selfCost** on every other kind is zero. A `tool-call` does not have a token cost; it has a duration. A `subagent-root` does not have its own cost; its children's assistant turns do.
- **rollupCost** is always `selfCost + Σ(children.rollupCost)`.
- **`SessionTree.totals`** equals `root.rollupCost` plus counts that are summed separately (assistantTurns, toolCalls, etc.).

Consumers can therefore display:
- "This session spent $0.40 directly and $2.30 across 5 subagents" → session-root.selfCost vs. session-root.rollupCost − selfCost.
- "The most expensive subagent" → iterate `subagentsByAgentId.values()` sorted by `rollupCost.costUsd`.
- "Cost of a specific tool chain" → walk a subtree from any node.

## Edge cases and how the design handles them

| Case | Behavior |
|---|---|
| Session has no subagents | `discoverSubagents()` returns `[]`. Tree builds normally with only in-session children. |
| Subagents directory exists but is empty | Same as above. |
| `.meta.json` is missing for a subagent | `meta: null`. The subagent-root node carries `agentType: 'unknown'`, `description: ''`. No warning — this is recoverable. |
| `.meta.json` is malformed JSON | Same as missing. Emit a warning at tree-build time so it surfaces in diagnostics without breaking. |
| `parseSessionFile` returns `null` for a subagent file | Subagent is skipped. Emit `subagent-parse-failed` warning. The parent tree still builds. |
| Subagent JSONL exists but no matching parent Agent call | `orphan-subagent` warning. Attach subagent-root to session-root with linkage method `orphan`. It is still visible, just not connected to a specific tool call. |
| Parent has 5 Agent calls but only 3 subagent files | The 2 unmatched Agent calls become ordinary `tool-call` nodes with no subagent child. No warning — this is normal (Agent tool sometimes fails before writing a file). |
| `parentUuid` chain has a gap | Out-of-order pass + fallback attach to session-root + `orphan-assistant-turn` warning. Tree still builds; it just has a few stray branches. |
| Session is still being written (JSONL appended to during scan) | Parser tolerates truncated final lines already. The tree built from a partial parse is a partial tree. Next scan rebuilds it. No special handling needed. |
| Subagent is still running (its JSONL is growing) | Same — partial subagent tree, rebuilt on next scan. |
| Two subagents dispatched within 1 ms of each other | Strong link (`agentid-in-result`) resolves both unambiguously. Fallback timestamp-match would be ambiguous here; if we fall through to it, emit `orphan-subagent` on both rather than guessing. |
| Nested subagents (subagent spawns subagent) | See Open Questions. |

## What this spec does NOT include

- **No UI changes.** Rendering the tree in the sessions page, the graph, or the costs tab is out of scope for this spec. A follow-up design will use the tree once it's available.
- **No removal of existing flat arrays.** `assistantMessages`, `userMessages`, `toolTimeline`, and `conversationTree` all stay. The tree is additive.
- **No changes to cost-analytics routes.** Tree-aware cost rollup is a follow-up. This spec only makes the data available.
- **No changes to the entity graph.** Wiring session/subagent/tool nodes into the graph is a follow-up milestone.
- **No changes to auto-linking.** The enricher keeps reading flat arrays. Tree-aware enrichment is a follow-up.
- **No deletion of `conversationTree` field or `ConversationNode` type.** They stay for test compatibility, marked as `@deprecated` in JSDoc.

## Non-goals

- Optimizing parse or scan performance below current baseline.
- Supporting arbitrary record types that the scanner doesn't already understand.
- Unifying the session scanner with the board task scanner.
- Changing how the cache invalidates.

## Testing strategy

### New unit tests

- `tests/session-tree-builder.test.ts`
  - Single-session-no-subagents: builds a linear tree, no warnings.
  - Session with 1 subagent linked by `agentid-in-result`: correct parent-child edge, linkage method recorded.
  - Session with 1 subagent linked only by timestamp: correct parent-child edge, `timestamp-match` linkage, deltaMs populated.
  - Session with 1 orphan subagent: attached to session-root, warning emitted.
  - Session with malformed `.meta.json`: subagent still attached, `meta: null`, warning.
  - Tool-call attachment: every tool-call has a correct assistant-turn parent.
  - Orphan tool-call: emits warning, attaches to session-root.
  - Orphan assistant-turn (broken parentUuid chain): emits warning, attaches to session-root.
  - Cost rollup: selfCost vs. rollupCost computed correctly across a 3-level tree.
  - `SessionTree.totals` equal `root.rollupCost` plus matching counts.

- `tests/subagent-discovery.test.ts`
  - No subagents directory: returns `[]`.
  - Empty subagents directory: returns `[]`.
  - One subagent with meta: returns 1 entry.
  - One subagent without meta: returns 1 entry with `meta: null`.
  - Malformed `.meta.json`: returns entry with `meta: null`.
  - Non-`agent-*.jsonl` files in the directory: ignored.

### Integration test

- `tests/session-tree-integration.test.ts`
  - Uses a fixture copied from a real session with 5 subagents (the `d2570b3e` one from the investigation, anonymized and size-reduced).
  - Verifies the tree has 1 root, 5 subagent-roots, each with correct children.
  - Verifies `SessionTree.totals.subagents === 5`.
  - Verifies `rollupCost.costUsd` is strictly greater than `selfCost.costUsd` (rollup includes subagents).

### Parser regression

- Existing `tests/session-parser.test.ts` must still pass unchanged. The parser's single-file contract is not modified.

### Cache regression

- Existing `tests/session-cache.test.ts` must still pass. New cache behavior (tree storage) gets its own tests:
  - Cache miss builds both `ParsedSession` and `SessionTree`.
  - Cache hit returns cached tree without re-parsing.
  - File size change invalidates both parsed session and tree.

### Route regression

- `GET /api/sessions/:id` without `?include=tree` returns byte-identical response to current behavior.
- `GET /api/sessions/:id?include=tree` returns the existing fields plus `tree`.

### Safety

- `new-user-safety.test.ts` must still pass. Spec does not introduce new hardcoded paths, PII, or user-specific strings.

## Open questions

1. **Nested subagents.** Do subagents themselves have `subagents/` subdirectories? I have not seen one in the wild, and Claude Code may or may not support it. **Current design:** recursion is structurally supported (the tree is recursive), but `discoverSubagents()` is only called once on the parent session. If a subagent JSONL references further child agents, they are discovered by a separate call and their absence currently produces no warning. If investigation shows nested subagents exist, we extend `buildSessionTree()` to recurse into `<subagent-dir>/subagents/` as well. **Proposal:** start non-recursive, emit `nested-subagent-skipped` warning if any record in a subagent JSONL has `subagent_type` in a tool_use, and fix in a follow-up once we have a real nested example to test against.

2. **Should `selfCost` on tool-call track duration-weighted cost?** Some teams price tool use separately (e.g. Bash calls that spawn long processes). **Proposal:** leave at zero for now. Cost is a token concept; revisit if a concrete use case appears.

3. **Eager vs. lazy subagent parsing on cache miss.** Current design parses all subagents eagerly on first access. For a session with many subagents this is fine (<100ms). For a session with hundreds of subagents (haven't observed yet), we may want lazy per-subagent parsing. **Proposal:** ship eager. Measure. Optimize only if a real session hits a visible pause.

4. **What to do if the same `agentId` appears twice in the subagents directory.** Should not happen — Claude Code generates random hex IDs. If it does, take the first by filename sort and emit a warning.

## Appendix A — investigation data

Tested session: `d2570b3e-f3ce-41ee-a462-89f805bb2e9f` under `-home-tron-dev-projects-agent-cc`, 470 KB, 2026-04-09.

### What `conversationTree` contained

```
total nodes: 140
counts.totalRecords: 171      (→ 31 records silently dropped, ~18%)
type breakdown: { user: 55, assistant: 74, system: 11 }
root nodes (no parentUuid): 0
orphan nodes (parentUuid points to unknown uuid): 8
sidechain nodes in tree: 0
actual subagents dispatched: 5  (none visible in tree)
fields per node: 5  (uuid, parentUuid, type, timestamp, isSidechain)
```

### What the scanner already extracts but does not link to the tree

- `assistantMessages[].model` — present ("claude-opus-4-6", etc.)
- `assistantMessages[].usage` — all 4 token types present
- `assistantMessages[].toolCalls[]` — present with name, id, filePath, command, pattern
- `userMessages[].toolResults[]` — present with toolUseId, isError, durationMs
- `toolTimeline` — 45 matched pairs, but no parent assistant uuid

### Subagent layout observed

```
/home/tron/.claude/projects/-home-tron-dev-projects-agent-cc/
  d2570b3e-f3ce-41ee-a462-89f805bb2e9f.jsonl                   ← parent
  d2570b3e-f3ce-41ee-a462-89f805bb2e9f/
    subagents/
      agent-a051f930f75288516.jsonl        (25 records, 9 Bash calls)
      agent-a051f930f75288516.meta.json    {"agentType":"Explore","description":"..."}
      agent-a143e4c1b9a41882d.jsonl
      agent-a143e4c1b9a41882d.meta.json
      agent-a1fd2e207444e5bd5.jsonl
      agent-a1fd2e207444e5bd5.meta.json
      agent-a7760384401a33a34.jsonl
      agent-a7760384401a33a34.meta.json
      agent-aa09177637601653c.jsonl
      agent-aa09177637601653c.meta.json
```

### Parent ↔ subagent timestamp alignment (observed)

| Parent Agent call | Subagent file | Parent ts | Subagent first ts | Δ |
|---|---|---|---|---|
| call #1 | agent-aa09177637601653c | 03:21:12.443 | 03:21:12.447 | 4 ms |
| call #2 | agent-a1fd2e207444e5bd5 | 03:39:51.829 | 03:39:51.833 | 4 ms |
| call #3 | agent-a7760384401a33a34 | 03:40:00.219 | 03:40:00.220 | 1 ms |
| call #4 | agent-a051f930f75288516 | 03:39:56.172 | 03:39:56.173 | 1 ms |
| call #5 | agent-a143e4c1b9a41882d | 03:40:03.732 | 03:40:03.733 | 1 ms |

All five pairs align within 4 ms. The 10 ms tolerance in the linkage algorithm is comfortably above the observed max.

### Parent-side `agentId` containment (observed)

For each subagent, grepping the parent JSONL for the `agentId` string returned exactly 1 matching line — a tool_result entry. This is the basis for the strong linkage method (`agentid-in-result`).
