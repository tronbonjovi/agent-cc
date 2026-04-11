# Scanner Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented session scanner with a single-pass JSONL parser that extracts all 8 record types into typed structures, cached for all downstream consumers.

**Architecture:** New `session-parser.ts` reads each JSONL file once, producing a `ParsedSession` object. New `session-cache.ts` stores parsed results with 5-min TTL. Existing scanners migrate incrementally to consume the cache instead of re-reading raw files.

**Tech Stack:** TypeScript, Vitest, Node.js fs

**Spec:** `docs/superpowers/specs/2026-04-11-scanner-deepening-design.md`

---

### Task 1: Define ParsedSession types

**Files:**
- Create: `shared/session-types.ts`
- Test: `tests/session-parser.test.ts`

- [ ] **Step 1: Create the types file**

Create `shared/session-types.ts` with all types from the spec:

```typescript
// shared/session-types.ts
// Comprehensive typed output from the JSONL session parser.

export interface ParsedSession {
  meta: SessionMeta;
  assistantMessages: AssistantRecord[];
  userMessages: UserRecord[];
  systemEvents: {
    turnDurations: TurnDuration[];
    hookSummaries: HookSummary[];
    localCommands: LocalCommand[];
    bridgeEvents: BridgeEvent[];
  };
  toolTimeline: ToolExecution[];
  fileSnapshots: FileSnapshot[];
  lifecycle: LifecycleEvent[];
  conversationTree: ConversationNode[];
  counts: SessionCounts;
}

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

export interface ToolExecution {
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

export interface FileSnapshot {
  messageId: string;
  isUpdate: boolean;
  timestamp: string;
}

export interface LifecycleEvent {
  timestamp: string;
  type: "permission-change" | "queue-enqueue" | "queue-dequeue" | "queue-remove" | "tools-changed" | "last-prompt";
  detail: string;
}

export interface ConversationNode {
  uuid: string;
  parentUuid: string;
  type: "user" | "assistant" | "system";
  timestamp: string;
  isSidechain: boolean;
}
```

- [ ] **Step 2: Write a smoke test that imports the types**

Create `tests/session-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ParsedSession, SessionMeta, AssistantRecord } from "../shared/session-types";

describe("session-types", () => {
  it("ParsedSession type is importable and structurally sound", () => {
    const stub: ParsedSession = {
      meta: {
        sessionId: "abc-123",
        slug: "test-slug",
        firstMessage: "hello",
        firstTs: "2026-01-01T00:00:00Z",
        lastTs: "2026-01-01T01:00:00Z",
        sizeBytes: 1024,
        filePath: "/tmp/test.jsonl",
        projectKey: "-tmp-test",
        cwd: "/tmp",
        version: "2.1.0",
        gitBranch: "main",
        entrypoint: "cli",
      },
      assistantMessages: [],
      userMessages: [],
      systemEvents: {
        turnDurations: [],
        hookSummaries: [],
        localCommands: [],
        bridgeEvents: [],
      },
      toolTimeline: [],
      fileSnapshots: [],
      lifecycle: [],
      conversationTree: [],
      counts: {
        totalRecords: 0,
        assistantMessages: 0,
        userMessages: 0,
        systemEvents: 0,
        toolCalls: 0,
        toolErrors: 0,
        fileSnapshots: 0,
        sidechainMessages: 0,
      },
    };
    expect(stub.meta.sessionId).toBe("abc-123");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/session-parser.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/session-types.ts tests/session-parser.test.ts
git commit -m "feat: ParsedSession types for comprehensive JSONL extraction"
```

---

### Task 2: Build the JSONL parser — metadata and assistant records

**Files:**
- Create: `server/scanner/session-parser.ts`
- Modify: `tests/session-parser.test.ts`

- [ ] **Step 1: Write failing tests for metadata extraction**

Add to `tests/session-parser.test.ts`:

```typescript
import fs from "fs";
import path from "path";
import os from "os";
import { parseSessionFile } from "../server/scanner/session-parser";

// Helper: build a JSONL file from record objects
function buildJSONL(records: Record<string, unknown>[]): string {
  return records.map(r => JSON.stringify(r)).join("\n") + "\n";
}

// Temp dir for test JSONL files
const tmpDir = path.join(os.tmpdir(), "cc-parser-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function writeSession(name: string, records: Record<string, unknown>[]): string {
  const fp = path.join(tmpDir, name + ".jsonl");
  fs.writeFileSync(fp, buildJSONL(records));
  return fp;
}

describe("parseSessionFile", () => {
  describe("metadata extraction", () => {
    it("extracts slug, cwd, version, gitBranch, entrypoint from first records", () => {
      const fp = writeSession("meta-test", [
        { type: "permission-mode", permissionMode: "default", sessionId: "sess-1", timestamp: "2026-01-01T10:00:00Z" },
        { type: "user", timestamp: "2026-01-01T10:00:01Z", sessionId: "sess-1", cwd: "/home/test/project", version: "2.1.92", gitBranch: "main", entrypoint: "cli", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Hello world" } },
        { type: "assistant", timestamp: "2026-01-01T10:00:05Z", sessionId: "sess-1", slug: "happy-test", cwd: "/home/test/project", version: "2.1.92", gitBranch: "main", entrypoint: "cli", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "req-1", message: { id: "msg-1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "end_turn", stop_details: {}, stop_sequence: null, content: [{ type: "text", text: "Hi there" }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, service_tier: "default", inference_geo: "us", speed: "standard", server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } } } },
      ]);

      const parsed = parseSessionFile(fp, "-home-test-project");
      expect(parsed).not.toBeNull();
      expect(parsed!.meta.slug).toBe("happy-test");
      expect(parsed!.meta.cwd).toBe("/home/test/project");
      expect(parsed!.meta.version).toBe("2.1.92");
      expect(parsed!.meta.gitBranch).toBe("main");
      expect(parsed!.meta.entrypoint).toBe("cli");
      expect(parsed!.meta.firstTs).toBe("2026-01-01T10:00:00Z");
      expect(parsed!.meta.lastTs).toBe("2026-01-01T10:00:05Z");
      expect(parsed!.meta.firstMessage).toBe("Hello world");
      expect(parsed!.meta.projectKey).toBe("-home-test-project");
    });

    it("returns null for empty file", () => {
      const fp = path.join(tmpDir, "empty.jsonl");
      fs.writeFileSync(fp, "");
      expect(parseSessionFile(fp, "key")).toBeNull();
    });

    it("handles file with only malformed JSON lines", () => {
      const fp = path.join(tmpDir, "bad.jsonl");
      fs.writeFileSync(fp, "not json\nalso not json\n");
      const parsed = parseSessionFile(fp, "key");
      // Should return a ParsedSession with zero records, not null
      // (file exists and was readable, just had no valid records)
      expect(parsed).not.toBeNull();
      expect(parsed!.counts.totalRecords).toBe(0);
    });
  });

  describe("assistant record extraction", () => {
    it("extracts model, stopReason, usage, toolCalls, hasThinking", () => {
      const fp = writeSession("assistant-test", [
        { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Read a file" } },
        { type: "assistant", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "req-1", message: { id: "msg-1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [
          { type: "thinking", thinking: "Let me read the file" },
          { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/foo.ts" } },
        ], usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 50, cache_creation_input_tokens: 10, service_tier: "default", inference_geo: "us", speed: "standard", server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } } },
      ]);

      const parsed = parseSessionFile(fp, "key");
      expect(parsed!.assistantMessages).toHaveLength(1);

      const msg = parsed!.assistantMessages[0];
      expect(msg.model).toBe("claude-sonnet-4-20250514");
      expect(msg.stopReason).toBe("tool_use");
      expect(msg.hasThinking).toBe(true);
      expect(msg.requestId).toBe("req-1");
      expect(msg.usage.inputTokens).toBe(200);
      expect(msg.usage.outputTokens).toBe(80);
      expect(msg.usage.cacheReadTokens).toBe(50);
      expect(msg.usage.cacheCreationTokens).toBe(10);
      expect(msg.usage.serverToolUse.webSearchRequests).toBe(1);

      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls[0].name).toBe("Read");
      expect(msg.toolCalls[0].filePath).toBe("/tmp/foo.ts");
    });

    it("extracts textPreview from text content blocks", () => {
      const fp = writeSession("text-preview", [
        { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Explain this" } },
        { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "req-1", message: { id: "msg-1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "end_turn", stop_details: {}, stop_sequence: null, content: [{ type: "text", text: "Here is a detailed explanation of the code." }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
      ]);

      const parsed = parseSessionFile(fp, "key");
      expect(parsed!.assistantMessages[0].textPreview).toBe("Here is a detailed explanation of the code.");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/session-parser.test.ts --reporter=dot`
Expected: FAIL — `parseSessionFile` does not exist yet

- [ ] **Step 3: Implement the parser — metadata + assistant extraction**

Create `server/scanner/session-parser.ts`:

```typescript
import fs from "fs";
import { extractText } from "./utils";
import type {
  ParsedSession, SessionMeta, AssistantRecord, UserRecord,
  TokenUsage, ToolCall, ToolResult, ToolExecution,
  TurnDuration, HookSummary, LocalCommand, BridgeEvent,
  FileSnapshot, LifecycleEvent, ConversationNode, SessionCounts,
} from "@shared/session-types";

/** Parse a single JSONL file into a comprehensive ParsedSession.
 *  Reads the file once, extracts all record types. */
export function parseSessionFile(filePath: string, projectKey: string): ParsedSession | null {
  let content: string;
  let sizeBytes: number;
  try {
    const stat = fs.statSync(filePath);
    sizeBytes = stat.size;
    if (sizeBytes === 0) return null;
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  // State collectors
  const assistantMessages: AssistantRecord[] = [];
  const userMessages: UserRecord[] = [];
  const turnDurations: TurnDuration[] = [];
  const hookSummaries: HookSummary[] = [];
  const localCommands: LocalCommand[] = [];
  const bridgeEvents: BridgeEvent[] = [];
  const toolTimeline: ToolExecution[] = [];
  const fileSnapshots: FileSnapshot[] = [];
  const lifecycle: LifecycleEvent[] = [];
  const conversationTree: ConversationNode[] = [];

  // Metadata — captured from first records that have each field
  let slug = "";
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let firstMessage = "";
  let cwd = "";
  let version = "";
  let gitBranch = "";
  let entrypoint = "";

  // Counts
  let totalRecords = 0;
  let toolErrors = 0;
  let sidechainMessages = 0;

  // Tool call matching: pending tool_use calls waiting for results
  const pendingToolCalls = new Map<string, { call: ToolCall; timestamp: string; isSidechain: boolean }>();

  // Parse line by line
  let pos = 0;
  while (pos < content.length) {
    const nextNewline = content.indexOf("\n", pos);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline;
    const trimmed = content.slice(pos, lineEnd).trim();
    pos = lineEnd + 1;
    if (!trimmed) continue;

    let record: any;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    totalRecords++;
    const rtype: string = record.type || "";
    const ts: string = record.timestamp || "";

    // Track first/last timestamp
    if (ts) {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }

    // Capture metadata from first record that has each field
    if (!slug && record.slug) slug = record.slug;
    if (!cwd && record.cwd) cwd = record.cwd;
    if (!version && record.version) version = record.version;
    if (!gitBranch && record.gitBranch) gitBranch = record.gitBranch;
    if (!entrypoint && record.entrypoint) entrypoint = record.entrypoint;

    // Track sidechains
    if (record.isSidechain) sidechainMessages++;

    // Build conversation tree node
    if (record.uuid && (rtype === "user" || rtype === "assistant" || rtype === "system")) {
      conversationTree.push({
        uuid: record.uuid,
        parentUuid: record.parentUuid || "",
        type: rtype as "user" | "assistant" | "system",
        timestamp: ts,
        isSidechain: !!record.isSidechain,
      });
    }

    // === Record type dispatch ===

    if (rtype === "assistant") {
      const msg = record.message;
      if (!msg || typeof msg !== "object") continue;

      const usage = msg.usage || {};
      const msgContent = Array.isArray(msg.content) ? msg.content : [];

      // Extract tool calls
      const toolCalls: ToolCall[] = [];
      let hasThinking = false;
      let textPreview = "";

      for (const block of msgContent) {
        if (block == null || typeof block !== "object") continue;
        if (block.type === "thinking") {
          hasThinking = true;
        } else if (block.type === "text" && typeof block.text === "string") {
          if (!textPreview) textPreview = block.text.replace(/\n/g, " ").slice(0, 300);
        } else if (block.type === "tool_use") {
          const input = block.input as Record<string, unknown> | undefined;
          const tc: ToolCall = {
            id: block.id || "",
            name: block.name || "",
            filePath: (input?.file_path || input?.path || null) as string | null,
            command: (input?.command || null) as string | null,
            pattern: (input?.pattern || null) as string | null,
          };
          toolCalls.push(tc);
          // Register as pending for matching
          pendingToolCalls.set(tc.id, { call: tc, timestamp: ts, isSidechain: !!record.isSidechain });
        }
      }

      const stu = usage.server_tool_use || {};
      const tokenUsage: TokenUsage = {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        serviceTier: usage.service_tier || "",
        inferenceGeo: usage.inference_geo || "",
        speed: usage.speed || "",
        serverToolUse: {
          webSearchRequests: stu.web_search_requests || 0,
          webFetchRequests: stu.web_fetch_requests || 0,
        },
      };

      assistantMessages.push({
        uuid: record.uuid || "",
        parentUuid: record.parentUuid || "",
        timestamp: ts,
        requestId: record.requestId || "",
        isSidechain: !!record.isSidechain,
        model: msg.model || "",
        stopReason: msg.stop_reason || "",
        usage: tokenUsage,
        toolCalls,
        hasThinking,
        textPreview,
      });

    } else if (rtype === "user") {
      const msg = record.message;
      const msgContent = (msg && typeof msg === "object" && Array.isArray(msg.content)) ? msg.content : [];

      // First meaningful user message becomes firstMessage
      if (!firstMessage && msg && typeof msg === "object") {
        const text = extractText(msg.content || "");
        if (text && !text.startsWith("<local-command") && !text.startsWith("<command-name") && !text.includes("[Request interrupted")) {
          firstMessage = text.replace(/^---\n[\s\S]*?\n---\n*/, "").replace(/\n/g, " ").trim();
        }
      }

      // Extract tool results
      const toolResults: ToolResult[] = [];
      for (const block of msgContent) {
        if (block == null || typeof block !== "object") continue;
        if (block.type === "tool_result") {
          const isError = !!block.is_error;
          if (isError) toolErrors++;
          toolResults.push({
            toolUseId: block.tool_use_id || "",
            isError,
            durationMs: null,
            success: null,
          });
        }
      }

      // Extract toolUseResult metadata (record-level, separate from content blocks)
      const tur = record.toolUseResult;
      if (tur && typeof tur === "object") {
        // Attach durationMs/success to the first tool result if present
        // (toolUseResult is one-per-record, corresponding to the tool_result in this message)
        if (toolResults.length > 0) {
          if (typeof tur.durationMs === "number") toolResults[0].durationMs = tur.durationMs;
          if (typeof tur.success === "boolean") toolResults[0].success = tur.success;
        }
      }

      // Match tool results back to pending tool calls → build ToolExecution timeline
      for (const tr of toolResults) {
        const pending = pendingToolCalls.get(tr.toolUseId);
        if (pending) {
          toolTimeline.push({
            callId: tr.toolUseId,
            name: pending.call.name,
            filePath: pending.call.filePath,
            command: pending.call.command,
            pattern: pending.call.pattern,
            timestamp: pending.timestamp,
            resultTimestamp: ts,
            durationMs: tr.durationMs,
            isError: tr.isError,
            isSidechain: pending.isSidechain,
          });
          pendingToolCalls.delete(tr.toolUseId);
        }
      }

      // User text preview
      let textPreview = "";
      if (msg && typeof msg === "object") {
        const text = extractText(msg.content || "");
        if (text) {
          textPreview = text
            .replace(/<(?:system-reminder|command-name|command-message)>[\s\S]*?<\/(?:system-reminder|command-name|command-message)>/g, "")
            .replace(/\n/g, " ")
            .trim()
            .slice(0, 300);
        }
      }

      userMessages.push({
        uuid: record.uuid || "",
        parentUuid: record.parentUuid || "",
        timestamp: ts,
        isSidechain: !!record.isSidechain,
        isMeta: !!record.isMeta,
        permissionMode: record.permissionMode || null,
        toolResults,
        textPreview,
      });

    } else if (rtype === "system") {
      const subtype = record.subtype || "";

      if (subtype === "turn_duration") {
        turnDurations.push({
          timestamp: ts,
          durationMs: record.durationMs || 0,
          messageCount: record.messageCount || 0,
          parentUuid: record.parentUuid || "",
        });
      } else if (subtype === "stop_hook_summary") {
        const infos = Array.isArray(record.hookInfos) ? record.hookInfos : [];
        hookSummaries.push({
          timestamp: ts,
          hookCount: record.hookCount || 0,
          hooks: infos.map((h: any) => ({
            command: h.command || "",
            durationMs: h.durationMs || 0,
          })),
          errors: Array.isArray(record.hookErrors) ? record.hookErrors : [],
          preventedContinuation: !!record.preventedContinuation,
          stopReason: record.stopReason || "",
        });
      } else if (subtype === "local_command") {
        localCommands.push({
          timestamp: ts,
          content: record.content || "",
        });
      } else if (subtype === "bridge_status") {
        bridgeEvents.push({
          timestamp: ts,
          url: record.url || "",
          content: record.content || "",
        });
      }

    } else if (rtype === "file-history-snapshot") {
      fileSnapshots.push({
        messageId: record.messageId || "",
        isUpdate: !!record.isSnapshotUpdate,
        timestamp: ts || lastTs || "",
      });

    } else if (rtype === "queue-operation") {
      const op = record.operation || "";
      const typeMap: Record<string, LifecycleEvent["type"]> = {
        enqueue: "queue-enqueue",
        dequeue: "queue-dequeue",
        remove: "queue-remove",
      };
      if (typeMap[op]) {
        lifecycle.push({
          timestamp: ts,
          type: typeMap[op],
          detail: record.content || op,
        });
      }

    } else if (rtype === "attachment") {
      const att = record.attachment;
      if (att && typeof att === "object" && att.type === "deferred_tools_delta") {
        const added = Array.isArray(att.addedNames) ? att.addedNames.length : 0;
        const removed = Array.isArray(att.removedNames) ? att.removedNames.length : 0;
        lifecycle.push({
          timestamp: ts,
          type: "tools-changed",
          detail: `+${added} -${removed} tools`,
        });
      }

    } else if (rtype === "permission-mode") {
      lifecycle.push({
        timestamp: ts,
        type: "permission-change",
        detail: record.permissionMode || "",
      });

    } else if (rtype === "last-prompt") {
      lifecycle.push({
        timestamp: ts,
        type: "last-prompt",
        detail: "",
      });
    }
  }

  // Derive sessionId from filename
  const basename = filePath.replace(/\\/g, "/").split("/").pop() || "";
  const sessionId = basename.replace(/\.jsonl$/, "");

  const meta: SessionMeta = {
    sessionId,
    slug,
    firstMessage,
    firstTs,
    lastTs,
    sizeBytes,
    filePath: filePath.replace(/\\/g, "/"),
    projectKey,
    cwd,
    version,
    gitBranch,
    entrypoint,
  };

  const counts: SessionCounts = {
    totalRecords,
    assistantMessages: assistantMessages.length,
    userMessages: userMessages.length,
    systemEvents: turnDurations.length + hookSummaries.length + localCommands.length + bridgeEvents.length,
    toolCalls: toolTimeline.length,
    toolErrors,
    fileSnapshots: fileSnapshots.length,
    sidechainMessages,
  };

  return {
    meta,
    assistantMessages,
    userMessages,
    systemEvents: { turnDurations, hookSummaries, localCommands, bridgeEvents },
    toolTimeline,
    fileSnapshots,
    lifecycle,
    conversationTree,
    counts,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/session-parser.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/scanner/session-parser.ts tests/session-parser.test.ts
git commit -m "feat: session JSONL parser — metadata and assistant record extraction"
```

---

### Task 3: Parser tests — user records, system events, tool timeline, lifecycle

**Files:**
- Modify: `tests/session-parser.test.ts`

- [ ] **Step 1: Add user record and tool result tests**

```typescript
describe("user record extraction", () => {
  it("extracts tool results with error status", () => {
    const fp = writeSession("user-tools", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Do something" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [{ type: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls /nonexist" } }], usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: "user", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "u2", parentUuid: "a1", isSidechain: false, sourceToolAssistantUUID: "a1", toolUseResult: { durationMs: 42, success: false }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", is_error: true, content: "No such file" }] } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.userMessages).toHaveLength(2);

    const toolUser = parsed!.userMessages[1];
    expect(toolUser.toolResults).toHaveLength(1);
    expect(toolUser.toolResults[0].isError).toBe(true);
    expect(toolUser.toolResults[0].toolUseId).toBe("tu-1");
    expect(toolUser.toolResults[0].durationMs).toBe(42);
    expect(toolUser.toolResults[0].success).toBe(false);

    // Counts
    expect(parsed!.counts.toolErrors).toBe(1);
  });

  it("extracts user text preview, stripping system-reminder tags", () => {
    const fp = writeSession("user-text", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Real question <system-reminder>hidden</system-reminder> more text" } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.userMessages[0].textPreview).toBe("Real question  more text");
  });
});
```

- [ ] **Step 2: Add tool execution timeline tests**

```typescript
describe("tool execution timeline", () => {
  it("matches tool_use with tool_result into ToolExecution", () => {
    const fp = writeSession("tool-timeline", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Read file" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [{ type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/foo.ts" } }], usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: "user", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "u2", parentUuid: "a1", isSidechain: false, toolUseResult: { durationMs: 5, type: "text", file: { filePath: "/tmp/foo.ts" } }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: "file contents" }] } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.toolTimeline).toHaveLength(1);

    const exec = parsed!.toolTimeline[0];
    expect(exec.name).toBe("Read");
    expect(exec.filePath).toBe("/tmp/foo.ts");
    expect(exec.callId).toBe("tu-1");
    expect(exec.durationMs).toBe(5);
    expect(exec.isError).toBe(false);
    expect(exec.timestamp).toBe("2026-01-01T10:00:02Z");
    expect(exec.resultTimestamp).toBe("2026-01-01T10:00:03Z");
  });

  it("extracts Bash command from tool calls", () => {
    const fp = writeSession("bash-tool", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Run npm test" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [{ type: "tool_use", id: "tu-1", name: "Bash", input: { command: "npm test" } }], usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: "user", timestamp: "2026-01-01T10:00:05Z", sessionId: "s1", uuid: "u2", parentUuid: "a1", isSidechain: false, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: "all tests passed" }] } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.toolTimeline[0].command).toBe("npm test");
  });

  it("extracts Grep/Glob pattern from tool calls", () => {
    const fp = writeSession("grep-tool", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "Find imports" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [{ type: "tool_use", id: "tu-1", name: "Grep", input: { pattern: "import.*session" } }], usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: "user", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "u2", parentUuid: "a1", isSidechain: false, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: "3 matches" }] } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.toolTimeline[0].pattern).toBe("import.*session");
  });
});
```

- [ ] **Step 3: Add system events tests**

```typescript
describe("system event extraction", () => {
  it("extracts turn_duration events", () => {
    const fp = writeSession("turn-duration", [
      { type: "system", subtype: "turn_duration", timestamp: "2026-01-01T10:01:00Z", durationMs: 45000, messageCount: 12, parentUuid: "a1", sessionId: "s1", uuid: "sys1", isSidechain: false },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.systemEvents.turnDurations).toHaveLength(1);
    expect(parsed!.systemEvents.turnDurations[0].durationMs).toBe(45000);
    expect(parsed!.systemEvents.turnDurations[0].messageCount).toBe(12);
  });

  it("extracts stop_hook_summary events", () => {
    const fp = writeSession("hook-summary", [
      { type: "system", subtype: "stop_hook_summary", timestamp: "2026-01-01T10:01:00Z", hookCount: 2, hookInfos: [{ command: "bash hook.sh", durationMs: 7 }, { command: "node gate.mjs", durationMs: 63 }], hookErrors: [], preventedContinuation: false, stopReason: "", sessionId: "s1", uuid: "sys1", parentUuid: "a1", isSidechain: false },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.systemEvents.hookSummaries).toHaveLength(1);
    const hook = parsed!.systemEvents.hookSummaries[0];
    expect(hook.hookCount).toBe(2);
    expect(hook.hooks).toHaveLength(2);
    expect(hook.hooks[0].command).toBe("bash hook.sh");
    expect(hook.hooks[0].durationMs).toBe(7);
    expect(hook.preventedContinuation).toBe(false);
  });

  it("extracts local_command events", () => {
    const fp = writeSession("local-cmd", [
      { type: "system", subtype: "local_command", timestamp: "2026-01-01T10:01:00Z", content: "<command-name>/brainstorm</command-name>", sessionId: "s1", uuid: "sys1", parentUuid: "a1", isSidechain: false },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.systemEvents.localCommands).toHaveLength(1);
    expect(parsed!.systemEvents.localCommands[0].content).toContain("/brainstorm");
  });

  it("extracts bridge_status events", () => {
    const fp = writeSession("bridge", [
      { type: "system", subtype: "bridge_status", timestamp: "2026-01-01T10:01:00Z", content: "active", url: "https://claude.ai/code/session_abc", sessionId: "s1", uuid: "sys1", parentUuid: "a1", isSidechain: false },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.systemEvents.bridgeEvents).toHaveLength(1);
    expect(parsed!.systemEvents.bridgeEvents[0].url).toBe("https://claude.ai/code/session_abc");
  });
});
```

- [ ] **Step 4: Add lifecycle and conversation tree tests**

```typescript
describe("lifecycle events", () => {
  it("extracts permission-mode changes", () => {
    const fp = writeSession("perm", [
      { type: "permission-mode", permissionMode: "approved", sessionId: "s1", timestamp: "2026-01-01T10:00:00Z" },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.lifecycle).toHaveLength(1);
    expect(parsed!.lifecycle[0].type).toBe("permission-change");
    expect(parsed!.lifecycle[0].detail).toBe("approved");
  });

  it("extracts queue-operation events", () => {
    const fp = writeSession("queue", [
      { type: "queue-operation", operation: "enqueue", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1" },
      { type: "queue-operation", operation: "dequeue", timestamp: "2026-01-01T10:00:01Z", sessionId: "s1" },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.lifecycle).toHaveLength(2);
    expect(parsed!.lifecycle[0].type).toBe("queue-enqueue");
    expect(parsed!.lifecycle[1].type).toBe("queue-dequeue");
  });

  it("extracts attachment/tools-changed events", () => {
    const fp = writeSession("attach", [
      { type: "attachment", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "at1", parentUuid: "", isSidechain: false, attachment: { type: "deferred_tools_delta", addedNames: ["WebSearch", "WebFetch"], removedNames: [] } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.lifecycle).toHaveLength(1);
    expect(parsed!.lifecycle[0].type).toBe("tools-changed");
    expect(parsed!.lifecycle[0].detail).toBe("+2 -0 tools");
  });

  it("extracts last-prompt events", () => {
    const fp = writeSession("last", [
      { type: "last-prompt", timestamp: "2026-01-01T10:00:00Z" },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.lifecycle).toHaveLength(1);
    expect(parsed!.lifecycle[0].type).toBe("last-prompt");
  });
});

describe("file-history-snapshot extraction", () => {
  it("extracts file snapshots", () => {
    const fp = writeSession("fh", [
      { type: "file-history-snapshot", messageId: "msg-1", isSnapshotUpdate: false, snapshot: {} },
      { type: "file-history-snapshot", messageId: "msg-1", isSnapshotUpdate: true, snapshot: {} },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.fileSnapshots).toHaveLength(2);
    expect(parsed!.fileSnapshots[0].isUpdate).toBe(false);
    expect(parsed!.fileSnapshots[1].isUpdate).toBe(true);
  });
});

describe("conversation tree", () => {
  it("builds tree from uuid/parentUuid chains", () => {
    const fp = writeSession("tree", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "hi" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "end_turn", stop_details: {}, stop_sequence: null, content: [{ type: "text", text: "hello" }], usage: { input_tokens: 50, output_tokens: 20 } } },
      { type: "assistant", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "a2", parentUuid: "u1", isSidechain: true, requestId: "r2", message: { id: "m2", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "end_turn", stop_details: {}, stop_sequence: null, content: [{ type: "text", text: "branch" }], usage: { input_tokens: 50, output_tokens: 20 } } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.conversationTree).toHaveLength(3);
    expect(parsed!.conversationTree[2].isSidechain).toBe(true);
    expect(parsed!.counts.sidechainMessages).toBe(1);
  });
});

describe("counts", () => {
  it("produces accurate counts for a mixed session", () => {
    const fp = writeSession("counts", [
      { type: "permission-mode", permissionMode: "default", sessionId: "s1", timestamp: "2026-01-01T10:00:00Z" },
      { type: "user", timestamp: "2026-01-01T10:00:01Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "hello" } },
      { type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1", uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1", message: { id: "m1", role: "assistant", model: "claude-sonnet-4-20250514", type: "message", stop_reason: "tool_use", stop_details: {}, stop_sequence: null, content: [{ type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/f.ts" } }], usage: { input_tokens: 100, output_tokens: 50 } } },
      { type: "user", timestamp: "2026-01-01T10:00:03Z", sessionId: "s1", uuid: "u2", parentUuid: "a1", isSidechain: false, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }] } },
      { type: "system", subtype: "turn_duration", timestamp: "2026-01-01T10:00:04Z", durationMs: 3000, messageCount: 3, sessionId: "s1", uuid: "sys1", parentUuid: "a1", isSidechain: false },
      { type: "file-history-snapshot", messageId: "m1", isSnapshotUpdate: false, snapshot: {} },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.counts.totalRecords).toBe(6);
    expect(parsed!.counts.assistantMessages).toBe(1);
    expect(parsed!.counts.userMessages).toBe(2);
    expect(parsed!.counts.systemEvents).toBe(1);
    expect(parsed!.counts.toolCalls).toBe(1);
    expect(parsed!.counts.toolErrors).toBe(0);
    expect(parsed!.counts.fileSnapshots).toBe(1);
  });
});
```

- [ ] **Step 2: Run all parser tests**

Run: `npx vitest run tests/session-parser.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/session-parser.test.ts
git commit -m "test: comprehensive parser tests — user records, system events, tool timeline, lifecycle"
```

---

### Task 4: Build the session cache

**Files:**
- Create: `server/scanner/session-cache.ts`
- Create: `tests/session-cache.test.ts`

- [ ] **Step 1: Write failing test for cache behavior**

Create `tests/session-cache.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-cache-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// We test the cache through its public API. The cache needs a list of
// file paths + project keys to parse. We'll test the core logic.
import { SessionParseCache } from "../server/scanner/session-cache";

describe("SessionParseCache", () => {
  it("returns parsed sessions for valid files", () => {
    const fp = path.join(tmpDir, "sess-1.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const result = cache.getOrParse(fp, "test-key");
    expect(result).not.toBeNull();
    expect(result!.meta.sessionId).toBe("sess-1");
    expect(result!.meta.firstMessage).toBe("hello");
  });

  it("returns cached result on second call without re-reading", () => {
    const fp = path.join(tmpDir, "sess-2.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    const r2 = cache.getOrParse(fp, "test-key");
    // Same reference means cache was used
    expect(r1).toBe(r2);
  });

  it("re-parses when file size changes", () => {
    const fp = path.join(tmpDir, "sess-3.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");

    // Append more data
    fs.appendFileSync(fp, JSON.stringify({
      type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1",
      uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1",
      message: { id: "m1", role: "assistant", model: "test", type: "message",
        stop_reason: "end_turn", content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 10, output_tokens: 5 } },
    }) + "\n");

    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1); // Different reference = re-parsed
    expect(r2!.counts.assistantMessages).toBe(1);
  });

  it("invalidateAll clears all cached entries", () => {
    const fp = path.join(tmpDir, "sess-4.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    cache.invalidateAll();
    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1);
  });

  it("returns null for nonexistent file", () => {
    const cache = new SessionParseCache();
    expect(cache.getOrParse("/nonexistent/file.jsonl", "key")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session-cache.test.ts --reporter=dot`
Expected: FAIL — `SessionParseCache` does not exist

- [ ] **Step 3: Implement the cache**

Create `server/scanner/session-cache.ts`:

```typescript
import fs from "fs";
import { parseSessionFile } from "./session-parser";
import type { ParsedSession } from "@shared/session-types";

interface CacheEntry {
  parsed: ParsedSession;
  fileSize: number;
}

/**
 * Cache for parsed session data. Keyed by file path.
 * Re-parses automatically when file size changes (indicating new data).
 * Use invalidateAll() at the start of each scan cycle to force a full refresh.
 */
export class SessionParseCache {
  private entries = new Map<string, CacheEntry>();

  /** Get parsed session from cache, or parse the file if not cached / stale. */
  getOrParse(filePath: string, projectKey: string): ParsedSession | null {
    let fileSize: number;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch {
      return null;
    }

    const cached = this.entries.get(filePath);
    if (cached && cached.fileSize === fileSize) {
      return cached.parsed;
    }

    const parsed = parseSessionFile(filePath, projectKey);
    if (parsed) {
      this.entries.set(filePath, { parsed, fileSize });
    } else {
      this.entries.delete(filePath);
    }
    return parsed;
  }

  /** Get a cached session by session ID (linear scan — use sparingly). */
  getById(sessionId: string): ParsedSession | null {
    for (const entry of this.entries.values()) {
      if (entry.parsed.meta.sessionId === sessionId) return entry.parsed;
    }
    return null;
  }

  /** Clear all cached entries. Call at the start of each scan cycle. */
  invalidateAll(): void {
    this.entries.clear();
  }

  /** Remove a single entry. */
  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  /** Number of cached sessions. */
  get size(): number {
    return this.entries.size;
  }
}

/** Singleton instance used by the scanner. */
export const sessionParseCache = new SessionParseCache();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/session-cache.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/scanner/session-cache.ts tests/session-cache.test.ts
git commit -m "feat: session parse cache — file-size-based invalidation"
```

---

### Task 5: Wire cache into scan cycle

**Files:**
- Modify: `server/scanner/index.ts`
- Test: `tests/session-parser.test.ts` (add integration-style test)

- [ ] **Step 1: Write test verifying cache is populated during scan**

Add to `tests/session-parser.test.ts`:

```typescript
import { sessionParseCache } from "../server/scanner/session-cache";

describe("scan cycle integration", () => {
  it("sessionParseCache is importable and functional", () => {
    // Verify the singleton exists and has the expected API
    expect(typeof sessionParseCache.getOrParse).toBe("function");
    expect(typeof sessionParseCache.invalidateAll).toBe("function");
    expect(typeof sessionParseCache.getById).toBe("function");

    // Parse a test file through the singleton
    const fp = writeSession("singleton-test", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "test" } },
    ]);
    const result = sessionParseCache.getOrParse(fp, "key");
    expect(result).not.toBeNull();
    expect(sessionParseCache.size).toBeGreaterThanOrEqual(1);

    // Cleanup
    sessionParseCache.invalidateAll();
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/session-parser.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Wire cache invalidation into scan cycle**

In `server/scanner/index.ts`, add import and invalidation call at the start of `runFullScan()`:

Add import at the top:
```typescript
import { sessionParseCache } from "./session-cache";
```

Add `sessionParseCache.invalidateAll()` right after `clearProjectDirsCache()` inside `runFullScan()`:
```typescript
clearProjectDirsCache();
sessionParseCache.invalidateAll();
```

Also add it in `runPartialScan()` when `category === "sessions"`:
```typescript
} else if (category === "sessions") {
  sessionParseCache.invalidateAll();
  scanAllSessions();
```

- [ ] **Step 4: Run type check and existing tests**

Run: `npm run check && npx vitest run tests/session-scanner.test.ts tests/session-parser.test.ts tests/session-cache.test.ts --reporter=dot`
Expected: All pass, no type errors

- [ ] **Step 5: Commit**

```bash
git add server/scanner/index.ts tests/session-parser.test.ts
git commit -m "feat: wire session parse cache into scan cycle"
```

---

### Task 6: Migrate session-scanner.ts to use parsed cache

**Files:**
- Modify: `server/scanner/session-scanner.ts`

- [ ] **Step 1: Run existing session-scanner tests to establish baseline**

Run: `npx vitest run tests/session-scanner.test.ts --reporter=dot`
Expected: PASS — capture the exact pass count

- [ ] **Step 2: Add parsedSession field to parseSession function**

The migration strategy: `parseSession()` currently reads first 25 lines via `readHead()` + binary-seeks last timestamp via `readTailTs()`. We switch it to use the parsed cache for the full-file data, but keep the same `SessionData` output shape so all downstream consumers are unaffected.

In `server/scanner/session-scanner.ts`:

Add import:
```typescript
import { sessionParseCache } from "./session-cache";
```

Replace the body of `parseSession()` (lines 135-218) with:

```typescript
function parseSession(
  filePath: string,
  projectKey: string,
  historyIndex: Map<string, any[]>,
  activeSessions: Set<string>,
): SessionData | null {
  try {
    const basename = path.basename(filePath, ".jsonl");
    const stat = fs.statSync(filePath);

    // Use the comprehensive parser for full extraction
    const parsed = sessionParseCache.getOrParse(filePath, projectKey);

    if (parsed) {
      // Derive firstMessage: prefer history index (matches current behavior)
      let firstMessage = "";
      const historyEntries = historyIndex.get(basename) || [];
      if (historyEntries.length > 0) {
        const sorted = [...historyEntries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        for (const entry of sorted) {
          const display = (entry.display || "").trim();
          if (display && !display.startsWith("/")) {
            firstMessage = display;
            break;
          }
        }
        if (!firstMessage && sorted.length > 0) {
          firstMessage = (sorted[0].display || "").trim();
        }
      }
      // Fall back to parser's firstMessage
      if (!firstMessage) {
        firstMessage = parsed.meta.firstMessage;
      }

      const messageCount = parsed.counts.assistantMessages + parsed.counts.userMessages;
      const isEmpty = !firstMessage || messageCount < 3;

      return {
        id: basename,
        slug: parsed.meta.slug,
        firstMessage: firstMessage.replace(/^---\n[\s\S]*?\n---\n*/, "").replace(/\n/g, " ").trim(),
        firstTs: parsed.meta.firstTs,
        lastTs: parsed.meta.lastTs,
        messageCount,
        sizeBytes: stat.size,
        isEmpty,
        isActive: activeSessions.has(basename),
        filePath: filePath.replace(/\\/g, "/"),
        projectKey,
        cwd: parsed.meta.cwd,
        version: parsed.meta.version,
        gitBranch: parsed.meta.gitBranch,
      };
    }

    // Fallback: if parser returned null (empty file), use minimal approach
    return {
      id: basename,
      slug: "",
      firstMessage: "",
      firstTs: null,
      lastTs: null,
      messageCount: 0,
      sizeBytes: stat.size,
      isEmpty: true,
      isActive: activeSessions.has(basename),
      filePath: filePath.replace(/\\/g, "/"),
      projectKey,
      cwd: "",
      version: "",
      gitBranch: "",
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run existing tests — must still pass**

Run: `npx vitest run tests/session-scanner.test.ts --reporter=dot`
Expected: PASS — same pass count as Step 1

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add server/scanner/session-scanner.ts
git commit -m "refactor: session-scanner uses parsed cache instead of readHead/readTailTs"
```

---

### Task 7: Migrate session-analytics.ts to use parsed cache

This is the biggest win — eliminates the largest redundant full-file read.

**Files:**
- Modify: `server/scanner/session-analytics.ts`

- [ ] **Step 1: Run existing analytics tests to establish baseline**

Run: `npx vitest run tests/session-health.test.ts tests/session-analytics-move.test.ts tests/session-indicators.test.ts --reporter=dot`
Expected: PASS — capture exact pass count

- [ ] **Step 2: Rewrite analyzeSession to consume ParsedSession**

In `server/scanner/session-analytics.ts`:

Add imports:
```typescript
import { sessionParseCache } from "./session-cache";
import type { ParsedSession } from "@shared/session-types";
```

Replace the `analyzeSession()` function (lines 93-253) with:

```typescript
function analyzeSession(session: SessionData): RawAnalytics | null {
  // Get the comprehensive parsed data from cache
  const parsed = sessionParseCache.getOrParse(session.filePath, session.projectKey);
  if (!parsed) return null;

  const modelBreakdown: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }> = {};
  const modelsSet = new Set<string>();
  const fileOps = new Map<string, { read: number; write: number; edit: number; lastTs: string }>();
  let toolErrors = 0;
  let retries = 0;
  let totalToolCalls = 0;
  let lastEditFile = "";
  let lastEditTs = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  const messageTimestamps: string[] = [];

  // Process assistant messages
  for (const msg of parsed.assistantMessages) {
    if (msg.timestamp) messageTimestamps.push(msg.timestamp);

    const u = msg.usage;
    const model = msg.model || "unknown";
    modelsSet.add(model);

    totalInput += u.inputTokens;
    totalOutput += u.outputTokens;
    totalCacheRead += u.cacheReadTokens;
    totalCacheCreation += u.cacheCreationTokens;

    if (!modelBreakdown[model]) {
      modelBreakdown[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
    }
    modelBreakdown[model].input += u.inputTokens;
    modelBreakdown[model].output += u.outputTokens;
    modelBreakdown[model].cacheRead += u.cacheReadTokens;
    modelBreakdown[model].cacheCreation += u.cacheCreationTokens;
  }

  // Process user messages for timestamps
  for (const msg of parsed.userMessages) {
    if (msg.timestamp) messageTimestamps.push(msg.timestamp);
  }

  // Process tool timeline for file ops, errors, and retries
  for (const exec of parsed.toolTimeline) {
    totalToolCalls++;
    if (exec.isError) toolErrors++;

    const toolName = exec.name.toLowerCase();
    const fp = exec.filePath;
    if (fp && (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "glob")) {
      const existing = fileOps.get(fp) || { read: 0, write: 0, edit: 0, lastTs: "" };
      if (toolName === "read") existing.read++;
      else if (toolName === "write") existing.write++;
      else if (toolName === "edit") existing.edit++;
      if (exec.timestamp > existing.lastTs) existing.lastTs = exec.timestamp;
      fileOps.set(fp, existing);

      // Detect retries: same file edited within 60 seconds
      if (toolName === "edit" || toolName === "write") {
        const now = new Date(exec.timestamp).getTime();
        if (fp === lastEditFile && now - lastEditTs < 60000) {
          retries++;
        }
        lastEditFile = fp;
        lastEditTs = now;
      }
    }
  }

  // Calculate costs per model
  let totalCost = 0;
  for (const [model, data] of Object.entries(modelBreakdown)) {
    const pricing = getPricing(model);
    data.cost = calcCost(pricing, data.input, data.output, data.cacheRead, data.cacheCreation);
    totalCost += data.cost;
  }

  // Health score
  let healthScore: "good" | "fair" | "poor" = "good";
  if (toolErrors > 10 || retries > 8) healthScore = "poor";
  else if (toolErrors > 3 || retries > 3) healthScore = "fair";

  // Build file map with session ID
  const filesWithSession = new Map<string, { read: number; write: number; edit: number; lastTs: string; sessions: Set<string> }>();
  fileOps.forEach((ops, fp) => {
    filesWithSession.set(fp, { ...ops, sessions: new Set([session.id]) });
  });

  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;

  return {
    cost: {
      sessionId: session.id,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation,
      estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
      models: Array.from(modelsSet),
      modelBreakdown,
    },
    files: filesWithSession,
    health: {
      sessionId: session.id,
      toolErrors,
      retries,
      totalToolCalls,
      healthScore,
    },
    messageTimestamps,
    totalTokens,
  };
}
```

- [ ] **Step 3: Run existing tests — must still pass with same counts**

Run: `npx vitest run tests/session-health.test.ts tests/session-analytics-move.test.ts tests/session-indicators.test.ts --reporter=dot`
Expected: PASS — same pass count as Step 1

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add server/scanner/session-analytics.ts
git commit -m "refactor: session-analytics consumes parsed cache — eliminates redundant full-file read"
```

---

### Task 8: Safety tests, full suite validation, and cleanup

**Files:**
- Modify: `tests/session-parser.test.ts` (add edge case tests)

- [ ] **Step 1: Add edge case tests**

Add to `tests/session-parser.test.ts`:

```typescript
describe("edge cases", () => {
  it("handles session with only system records (no user/assistant)", () => {
    const fp = writeSession("system-only", [
      { type: "system", subtype: "turn_duration", timestamp: "2026-01-01T10:00:00Z", durationMs: 1000, messageCount: 0, sessionId: "s1", uuid: "sys1", parentUuid: "", isSidechain: false },
      { type: "permission-mode", permissionMode: "default", sessionId: "s1", timestamp: "2026-01-01T10:00:01Z" },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed).not.toBeNull();
    expect(parsed!.counts.assistantMessages).toBe(0);
    expect(parsed!.counts.userMessages).toBe(0);
    expect(parsed!.counts.systemEvents).toBe(1);
    expect(parsed!.lifecycle).toHaveLength(1);
    expect(parsed!.meta.firstMessage).toBe("");
  });

  it("handles very large textPreview by truncating to 300 chars", () => {
    const longText = "x".repeat(500);
    const fp = writeSession("long-text", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: longText } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.userMessages[0].textPreview.length).toBeLessThanOrEqual(300);
  });

  it("handles records with missing optional fields gracefully", () => {
    const fp = writeSession("minimal", [
      { type: "assistant", timestamp: "2026-01-01T10:00:00Z", message: { content: [{ type: "text", text: "hi" }], usage: {} } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed).not.toBeNull();
    const msg = parsed!.assistantMessages[0];
    expect(msg.model).toBe("");
    expect(msg.stopReason).toBe("");
    expect(msg.usage.inputTokens).toBe(0);
    expect(msg.uuid).toBe("");
  });

  it("derives sessionId from filename", () => {
    const fp = writeSession("abc-def-123", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "hi" } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.meta.sessionId).toBe("abc-def-123");
  });

  it("skips firstMessage for slash commands and system content", () => {
    const fp = writeSession("skip-slash", [
      { type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1", uuid: "u1", parentUuid: "", isSidechain: false, message: { role: "user", content: "<command-name>/commit</command-name>" } },
      { type: "user", timestamp: "2026-01-01T10:00:01Z", sessionId: "s1", uuid: "u2", parentUuid: "", isSidechain: false, message: { role: "user", content: "Real question here" } },
    ]);

    const parsed = parseSessionFile(fp, "key");
    expect(parsed!.meta.firstMessage).toBe("Real question here");
  });
});
```

- [ ] **Step 2: Run all parser and cache tests**

Run: `npx vitest run tests/session-parser.test.ts tests/session-cache.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 3: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=dot`
Expected: PASS — no PII in new files

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add tests/session-parser.test.ts
git commit -m "test: edge cases — minimal records, long text, slash commands, system-only sessions"
```

---

### Deferred: cost-indexer migration

The spec includes migrating `cost-indexer.ts` (Phase 4) to consume the parsed cache. This is intentionally deferred because the cost-indexer uses byte-offset-based incremental indexing — it tracks exactly which bytes it has already processed and only reads new data. Converting this to use the full-parse cache requires rethinking the incremental strategy. It should be its own follow-up task after the main migration proves stable.

---

### Task 9: Update CLAUDE.md test count and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Count new tests**

Run: `npx vitest run tests/session-parser.test.ts tests/session-cache.test.ts --reporter=verbose 2>&1 | tail -5`

Use the count to update CLAUDE.md's test count bullet.

- [ ] **Step 2: Update CLAUDE.md**

Add new test file names to the test bullet list:
- `session-parser.test.ts` — parser extraction (metadata, assistant, user, system, tool timeline, lifecycle, edge cases)
- `session-cache.test.ts` — cache behavior (hit, miss, invalidation, file-size change detection)

Update the total test count.

- [ ] **Step 3: Update CHANGELOG.md**

Add entry under the current version:

```markdown
### Added
- Comprehensive JSONL session parser (`session-parser.ts`) — extracts all 8 record types from Claude Code session files
- Session parse cache (`session-cache.ts`) — file-size-based cache invalidation, single-pass parsing
- Full JSONL schema types (`shared/session-types.ts`) — ParsedSession with 15+ typed interfaces

### Changed
- Session scanner now uses parsed cache instead of reading first 25 lines
- Session analytics now consumes parsed cache instead of redundant full-file read
- Eliminated 2 redundant full-file reads per session during scan cycle
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: update test count and changelog for scanner deepening"
```
