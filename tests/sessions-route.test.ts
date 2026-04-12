// tests/sessions-route.test.ts
//
// Route-level tests for `GET /api/sessions/:id` with the `?include=tree`
// opt-in (session-hierarchy task006). Verifies three response states:
//   - include absent → no `tree` key at all (byte-compat with old shape)
//   - include=tree + cache miss → `tree: null`
//   - include=tree + cache hit → serialized SessionTree (Maps → objects)
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
} from "@shared/session-types";

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
  CLAUDE_DIR: "/tmp/.claude",
  entityId: (p: string) => p.replace(/[^a-z0-9]/gi, "").slice(0, 16).padEnd(16, "0"),
  normPath: (...args: string[]) => args.join("/"),
  encodeProjectKey: (p: string) => p.replace(/\//g, "-"),
  decodeProjectKey: (k: string) => k,
  dirExists: () => true,
  fileExists: () => false,
  readMessageTimeline: () => [],
  extractMessageText: () => "",
  extractToolNames: () => [],
  readHead: () => "",
  readTailTs: () => null,
  extractText: () => "",
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

beforeAll(async () => {
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
    expect(body.message).toBe("Session not found");
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
