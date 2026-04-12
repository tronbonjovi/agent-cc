// tests/chart-analytics-route.test.ts
//
// Route-level tests for the Charts tab data endpoints
// (charts-enrichment task002).
//
// These endpoints aggregate session data into chart-ready shapes for the
// upcoming Charts tab. They MUST prefer SessionTree.totals (subagent-inclusive)
// over flat ParsedSession.assistantMessages[].usage and provide a flat
// fallback when no tree is cached.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { SessionData } from "@shared/types";
import type {
  ParsedSession,
  SessionTree,
  SessionTreeNode,
  SessionRootNode,
  AssistantTurnNode,
  SubagentRootNode,
  ToolCallNode,
} from "@shared/session-types";

// --- Fixtures ---------------------------------------------------------------

const SESSION_TREE_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_FLAT_ID = "22222222-2222-2222-2222-222222222222";

const day = (offset: number) => {
  const d = new Date("2026-04-12T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString();
};

// One session backed by a SessionTree (parent + 1 subagent)
const sessionWithTree: SessionData = {
  id: SESSION_TREE_ID,
  slug: "tree-session",
  firstMessage: "tree session",
  firstTs: day(1),
  lastTs: day(1),
  messageCount: 4,
  sizeBytes: 2048,
  isEmpty: false,
  isActive: false,
  filePath: "/tmp/tree.jsonl",
  projectKey: "alpha-project",
  cwd: "/tmp",
  version: "1.0",
  gitBranch: "main",
};

// One session that has no tree (flat fallback path)
const sessionFlat: SessionData = {
  id: SESSION_FLAT_ID,
  slug: "flat-session",
  firstMessage: "flat session",
  firstTs: day(2),
  lastTs: day(2),
  messageCount: 2,
  sizeBytes: 1024,
  isEmpty: false,
  isActive: false,
  filePath: "/tmp/flat.jsonl",
  projectKey: "beta-project",
  cwd: "/tmp",
  version: "1.0",
  gitBranch: "main",
};

const allSessions: SessionData[] = [sessionWithTree, sessionFlat];

const emptyParsed = (sessionId: string, ts: string): ParsedSession => ({
  meta: {
    sessionId,
    slug: sessionId,
    firstMessage: "x",
    firstTs: ts,
    lastTs: ts,
    sizeBytes: 1024,
    filePath: "/tmp/" + sessionId + ".jsonl",
    projectKey: "x",
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
});

// Tree session: parent had 1 assistant turn (opus model), subagent had 1
// assistant turn (sonnet model). Tree totals include subagent rollup.
function buildTree(): SessionTree {
  const parentUsage = {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheCreationTokens: 100,
    serviceTier: "standard",
    inferenceGeo: "us",
    speed: "fast",
    serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
  };
  const subUsage = {
    inputTokens: 300,
    outputTokens: 150,
    cacheReadTokens: 50,
    cacheCreationTokens: 25,
    serviceTier: "standard",
    inferenceGeo: "us",
    speed: "fast",
    serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
  };

  const root: SessionRootNode = {
    kind: "session-root",
    id: "sess:" + SESSION_TREE_ID,
    parentId: null,
    sessionId: SESSION_TREE_ID,
    slug: "tree-session",
    firstMessage: "tree session",
    firstTs: day(1),
    lastTs: day(1),
    filePath: "/tmp/tree.jsonl",
    projectKey: "alpha-project",
    gitBranch: "main",
    timestamp: day(1),
    children: [],
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 1300, outputTokens: 650, cacheReadTokens: 250, cacheCreationTokens: 125, costUsd: 0.05, durationMs: 1000 },
  };

  const parentTurn: AssistantTurnNode = {
    kind: "assistant-turn",
    id: "asst:parent-1",
    parentId: root.id,
    uuid: "parent-1",
    model: "claude-opus-4-6",
    stopReason: "end_turn",
    usage: parentUsage,
    textPreview: "parent",
    hasThinking: false,
    isSidechain: false,
    timestamp: day(1),
    children: [],
    selfCost: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreationTokens: 100, costUsd: 0.04, durationMs: 500 },
    rollupCost: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreationTokens: 100, costUsd: 0.04, durationMs: 500 },
  };

  const parentTool: ToolCallNode = {
    kind: "tool-call",
    id: "tool:t1",
    parentId: parentTurn.id,
    callId: "t1",
    name: "Read",
    filePath: "/tmp/foo.ts",
    command: null,
    pattern: null,
    durationMs: 50,
    isError: false,
    isSidechain: false,
    timestamp: day(1),
    children: [],
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 50 },
    rollupCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 50 },
  };

  const subAgent: SubagentRootNode = {
    kind: "subagent-root",
    id: "sub:agentXYZ",
    parentId: root.id,
    agentId: "agentXYZ",
    agentType: "Explore",
    description: "subagent explore",
    prompt: "explore",
    sessionId: SESSION_TREE_ID,
    filePath: "/tmp/sub.jsonl",
    dispatchedByTurnId: "asst:parent-1",
    dispatchedByToolCallId: null,
    linkage: { method: "agentid-in-result", confidence: "high" },
    timestamp: day(1),
    children: [],
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 300, outputTokens: 150, cacheReadTokens: 50, cacheCreationTokens: 25, costUsd: 0.01, durationMs: 500 },
  };

  // Subagent turn uses a DIFFERENT model than its parent — required for the
  // tree-walk-includes-subagent-models test.
  const subTurn: AssistantTurnNode = {
    kind: "assistant-turn",
    id: "asst:sub-1",
    parentId: subAgent.id,
    uuid: "sub-1",
    model: "claude-sonnet-4-5",
    stopReason: "end_turn",
    usage: subUsage,
    textPreview: "sub",
    hasThinking: false,
    isSidechain: false,
    timestamp: day(1),
    children: [],
    selfCost: { inputTokens: 300, outputTokens: 150, cacheReadTokens: 50, cacheCreationTokens: 25, costUsd: 0.01, durationMs: 500 },
    rollupCost: { inputTokens: 300, outputTokens: 150, cacheReadTokens: 50, cacheCreationTokens: 25, costUsd: 0.01, durationMs: 500 },
  };

  parentTurn.children = [parentTool];
  subAgent.children = [subTurn];
  root.children = [parentTurn, subAgent];

  return {
    root,
    nodesById: new Map<string, SessionTreeNode>([
      [root.id, root],
      [parentTurn.id, parentTurn],
      [parentTool.id, parentTool],
      [subAgent.id, subAgent],
      [subTurn.id, subTurn],
    ]),
    subagentsByAgentId: new Map<string, SessionTreeNode>([[subAgent.agentId, subAgent]]),
    totals: {
      assistantTurns: 2,
      userTurns: 0,
      toolCalls: 1,
      toolErrors: 0,
      subagents: 1,
      // tree totals = parent + subagent (rollup)
      inputTokens: 1300,
      outputTokens: 650,
      cacheReadTokens: 250,
      cacheCreationTokens: 125,
      costUsd: 0.05,
      durationMs: 1000,
    },
    warnings: [],
  };
}

// Flat-fallback session: parsed has 1 assistant message worth ~250 tokens.
function buildFlatParsed(): ParsedSession {
  const p = emptyParsed(SESSION_FLAT_ID, day(2));
  p.meta.filePath = "/tmp/flat.jsonl";
  p.assistantMessages = [
    {
      uuid: "flat-1",
      parentUuid: "",
      timestamp: day(2),
      requestId: "req-1",
      isSidechain: false,
      model: "claude-haiku-4-5",
      stopReason: "end_turn",
      usage: {
        inputTokens: 100,
        outputTokens: 80,
        cacheReadTokens: 50,
        cacheCreationTokens: 20,
        serviceTier: "standard",
        inferenceGeo: "us",
        speed: "fast",
        serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
      },
      toolCalls: [],
      hasThinking: false,
      textPreview: "flat",
    },
  ];
  p.toolTimeline = [
    {
      callId: "f1",
      name: "Edit",
      filePath: "/tmp/bar.ts",
      command: null,
      pattern: null,
      timestamp: day(2),
      resultTimestamp: day(2),
      durationMs: 30,
      isError: false,
      isSidechain: false,
      issuedByAssistantUuid: "flat-1",
    },
  ];
  return p;
}

// Per-test cache state
let parsedByPath: Record<string, ParsedSession | null> = {};
let treeByPath: Record<string, SessionTree | null> = {};

// --- Mocks ------------------------------------------------------------------

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: () => allSessions,
}));

vi.mock("../server/scanner/session-cache", () => ({
  sessionParseCache: {
    getByPath: (p: string) => parsedByPath[p] ?? null,
    getTreeByPath: (p: string) => treeByPath[p] ?? null,
    getById: vi.fn(),
    getTreeById: vi.fn(),
    getOrParse: (p: string) => parsedByPath[p] ?? null,
    setEntry: vi.fn(),
    invalidateAll: vi.fn(),
    invalidate: vi.fn(),
    getAll: () => new Map(),
    size: 0,
  },
}));

// --- Router import (after mocks) -------------------------------------------

import chartAnalyticsRouter from "../server/routes/chart-analytics";

// --- Express fixture --------------------------------------------------------

let app: express.Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(chartAnalyticsRouter);
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
  // Tree session ALSO has a flat parsed fixture, since file-ops + tool
  // counts come from parsed.toolTimeline regardless of tree presence.
  // (Subagent tool ops are intentionally not in parent's toolTimeline.)
  const treeParsed = emptyParsed(SESSION_TREE_ID, day(1));
  treeParsed.meta.filePath = "/tmp/tree.jsonl";
  treeParsed.toolTimeline = [
    {
      callId: "t1",
      name: "Read",
      filePath: "/tmp/foo.ts",
      command: null,
      pattern: null,
      timestamp: day(1),
      resultTimestamp: day(1),
      durationMs: 50,
      isError: false,
      isSidechain: false,
      issuedByAssistantUuid: "parent-1",
    },
  ];

  parsedByPath = {
    "/tmp/tree.jsonl": treeParsed,
    "/tmp/flat.jsonl": buildFlatParsed(),
  };
  treeByPath = {
    "/tmp/tree.jsonl": buildTree(),
    "/tmp/flat.jsonl": null,
  };
});

async function getJSON(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

// --- Tests ------------------------------------------------------------------

describe("GET /api/charts/tokens-over-time", () => {
  it("returns one row per session-day with all 5 token fields plus total", async () => {
    const { status, body } = await getJSON("/api/charts/tokens-over-time");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    // Two sessions on different days → two rows
    expect(body.length).toBe(2);
    for (const row of body) {
      expect(typeof row.date).toBe("string");
      expect(typeof row.inputTokens).toBe("number");
      expect(typeof row.outputTokens).toBe("number");
      expect(typeof row.cacheReadTokens).toBe("number");
      expect(typeof row.cacheCreationTokens).toBe("number");
      expect(typeof row.total).toBe("number");
    }
  });

  it("uses tree.totals (subagent-inclusive) by default — token totals match tree, not flat parent", async () => {
    const { body } = await getJSON("/api/charts/tokens-over-time");
    const treeDay = day(1).slice(0, 10);
    const treeRow = body.find((r: { date: string }) => r.date === treeDay);
    expect(treeRow).toBeDefined();
    // tree totals: 1300 / 650 / 250 / 125 (parent + subagent)
    expect(treeRow.inputTokens).toBe(1300);
    expect(treeRow.outputTokens).toBe(650);
    expect(treeRow.cacheReadTokens).toBe(250);
    expect(treeRow.cacheCreationTokens).toBe(125);
    expect(treeRow.total).toBe(1300 + 650 + 250 + 125);
  });

  it("?breakdown=parent uses tree.root.selfCost (parent-only)", async () => {
    const { body } = await getJSON("/api/charts/tokens-over-time?breakdown=parent");
    const treeDay = day(1).slice(0, 10);
    const treeRow = body.find((r: { date: string }) => r.date === treeDay);
    // Parent-only: 1000 / 500 / 200 / 100
    expect(treeRow.inputTokens).toBe(1000);
    expect(treeRow.outputTokens).toBe(500);
    expect(treeRow.cacheReadTokens).toBe(200);
    expect(treeRow.cacheCreationTokens).toBe(100);
  });

  it("falls back to flat parsed-session aggregation when tree is null", async () => {
    treeByPath["/tmp/tree.jsonl"] = null;
    const { body } = await getJSON("/api/charts/tokens-over-time");
    const flatDay = day(2).slice(0, 10);
    const flatRow = body.find((r: { date: string }) => r.date === flatDay);
    expect(flatRow).toBeDefined();
    expect(flatRow.inputTokens).toBe(100);
  });

  it("filters by ?days=", async () => {
    const { body } = await getJSON("/api/charts/tokens-over-time?days=7");
    // both sessions are within 7 days, so still 2 rows
    expect(body.length).toBe(2);
  });

  it("filters by ?projects=", async () => {
    const { body } = await getJSON("/api/charts/tokens-over-time?projects=alpha-project");
    expect(body.length).toBe(1);
    expect(body[0].date).toBe(day(1).slice(0, 10));
  });

  it("returns [] when no sessions present", async () => {
    parsedByPath = {};
    treeByPath = {};
    const { body } = await getJSON("/api/charts/tokens-over-time?projects=does-not-exist");
    expect(body).toEqual([]);
  });
});

describe("GET /api/charts/cache-over-time", () => {
  it("returns daily cache hit rate, cached, uncached", async () => {
    const { status, body } = await getJSON("/api/charts/cache-over-time");
    expect(status).toBe(200);
    expect(body.length).toBe(2);
    for (const row of body) {
      expect(typeof row.date).toBe("string");
      expect(typeof row.hitRate).toBe("number");
      expect(typeof row.cachedTokens).toBe("number");
      expect(typeof row.uncachedTokens).toBe("number");
    }
  });

  it("computes hitRate from tree totals when tree present", async () => {
    const { body } = await getJSON("/api/charts/cache-over-time");
    const treeDay = day(1).slice(0, 10);
    const treeRow = body.find((r: { date: string }) => r.date === treeDay);
    // cachedTokens = cacheReadTokens (250)
    // uncachedTokens = inputTokens (1300)  [convention: input = uncached read]
    expect(treeRow.cachedTokens).toBe(250);
    expect(treeRow.uncachedTokens).toBe(1300);
    expect(treeRow.hitRate).toBeGreaterThan(0);
  });
});

describe("GET /api/charts/models", () => {
  it("includes subagent model usage by walking the tree", async () => {
    const { body } = await getJSON("/api/charts/models");
    const treeDay = day(1).slice(0, 10);
    const row = body.find((r: { date: string }) => r.date === treeDay);
    expect(row).toBeDefined();
    // Both parent (opus-4-6) and subagent (sonnet-4-5) should appear
    expect(row["claude-opus-4-6"]).toBeGreaterThan(0);
    expect(row["claude-sonnet-4-5"]).toBeGreaterThan(0);
  });

  it("falls back to flat assistantMessages when tree is null", async () => {
    treeByPath["/tmp/tree.jsonl"] = null;
    const { body } = await getJSON("/api/charts/models");
    const flatDay = day(2).slice(0, 10);
    const row = body.find((r: { date: string }) => r.date === flatDay);
    expect(row["claude-haiku-4-5"]).toBeGreaterThan(0);
  });
});

describe("GET /api/charts/sessions", () => {
  it("returns daily session counts and avg metrics", async () => {
    const { body } = await getJSON("/api/charts/sessions");
    expect(body.length).toBe(2);
    for (const row of body) {
      expect(row).toHaveProperty("date");
      expect(row).toHaveProperty("count");
      expect(row).toHaveProperty("healthGood");
      expect(row).toHaveProperty("healthFair");
      expect(row).toHaveProperty("healthPoor");
      expect(row).toHaveProperty("avgMessages");
      expect(row).toHaveProperty("avgDuration");
    }
  });

  it("uses tree.totals.assistantTurns for avgMessages when tree present", async () => {
    const { body } = await getJSON("/api/charts/sessions");
    const treeDay = day(1).slice(0, 10);
    const row = body.find((r: { date: string }) => r.date === treeDay);
    // tree has 2 assistant turns (1 parent + 1 subagent)
    expect(row.avgMessages).toBe(2);
  });
});

describe("GET /api/charts/session-distributions", () => {
  it("returns depth and duration distribution buckets", async () => {
    const { body } = await getJSON("/api/charts/session-distributions");
    expect(body).toHaveProperty("depth");
    expect(body).toHaveProperty("duration");
    expect(Array.isArray(body.depth)).toBe(true);
    expect(Array.isArray(body.duration)).toBe(true);
  });
});

describe("GET /api/charts/stop-reasons", () => {
  it("returns stop-reason aggregates", async () => {
    const { body } = await getJSON("/api/charts/stop-reasons");
    expect(Array.isArray(body)).toBe(true);
    // Both end_turn rows expected
    const er = body.find((r: { reason: string }) => r.reason === "end_turn");
    expect(er).toBeDefined();
    expect(er.count).toBeGreaterThan(0);
  });
});

describe("GET /api/charts/tools", () => {
  it("returns frequency, errors, and overTime breakdowns", async () => {
    const { body } = await getJSON("/api/charts/tools");
    expect(body).toHaveProperty("frequency");
    expect(body).toHaveProperty("errors");
    expect(body).toHaveProperty("overTime");
    expect(Array.isArray(body.frequency)).toBe(true);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(Array.isArray(body.overTime)).toBe(true);
    // Read (from tree) and Edit (from flat) — both should appear
    const names = body.frequency.map((r: { tool: string }) => r.tool);
    expect(names).toContain("Read");
    expect(names).toContain("Edit");
  });
});

describe("GET /api/charts/files", () => {
  it("returns heatmap and churn arrays", async () => {
    const { body } = await getJSON("/api/charts/files");
    expect(body).toHaveProperty("heatmap");
    expect(body).toHaveProperty("churn");
    expect(Array.isArray(body.heatmap)).toBe(true);
    expect(Array.isArray(body.churn)).toBe(true);
    // /tmp/foo.ts (tree) + /tmp/bar.ts (flat) → both seen
    const files = body.heatmap.map((r: { file: string }) => r.file);
    expect(files).toContain("/tmp/foo.ts");
    expect(files).toContain("/tmp/bar.ts");
  });
});

describe("GET /api/charts/activity", () => {
  it("returns timeline, projects, and sidechains arrays", async () => {
    const { body } = await getJSON("/api/charts/activity");
    expect(body).toHaveProperty("timeline");
    expect(body).toHaveProperty("projects");
    expect(body).toHaveProperty("sidechains");
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(Array.isArray(body.projects)).toBe(true);
    expect(Array.isArray(body.sidechains)).toBe(true);
    // Both projects should appear in projects breakdown
    const names = body.projects.map((r: { project: string }) => r.project);
    expect(names).toContain("alpha-project");
    expect(names).toContain("beta-project");
  });
});

describe("empty-data graceful degradation", () => {
  beforeEach(() => {
    parsedByPath = {};
    treeByPath = {};
  });

  it("/api/charts/tokens-over-time returns []", async () => {
    const { body } = await getJSON("/api/charts/tokens-over-time?projects=nope");
    expect(body).toEqual([]);
  });

  it("/api/charts/sessions returns []", async () => {
    const { body } = await getJSON("/api/charts/sessions?projects=nope");
    expect(body).toEqual([]);
  });

  it("/api/charts/tools returns empty buckets", async () => {
    const { body } = await getJSON("/api/charts/tools?projects=nope");
    expect(body.frequency).toEqual([]);
    expect(body.errors).toEqual([]);
    expect(body.overTime).toEqual([]);
  });

  it("/api/charts/files returns empty buckets", async () => {
    const { body } = await getJSON("/api/charts/files?projects=nope");
    expect(body.heatmap).toEqual([]);
    expect(body.churn).toEqual([]);
  });
});
