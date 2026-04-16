# Chat–Scanner Unification

**Date:** 2026-04-16
**Status:** Draft

## Problem

The chat feature was built as a parallel system instead of extending the existing scanner pipeline. It introduced its own SQLite database, its own data model (`InteractionEvent`), its own identifier space (`conversationId`), and an ingester that copies scanner data into its world. The result is two disconnected systems writing to the same database but never reading each other's data.

The scanner is the core of Agent CC. Chat should be a feature within it, not a competing architecture.

## Design Principle

**Chat sessions are CLI sessions.** When you talk to Claude through Agent CC's chat, that's a CLI session. It should produce JSONL like any other session, flow through the scanner like any other session, and appear in analytics like any other session.

## What Changes

### 1. Chat produces JSONL instead of SQLite events

Today, `runClaudeStreaming()` passes `--no-session-persistence` to the CLI, which prevents JSONL from being written. Then the chat route manually persists each streaming chunk to SQLite via `insertEvent()`.

**Change:** Remove `--no-session-persistence`. The CLI writes JSONL to `~/.claude/projects/` like any normal session. The scanner picks it up. No manual event persistence needed.

Real-time streaming (seeing Claude's response as it types) stays exactly as-is — in-memory SSE from stdout chunks to the browser. That's ephemeral and doesn't need a database.

**Files affected:**
- `server/scanner/claude-runner.ts` — remove `--no-session-persistence` from `buildClaudeArgs()` and `runClaudeStreaming()`
- `server/routes/chat.ts` — remove all `safePersist()` / `insertEvent()` calls from the prompt handler

### 2. Chat-originated sessions get tagged

The scanner needs to know which sessions started from Agent CC's chat vs. the terminal. This is metadata, not a separate data model.

**Approach:** When Agent CC spawns a CLI session, capture the session ID from the CLI's `system/init` stream-json envelope (it contains the session ID). Store a lightweight mapping in the existing JSON config (`agent-cc.json`):

```ts
// in db.ts schema
chatSessions: Record<string, {  // keyed by sessionId
  tabId: string;                 // which chat tab started it
  startedAt: string;             // ISO timestamp
}>
```

The scanner already reads `agent-cc.json` for pins, notes, and entity metadata. This is the same pattern — app-level annotations on scanner data.

### 3. Chat history reads from the scanner

Today, `GET /api/chat/conversations/:id/events` queries SQLite. After unification, chat history is just scanner session data.

**Change:** When a chat tab loads its history, it fetches from the scanner's existing session endpoints:
- Session messages: `GET /api/sessions/:id/messages` (already exists)
- Session metadata: `GET /api/sessions/:id` (already exists)

The chat tab's `conversationId` becomes the `sessionId`. One identifier space.

**Files affected:**
- `client/src/hooks/use-chat-history.ts` — query scanner session endpoints instead of chat event endpoints
- `client/src/stores/chat-store.ts` — adapt to scanner message format
- Chat tab state already lives in JSON config (`agent-cc.json`) — no change needed

### 4. Scanner backend returns to JSONL parsing

The store backend (`backend-store.ts`) currently reads all session data from SQLite via `listConversationRollups()`. With SQLite removed, the scanner backend needs to read JSONL directly again.

The JSONL parsing infrastructure is fully intact:
- `session-scanner.ts` — discovers and parses JSONL files
- `session-parser.ts` — line-by-line JSONL parsing
- `session-tree-builder.ts` — hierarchical session trees
- `session-cache.ts` — file-size-keyed parse cache
- `session-analytics.ts` — cost/health/heatmap analytics

The old legacy backend (`backend-legacy.ts`) was deleted when the store backend took over. A new backend needs to be written that implements `IScannerBackend` by reading from the existing JSONL parsing + cache layer.

**Files affected:**
- `server/scanner/backend-store.ts` — delete (depends entirely on SQLite)
- `server/scanner/backend.ts` — new implementation backed by JSONL parsers + cache
- `server/scanner/event-reductions.ts` — delete (SQLite-specific reduction functions)

### 5. Delete the SQLite layer

Everything that exists solely for the SQLite event store gets removed:

**Delete entirely:**
- `server/interactions-db.ts` — SQLite database init/migrations
- `server/interactions-repo.ts` — data access layer
- `server/scanner/ingester.ts` — JSONL→SQLite pipeline
- `server/scanner/backend-store.ts` — SQLite-backed scanner backend
- `server/scanner/event-reductions.ts` — SQLite event reducers
- `server/scanner/jsonl-to-event.ts` — JSONL→InteractionEvent mapper
- `server/chat-import.ts` — session import (no longer needed; scanner sessions are already visible)
- `tests/interactions-db.test.ts`
- `tests/interactions-repo.test.ts`
- `tests/ingester.test.ts`
- `tests/unified-capture-e2e.test.ts`
- `tests/chat-import.test.ts`
- `tests/chat-import-e2e.test.ts`

**Dependencies to remove from package.json:**
- `better-sqlite3`
- `@types/better-sqlite3`

**Types to remove from shared/types.ts:**
- `InteractionEvent`
- `InteractionSource`
- `InteractionRole`
- `InteractionContent` (and subtypes: `TextContent`, `ToolCallContent`, `ToolResultContent`, `ThinkingContent`, `SystemContent`)
- `InteractionCost`

### 6. Simplify chat routes

The chat route file (`server/routes/chat.ts`) currently does three things: prompt handling + SSE streaming, event persistence, and conversation listing. After unification:

- **Prompt handling + SSE streaming** — stays, this is the live chat experience
- **Event persistence** — removed, CLI writes JSONL
- **Conversation listing** — removed, scanner provides session list; chat tabs in JSON config identify which sessions are chat-originated

**What remains in chat routes:**
- `POST /api/chat/prompt` — spawn CLI, stream SSE to browser (no persistence calls)
- `GET /api/chat/stream/:conversationId` — SSE subscription (unchanged)
- `DELETE /api/chat/stream/:conversationId` — abort (unchanged)

**Routes to remove:**
- `GET /api/chat/conversations` — replaced by scanner session list + chat tab metadata
- `GET /api/chat/conversations/all` — same
- `GET /api/chat/conversations/:id/events` — replaced by scanner session messages
- `POST /api/chat/import/:conversationId` — no longer needed

### 7. Hook bridge simplification

The hook bridge (`server/hooks-bridge.ts`) currently persists hook events to SQLite. With SQLite gone, hook events become ephemeral — broadcast over SSE to the active chat tab and not persisted.

This is fine. Hook events are transient notifications ("a tool was used"). They don't need to survive a page reload. If persistence is wanted later, they can be appended to the session's scanner data.

**Files affected:**
- `server/hooks-bridge.ts` — remove `insertEvent()` call, keep SSE broadcast
- `server/routes/hook-bridge.ts` — no change (HTTP surface stays)

### 8. Chat workflow events

`server/routes/chat-workflows.ts` currently persists workflow events to SQLite. Same treatment as hooks — broadcast over SSE, don't persist to SQLite.

**Files affected:**
- `server/routes/chat-workflows.ts` — remove `insertEvent()` calls, keep SSE broadcast

## What Stays the Same

- **Real-time streaming UX** — SSE from CLI stdout to browser, in-memory, no database involved
- **Chat tab management** — already in JSON config, not affected
- **Scanner JSONL parsing** — fully intact, becomes the sole backend again
- **Scanner analytics** — cost, health, heatmap, weekly digest all work from parsed JSONL
- **Kanban board** — reads workflow-framework task files, unrelated to this change
- **All existing scanner routes** — continue to work, backed by JSONL instead of SQLite

## What Gets Better

- **Chat sessions appear in analytics automatically.** Costs, tool usage, file heatmaps — all there, no extra work.
- **One identifier space.** Session ID is session ID, everywhere.
- **No stale data.** Scanner reads JSONL directly instead of a SQLite copy that's always behind.
- **Simpler codebase.** ~6 server files deleted, ~6 test files deleted, one npm dependency removed.
- **No ingester background process.** Less resource usage, less complexity.

## Migration

Users who have existing chat conversations in SQLite will lose that history. This is acceptable — the chat feature is new, the data volume is small, and the conversations will still exist as JSONL files (once we remove `--no-session-persistence`, future sessions are preserved; past chat sessions used the flag and have no JSONL).

## Open Questions

1. **Session ID capture.** The CLI's `stream-json` output includes a `system/init` envelope at the start — need to confirm it contains the session ID so we can map chat tabs to scanner sessions.
2. **Conversation sidebar.** Currently groups by `InteractionSource`. After unification, it should show chat-originated sessions (from the `chatSessions` mapping in JSON config). Design TBD.
3. **Scanner refresh timing.** After a chat session ends, how quickly does the scanner pick up the new JSONL? May need a targeted rescan trigger rather than waiting for the next poll cycle.
