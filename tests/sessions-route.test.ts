// tests/sessions-route.test.ts
//
// Route-level tests for `GET /api/sessions/:id` with the `?include=tree`
// opt-in (session-hierarchy task006). Verifies three response states:
//   - include absent → no `tree` key at all (byte-compat with old shape)
//   - include=tree + cache miss → `tree: null`
//   - include=tree + cache hit → serialized SessionTree (Maps → objects)
//
// Also covers `GET /api/sessions/:id/messages` (messages-redesign-task001)
// — the seven-kind message timeline and its optional `?include=tree`
// enrichment with treeNodeId + subagentContext.
import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { SessionData, SessionStats } from "@shared/types";
import type {
  ParsedSession,
  SessionTree,
  SessionTreeNode,
  SessionRootNode,
  SubagentRootNode,
  AssistantTurnNode,
  ToolCallNode,
  UserTurnNode,
} from "@shared/session-types";

// --- CLAUDE_DIR fixture -----------------------------------------------------
//
// The sessions route walks `<CLAUDE_DIR>/projects/<encoded-project>/<id>.jsonl`
// to find a session's raw JSONL. We create a real directory tree under
// `os.tmpdir()` so `validateSafePath` (which requires paths under home or
// tmp) accepts it, and write a fixture JSONL with all seven message kinds.
// `vi.hoisted` lets the path survive vi.mock hoisting so the mock factory
// can reference it — we use CJS require so the factory runs before
// top-level ESM imports complete.
const fixtureDirs = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("path") as typeof import("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const o = require("os") as typeof import("os");
  const CLAUDE_TEST_DIR = p.join(
    o.tmpdir(),
    `cc-sessions-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const TEST_PROJECT_DIR = p.join(CLAUDE_TEST_DIR, "projects", "test-project");
  return { CLAUDE_TEST_DIR, TEST_PROJECT_DIR };
});
const CLAUDE_TEST_DIR = fixtureDirs.CLAUDE_TEST_DIR;
const TEST_PROJECT_DIR = fixtureDirs.TEST_PROJECT_DIR;

// --- Session fixture --------------------------------------------------------

const SESSION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

const mockSessions: SessionData[] = [
  {
    id: SESSION_ID,
    slug: "test-session",
    firstMessage: "Hello world",
    firstTs: "2026-04-12T00:00:00Z",
    lastTs: "2026-04-12T01:00:00Z",
    messageCount: 5,
    sizeBytes: 1024,
    isEmpty: false,
    isActive: false,
    filePath: "/tmp/test.jsonl",
    projectKey: "test-project",
    cwd: "/tmp",
    version: "1.0",
    gitBranch: "main",
  },
];

const mockStats: SessionStats = {
  totalCount: 1,
  totalSize: 1024,
  activeCount: 0,
  emptyCount: 0,
};

// Minimal ParsedSession — only the fields the route reads.
const mockParsed: ParsedSession = {
  meta: {
    sessionId: SESSION_ID,
    slug: "test-session",
    firstMessage: "Hello world",
    firstTs: "2026-04-12T00:00:00Z",
    lastTs: "2026-04-12T01:00:00Z",
    sizeBytes: 1024,
    filePath: "/tmp/test.jsonl",
    projectKey: "test-project",
    cwd: "/tmp",
    version: "1.0",
    gitBranch: "main",
    entrypoint: "cli",
  },
  assistantMessages: [],
  userMessages: [],
  systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
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

// Minimal SessionTree — a root node, one assistant turn, two subagents.
function buildMockTree(): SessionTree {
  const root: SessionRootNode = {
    kind: "session-root",
    id: "sess:" + SESSION_ID,
    parentId: null,
    sessionId: SESSION_ID,
    slug: "test-session",
    firstMessage: "Hello world",
    firstTs: "2026-04-12T00:00:00Z",
    lastTs: "2026-04-12T01:00:00Z",
    filePath: "/tmp/test.jsonl",
    projectKey: "test-project",
    gitBranch: "main",
    timestamp: "2026-04-12T00:00:00Z",
    children: [],
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.001, durationMs: 500 },
  };
  const assistant: SessionTreeNode = {
    kind: "assistant-turn",
    id: "asst:uuid-1",
    parentId: root.id,
    uuid: "uuid-1",
    model: "claude-opus-4-6",
    stopReason: "end_turn",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "standard",
      inferenceGeo: "us",
      speed: "fast",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: "response",
    hasThinking: false,
    isSidechain: false,
    timestamp: "2026-04-12T00:00:30Z",
    children: [],
    selfCost: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.001, durationMs: 500 },
    rollupCost: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.001, durationMs: 500 },
  };
  const subA: SessionTreeNode = {
    kind: "subagent-root",
    id: "sub:agentA0000000",
    parentId: root.id,
    agentId: "agentA0000000",
    agentType: "Explore",
    description: "a subagent",
    prompt: "explore the repo",
    sessionId: SESSION_ID,
    filePath: "/tmp/test/subA.jsonl",
    dispatchedByTurnId: null,
    dispatchedByToolCallId: null,
    linkage: { method: "orphan", confidence: "none", reason: "no-parent" },
    timestamp: "2026-04-12T00:00:45Z",
    children: [],
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.0001, durationMs: 50 },
  };
  const subB: SessionTreeNode = {
    ...subA,
    id: "sub:agentB0000000",
    agentId: "agentB0000000",
    agentType: "Plan",
    description: "another subagent",
    prompt: "plan it",
    filePath: "/tmp/test/subB.jsonl",
    linkage: { method: "agentid-in-result", confidence: "high" },
    timestamp: "2026-04-12T00:00:50Z",
  };
  root.children = [assistant, subA, subB];

  return {
    root,
    nodesById: new Map<string, SessionTreeNode>([
      [root.id, root],
      [assistant.id, assistant],
      [subA.id, subA],
      [subB.id, subB],
    ]),
    subagentsByAgentId: new Map<string, SessionTreeNode>([
      [subA.agentId, subA],
      [(subB as SessionTreeNode & { agentId: string }).agentId, subB],
    ]),
    totals: {
      assistantTurns: 1,
      userTurns: 0,
      toolCalls: 0,
      toolErrors: 0,
      subagents: 2,
      inputTokens: 120,
      outputTokens: 60,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0.0012,
      durationMs: 600,
    },
    warnings: [],
  };
}

// Per-test controllable cache state.
let cacheParsed: ParsedSession | null = null;
let cacheTree: SessionTree | null = null;

// --- Mocks ------------------------------------------------------------------

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => mockSessions,
  getCachedStats: () => mockStats,
  removeCachedSession: vi.fn(),
  restoreCachedSession: vi.fn(),
}));

vi.mock("../server/scanner/session-cache", () => ({
  sessionParseCache: {
    getById: (id: string) => (id === SESSION_ID ? cacheParsed : null),
    getByPath: () => cacheParsed,
    getTreeById: (id: string) => (id === SESSION_ID ? cacheTree : null),
    getTreeByPath: () => cacheTree,
    getOrParse: () => null,
    setEntry: vi.fn(),
    invalidateAll: vi.fn(),
    invalidate: vi.fn(),
    getAll: () => new Map(),
    size: 0,
  },
}));

vi.mock("../server/scanner/utils", () => ({
  CLAUDE_DIR: fixtureDirs.CLAUDE_TEST_DIR,
  entityId: (p: string) => p.replace(/[^a-z0-9]/gi, "").slice(0, 16).padEnd(16, "0"),
  normPath: (...args: string[]) => args.join("/"),
  encodeProjectKey: (p: string) => p.replace(/\//g, "-"),
  decodeProjectKey: (k: string) => k,
  // Real fs check so findSessionJsonl() can walk our test project dir.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  dirExists: (p: string) => (require("fs") as typeof import("fs")).existsSync(p),
  fileExists: () => false,
  readMessageTimeline: () => [],
  extractMessageText: () => "",
  extractToolNames: () => [],
  readHead: () => "",
  readTailTs: () => null,
  extractText: (content: unknown) => {
    // Mirrors server/scanner/utils.extractText for the session-parser
    // enrichment path — it joins text content blocks. Kept minimal.
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((i: unknown): i is { type: string; text?: string } =>
          i != null && typeof i === "object" && (i as { type?: string }).type === "text",
        )
        .map((i) => i.text || "")
        .join(" ");
    }
    return "";
  },
}));

vi.mock("../server/scanner/deep-search", () => ({
  deepSearch: vi.fn(async () => ({ results: [], totalMatches: 0, scannedSessions: 0, timings: {} })),
}));

vi.mock("../server/scanner/session-analytics", () => ({
  getCostAnalytics: vi.fn(() => ({})),
  getFileHeatmap: vi.fn(() => []),
  getHealthAnalytics: vi.fn(() => ({})),
  getSessionCost: vi.fn(() => ({})),
  getStaleAnalytics: vi.fn(() => ({})),
}));

vi.mock("../server/scanner/commit-linker", () => ({
  getSessionCommits: vi.fn(() => []),
}));

vi.mock("../server/scanner/project-dashboard", () => ({
  getProjectDashboards: vi.fn(() => []),
}));

vi.mock("../server/scanner/session-diffs", () => ({
  getSessionDiffs: vi.fn(() => []),
}));

vi.mock("../server/scanner/weekly-digest", () => ({
  generateWeeklyDigest: vi.fn(),
}));

vi.mock("../server/scanner/auto-workflows", () => ({
  runAutoWorkflows: vi.fn(),
}));

vi.mock("../server/scanner/file-timeline", () => ({
  getFileTimeline: vi.fn(() => []),
}));

vi.mock("../server/scanner/nl-query", () => ({
  runNLQuery: vi.fn(),
}));

vi.mock("../server/scanner/continuation-detector", () => ({
  getContinuationBrief: vi.fn(() => null),
}));

vi.mock("../server/scanner/bash-knowledge", () => ({
  getBashKnowledgeBase: vi.fn(() => ({ commands: [], stats: {} })),
  searchBashCommands: vi.fn(() => []),
}));

vi.mock("../server/scanner/nerve-center", () => ({
  getNerveCenterData: vi.fn(() => ({ services: [] })),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getSummaries: () => ({}),
    getPinnedSessions: () => [],
    getNotes: () => ({}),
    getNote: () => null,
    getEntities: () => [],
    getEntity: () => null,
    getDashboardStats: () => ({ sessions: mockStats }),
  },
}));

vi.mock("../server/db", () => ({
  getDB: () => ({ entities: {}, relationships: [], backups: [], scanStatus: {}, settings: {} }),
  save: vi.fn(),
}));

// --- Router import (after mocks) -------------------------------------------

import sessionsRouter from "../server/routes/sessions";

// --- Express fixture --------------------------------------------------------

let app: express.Express;
let server: Server;
let baseUrl: string;

/**
 * Build a JSONL body exercising all seven TimelineMessage kinds. Matching
 * uuids / callIds in the tree fixture below so enrichment can resolve
 * ancestor chains to a subagent when we want to test subagentContext.
 */
function buildSevenKindJsonl(): string {
  const records: Record<string, unknown>[] = [
    // 1. system_event — permission-mode (top-of-session marker)
    {
      type: "permission-mode",
      permissionMode: "default",
      timestamp: "2026-04-12T00:00:00.000Z",
    },
    // 2. skill_invocation — local_command system record with command-name XML
    {
      type: "system",
      subtype: "local_command",
      timestamp: "2026-04-12T00:00:00.100Z",
      content:
        "<command-name>brainstorm</command-name><command-args>a new idea</command-args>",
    },
    // 3. user_text — plain user message
    {
      type: "user",
      uuid: "u-1",
      parentUuid: "",
      timestamp: "2026-04-12T00:00:01.000Z",
      isSidechain: false,
      message: { role: "user", content: "hi there explore the repo" },
    },
    // 4. assistant with thinking + text + tool_use (emits 3 messages)
    {
      type: "assistant",
      uuid: "a-1",
      parentUuid: "u-1",
      timestamp: "2026-04-12T00:00:02.000Z",
      isSidechain: false,
      requestId: "req-1",
      message: {
        id: "msg-1",
        role: "assistant",
        model: "claude-opus-4-6",
        type: "message",
        stop_reason: "tool_use",
        content: [
          { type: "thinking", thinking: "pondering the request" },
          { type: "text", text: "I will dispatch a subagent now" },
          {
            type: "tool_use",
            id: "tool-call-1",
            name: "Agent",
            input: { subagent_type: "Explore", description: "explore", prompt: "go" },
          },
        ],
        usage: {
          input_tokens: 500,
          output_tokens: 120,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          service_tier: "standard",
          server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        },
      },
    },
    // 5. tool_result — user record carrying the Agent tool_result
    {
      type: "user",
      uuid: "u-2",
      parentUuid: "a-1",
      timestamp: "2026-04-12T00:00:03.000Z",
      isSidechain: false,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-call-1",
            content: [{ type: "text", text: "subagent result body" }],
            is_error: false,
          },
        ],
      },
      toolUseResult: { durationMs: 1000, success: true, agentId: "agentXXXXXXXXXXXX" },
    },
    // Second assistant turn to exercise pagination tail
    {
      type: "assistant",
      uuid: "a-2",
      parentUuid: "u-2",
      timestamp: "2026-04-12T00:00:04.000Z",
      isSidechain: false,
      requestId: "req-2",
      message: {
        id: "msg-2",
        role: "assistant",
        model: "claude-opus-4-6",
        type: "message",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "done" }],
        usage: {
          input_tokens: 200,
          output_tokens: 50,
          service_tier: "standard",
          server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        },
      },
    },
  ];
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

function zeroCost() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    durationMs: 0,
  };
}

/**
 * Build a SessionTree that matches the IDs in buildSevenKindJsonl() so
 * enrichment actually lands. The tool_call for tool-call-1 sits under
 * asst:a-1 and has a subagent-root underneath — any tool_call or
 * tool_result message for that call should resolve its subagent ancestor.
 */
function buildSevenKindTree(): SessionTree {
  const root: SessionRootNode = {
    kind: "session-root",
    id: `session:${SESSION_ID}`,
    parentId: null,
    children: [],
    timestamp: "2026-04-12T00:00:00Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    sessionId: SESSION_ID,
    slug: "seven-kind",
    firstMessage: "hi",
    firstTs: "2026-04-12T00:00:01.000Z",
    lastTs: "2026-04-12T00:00:04.000Z",
    filePath: path.join(TEST_PROJECT_DIR, `${SESSION_ID}.jsonl`),
    projectKey: "test-project",
    gitBranch: "main",
  };
  const user1: UserTurnNode = {
    kind: "user-turn",
    id: "user:u-1",
    parentId: root.id,
    children: [],
    timestamp: "2026-04-12T00:00:01.000Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: "u-1",
    textPreview: "hi",
    isMeta: false,
    isSidechain: false,
  };
  const asst1: AssistantTurnNode = {
    kind: "assistant-turn",
    id: "asst:a-1",
    parentId: root.id,
    children: [],
    timestamp: "2026-04-12T00:00:02.000Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: "a-1",
    model: "claude-opus-4-6",
    stopReason: "tool_use",
    usage: {
      inputTokens: 500,
      outputTokens: 120,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "standard",
      inferenceGeo: "",
      speed: "",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: "I will dispatch",
    hasThinking: true,
    isSidechain: false,
  };
  const tool1: ToolCallNode = {
    kind: "tool-call",
    id: "tool:tool-call-1",
    parentId: asst1.id,
    children: [],
    timestamp: "2026-04-12T00:00:02.000Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    callId: "tool-call-1",
    name: "Agent",
    filePath: null,
    command: null,
    pattern: null,
    durationMs: 1000,
    isError: false,
    isSidechain: false,
  };
  const agent: SubagentRootNode = {
    kind: "subagent-root",
    id: "agent:agentXXXXXXXXXXXX",
    parentId: tool1.id,
    children: [],
    timestamp: "2026-04-12T00:00:03.000Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    agentId: "agentXXXXXXXXXXXX",
    agentType: "Explore",
    description: "a subagent",
    prompt: "go",
    sessionId: SESSION_ID,
    filePath: "/tmp/doesnt-matter.jsonl",
    dispatchedByTurnId: asst1.id,
    dispatchedByToolCallId: tool1.id,
    linkage: { method: "agentid-in-result", confidence: "high" },
  };
  const asst2: AssistantTurnNode = {
    kind: "assistant-turn",
    id: "asst:a-2",
    parentId: root.id,
    children: [],
    timestamp: "2026-04-12T00:00:04.000Z",
    selfCost: zeroCost(),
    rollupCost: zeroCost(),
    uuid: "a-2",
    model: "claude-opus-4-6",
    stopReason: "end_turn",
    usage: {
      inputTokens: 200,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "standard",
      inferenceGeo: "",
      speed: "",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: "done",
    hasThinking: false,
    isSidechain: false,
  };

  // Wire children — order matters only for deterministic serialization.
  root.children = [user1, asst1, asst2];
  asst1.children = [tool1];
  tool1.children = [agent];

  const nodesById = new Map<string, SessionTreeNode>([
    [root.id, root],
    [user1.id, user1],
    [asst1.id, asst1],
    [tool1.id, tool1],
    [agent.id, agent],
    [asst2.id, asst2],
  ]);

  return {
    root,
    nodesById,
    subagentsByAgentId: new Map<string, SessionTreeNode>([[agent.agentId, agent]]),
    totals: {
      assistantTurns: 2,
      userTurns: 1,
      toolCalls: 1,
      toolErrors: 0,
      subagents: 1,
      inputTokens: 700,
      outputTokens: 170,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 1000,
    },
    warnings: [],
  };
}

// This test exercises the legacy scanner backend end-to-end through the
// Express router: it mocks `session-scanner` + `session-cache` and writes
// a real JSONL fixture that legacy path-based helpers read. Task008
// flipped `SCANNER_BACKEND`'s default to `store`, so pin this file to the
// legacy backend explicitly — legacy remains available for one release
// cycle as a rollback escape hatch and is the right target for these
// cache/fixture-based assertions. Store-side coverage of the same
// timeline behaviors lives in scanner-backend-parity.test.ts.
const __originalScannerBackend = process.env.SCANNER_BACKEND;
process.env.SCANNER_BACKEND = "legacy";

beforeAll(async () => {
  // Set up the fake CLAUDE_DIR structure so findSessionJsonl() resolves.
  fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_PROJECT_DIR, `${SESSION_ID}.jsonl`),
    buildSevenKindJsonl(),
  );

  app = express();
  app.use(express.json());
  app.use(sessionsRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
  try {
    fs.rmSync(CLAUDE_TEST_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
  if (__originalScannerBackend === undefined) {
    delete process.env.SCANNER_BACKEND;
  } else {
    process.env.SCANNER_BACKEND = __originalScannerBackend;
  }
});

beforeEach(() => {
  cacheParsed = null;
  cacheTree = null;
});

async function get(path: string) {
  return fetch(`${baseUrl}${path}`);
}

// --- Tests ------------------------------------------------------------------

describe("GET /api/sessions/:id — default shape unchanged", () => {
  it("omits the tree field entirely when no include query param is passed", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${SESSION_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Byte-compat with the pre-task shape: session fields + records + parsed,
    // but no `tree` key at all.
    expect(Object.prototype.hasOwnProperty.call(body, "tree")).toBe(false);
    expect(body.id).toBe(SESSION_ID);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.parsed).not.toBeUndefined();
  });

  it("?include=other (unknown include value) does NOT add a tree field", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${SESSION_ID}?include=other`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.prototype.hasOwnProperty.call(body, "tree")).toBe(false);
  });
});

describe("GET /api/sessions/:id?include=tree", () => {
  it("returns cached tree when the cache has one", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${SESSION_ID}?include=tree`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tree).not.toBeNull();
    expect(body.tree.root.kind).toBe("session-root");
    expect(body.tree.root.sessionId).toBe(SESSION_ID);
    expect(body.tree.totals.subagents).toBe(2);
  });

  it("serializes Maps as plain objects (not empty `{}` from Map leak)", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${SESSION_ID}?include=tree`);
    const body = await res.json();

    // nodesById: the four node ids we built should all be present as keys.
    expect(typeof body.tree.nodesById).toBe("object");
    expect(Array.isArray(body.tree.nodesById)).toBe(false);
    const nodeKeys = Object.keys(body.tree.nodesById);
    expect(nodeKeys).toContain("sess:" + SESSION_ID);
    expect(nodeKeys).toContain("asst:uuid-1");
    expect(nodeKeys).toContain("sub:agentA0000000");
    expect(nodeKeys).toContain("sub:agentB0000000");
    expect(nodeKeys.length).toBe(4);

    // subagentsByAgentId: keyed by agentId.
    expect(typeof body.tree.subagentsByAgentId).toBe("object");
    expect(Array.isArray(body.tree.subagentsByAgentId)).toBe(false);
    const subKeys = Object.keys(body.tree.subagentsByAgentId);
    expect(subKeys).toContain("agentA0000000");
    expect(subKeys).toContain("agentB0000000");
    expect(subKeys.length).toBe(2);
    expect(body.tree.subagentsByAgentId.agentB0000000.linkage.method).toBe("agentid-in-result");
  });

  it("returns tree: null when the cache has a parsed session but no tree", async () => {
    cacheParsed = mockParsed;
    cacheTree = null;

    const res = await get(`/api/sessions/${SESSION_ID}?include=tree`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tree).toBeNull();
  });

  it("tolerates unknown include values alongside tree (?include=tree,unknown)", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${SESSION_ID}?include=tree,unknown`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tree).not.toBeNull();
    expect(body.tree.root.sessionId).toBe(SESSION_ID);
  });

  it("returns 404 for unknown session id (error path unchanged)", async () => {
    cacheParsed = mockParsed;
    cacheTree = buildMockTree();

    const res = await get(`/api/sessions/${UNKNOWN_ID}?include=tree`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  it("passes SessionTree warnings through to the response", async () => {
    cacheParsed = mockParsed;
    const tree = buildMockTree();
    tree.warnings = [
      { kind: "orphan-subagent", detail: "no parent agentid-in-result match" },
      { kind: "subagent-parse-failed", detail: "bad.jsonl unreadable" },
    ];
    cacheTree = tree;

    const res = await get(`/api/sessions/${SESSION_ID}?include=tree`);
    const body = await res.json();

    expect(Array.isArray(body.tree.warnings)).toBe(true);
    expect(body.tree.warnings.length).toBe(2);
    expect(body.tree.warnings[0].kind).toBe("orphan-subagent");
    expect(body.tree.warnings[1].kind).toBe("subagent-parse-failed");
  });
});

// ---------------------------------------------------------------------------
// GET /api/sessions/:id/messages — seven-kind timeline + tree enrichment
// ---------------------------------------------------------------------------

describe("GET /api/sessions/:id/messages — typed timeline", () => {
  it("returns all seven TimelineMessage kinds for the fixture session", async () => {
    const res = await get(`/api/sessions/${SESSION_ID}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(SESSION_ID);
    expect(typeof body.totalMessages).toBe("number");
    expect(Array.isArray(body.messages)).toBe(true);

    // Collect emitted message types.
    const types = new Set<string>();
    for (const m of body.messages) types.add(m.type);
    expect(types.has("user_text")).toBe(true);
    expect(types.has("assistant_text")).toBe(true);
    expect(types.has("thinking")).toBe(true);
    expect(types.has("tool_call")).toBe(true);
    expect(types.has("tool_result")).toBe(true);
    expect(types.has("system_event")).toBe(true);
    expect(types.has("skill_invocation")).toBe(true);
  });

  it("does NOT include `meta` or treeNodeId fields when ?include is absent (byte-compat baseline)", async () => {
    const res = await get(`/api/sessions/${SESSION_ID}/messages`);
    const body = await res.json();
    expect(Object.prototype.hasOwnProperty.call(body, "meta")).toBe(false);
    for (const m of body.messages) {
      expect(Object.prototype.hasOwnProperty.call(m, "treeNodeId")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(m, "subagentContext")).toBe(false);
    }
  });

  it("pairs tool_call with tool_result via matching callId/toolUseId", async () => {
    const res = await get(`/api/sessions/${SESSION_ID}/messages`);
    const body = await res.json();
    const call = body.messages.find((m: { type: string }) => m.type === "tool_call");
    const result = body.messages.find((m: { type: string }) => m.type === "tool_result");
    expect(call).toBeDefined();
    expect(result).toBeDefined();
    expect(call.callId).toBe(result.toolUseId);
  });

  it("pagination: offset=2, limit=3 returns a 3-message slice with stable totalMessages", async () => {
    const all = await (await get(`/api/sessions/${SESSION_ID}/messages`)).json();
    const sliced = await (
      await get(`/api/sessions/${SESSION_ID}/messages?offset=2&limit=3`)
    ).json();
    expect(sliced.totalMessages).toBe(all.totalMessages);
    expect(sliced.messages.length).toBe(Math.min(3, Math.max(0, all.totalMessages - 2)));
    for (let i = 0; i < sliced.messages.length; i++) {
      expect(sliced.messages[i]).toEqual(all.messages[i + 2]);
    }
  });

  it("?types=user_text,assistant_text narrows to the requested kinds only", async () => {
    const res = await get(
      `/api/sessions/${SESSION_ID}/messages?types=user_text,assistant_text`,
    );
    const body = await res.json();
    for (const m of body.messages) {
      expect(["user_text", "assistant_text"]).toContain(m.type);
    }
    // Should still be non-empty (fixture has both kinds)
    expect(body.messages.length).toBeGreaterThan(0);
  });

  it("returns empty array for a session with no matching JSONL", async () => {
    // Session id is valid-UUID-shaped but no file exists on disk.
    const res = await get(`/api/sessions/${UNKNOWN_ID}/messages`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session file not found");
  });

  it("returns 400 for malformed session id", async () => {
    const res = await get(`/api/sessions/not-a-uuid/messages`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid session ID format");
  });
});

describe("GET /api/sessions/:id/messages?include=tree — enrichment", () => {
  it("attaches treeNodeId to every message when tree cache has an entry", async () => {
    cacheTree = buildSevenKindTree();
    const res = await get(`/api/sessions/${SESSION_ID}/messages?include=tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta?.treeStatus).toBe("ok");
    for (const m of body.messages) {
      // Each message must have treeNodeId defined (can be null for
      // system/skill/orphan — the key itself must be present).
      expect(Object.prototype.hasOwnProperty.call(m, "treeNodeId")).toBe(true);
    }
    // At least the user/assistant-bound messages should have real ids.
    const userText = body.messages.find((m: { type: string }) => m.type === "user_text");
    expect(userText.treeNodeId).toBe("user:u-1");
  });

  it("attaches subagentContext for messages whose tree node sits under a subagent-root", async () => {
    cacheTree = buildSevenKindTree();
    const res = await get(`/api/sessions/${SESSION_ID}/messages?include=tree`);
    const body = await res.json();
    // tool_call and tool_result for tool-call-1 both resolve to tool:tool-call-1,
    // which has the subagent as a child. But the tool_call itself is the
    // parent of the subagent, not a descendant — so its ancestor walk does
    // NOT hit a subagent-root. It should stay subagentContext: null.
    const toolCall = body.messages.find((m: { type: string }) => m.type === "tool_call");
    expect(toolCall.treeNodeId).toBe("tool:tool-call-1");
    expect(toolCall.subagentContext).toBeNull();
  });

  it("system_event / skill_invocation messages get treeNodeId: null but still appear", async () => {
    cacheTree = buildSevenKindTree();
    const res = await get(`/api/sessions/${SESSION_ID}/messages?include=tree`);
    const body = await res.json();
    const skill = body.messages.find((m: { type: string }) => m.type === "skill_invocation");
    const sys = body.messages.find((m: { type: string }) => m.type === "system_event");
    expect(skill).toBeDefined();
    expect(sys).toBeDefined();
    expect(skill.treeNodeId).toBeNull();
    expect(skill.subagentContext).toBeNull();
    expect(sys.treeNodeId).toBeNull();
    expect(sys.subagentContext).toBeNull();
  });

  it("tree unavailable → meta.treeStatus: 'unavailable' and treeNodeId: null on every message", async () => {
    cacheTree = null;
    const res = await get(`/api/sessions/${SESSION_ID}/messages?include=tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta?.treeStatus).toBe("unavailable");
    for (const m of body.messages) {
      expect(m.treeNodeId).toBeNull();
      expect(m.subagentContext).toBeNull();
    }
  });

  it("?include=tree respects the types filter", async () => {
    cacheTree = buildSevenKindTree();
    const res = await get(
      `/api/sessions/${SESSION_ID}/messages?include=tree&types=tool_call,tool_result`,
    );
    const body = await res.json();
    expect(body.meta?.treeStatus).toBe("ok");
    for (const m of body.messages) {
      expect(["tool_call", "tool_result"]).toContain(m.type);
      expect(Object.prototype.hasOwnProperty.call(m, "treeNodeId")).toBe(true);
    }
  });
});
