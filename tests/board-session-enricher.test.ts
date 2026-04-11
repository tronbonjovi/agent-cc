// tests/board-session-enricher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(),
}));

vi.mock("../server/scanner/session-analytics", () => ({
  getSessionCost: vi.fn(),
  getSessionHealth: vi.fn(),
}));

vi.mock("../server/scanner/agent-scanner", () => ({
  getCachedExecutions: vi.fn(),
}));

vi.mock("../server/scanner/session-cache", () => ({
  sessionParseCache: { getById: vi.fn(), getAll: vi.fn() },
}));

import { enrichTaskSession, autoLinkSession, buildSessionSnapshot, cacheSnapshot, getCachedSnapshot, clearSnapshotCache } from "../server/board/session-enricher";
import { getCachedSessions } from "../server/scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../server/scanner/session-analytics";
import { getCachedExecutions } from "../server/scanner/agent-scanner";
import { sessionParseCache } from "../server/scanner/session-cache";

const mockGetCachedSessions = vi.mocked(getCachedSessions);
const mockGetById = vi.mocked(sessionParseCache.getById);
const mockGetSessionCost = vi.mocked(getSessionCost);
const mockGetSessionHealth = vi.mocked(getSessionHealth);
const mockGetCachedExecutions = vi.mocked(getCachedExecutions);
const mockGetAll = vi.mocked(sessionParseCache.getAll);

const makeSession = (overrides = {}) => ({
  id: "sess-abc123",
  projectKey: "my-project",
  filePath: "/tmp/fake.jsonl",
  firstTs: "2026-04-01T10:00:00.000Z",
  lastTs: "2026-04-01T10:30:00.000Z",
  firstMessage: "Hello",
  messageCount: 20,
  isActive: false,
  isEmpty: false,
  sizeBytes: 1024,
  ...overrides,
});

const makeCost = (overrides = {}) => ({
  sessionId: "sess-abc123",
  inputTokens: 5000,
  outputTokens: 2000,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  estimatedCostUsd: 0.042,
  models: ["claude-sonnet-4-5"],
  modelBreakdown: {
    "claude-sonnet-4-5": { input: 5000, output: 2000, cacheRead: 0, cacheCreation: 0, cost: 0.042 },
  },
  ...overrides,
});

const makeParsedSession = (overrides: Record<string, any> = {}) => ({
  meta: {
    sessionId: "sess-abc123",
    slug: "test-session",
    firstMessage: "Hello",
    firstTs: "2026-04-01T10:00:00.000Z",
    lastTs: "2026-04-01T10:30:00.000Z",
    sizeBytes: 2048,
    filePath: "/tmp/fake.jsonl",
    projectKey: "my-project",
    cwd: "/home/user/project",
    version: "1.0.0",
    gitBranch: "main",
    entrypoint: "cli",
  },
  assistantMessages: [
    {
      uuid: "msg-1",
      parentUuid: "root",
      timestamp: "2026-04-01T10:05:00.000Z",
      requestId: "req-1",
      isSidechain: false,
      model: "claude-sonnet-4-5",
      stopReason: "end_turn",
      usage: {
        inputTokens: 2000,
        outputTokens: 800,
        cacheReadTokens: 1500,
        cacheCreationTokens: 500,
        serviceTier: "default",
        inferenceGeo: "us",
        speed: "normal",
        serverToolUse: { webSearchRequests: 2, webFetchRequests: 3 },
      },
      toolCalls: [],
      hasThinking: false,
      textPreview: "Here is the result...",
    },
    {
      uuid: "msg-2",
      parentUuid: "msg-1",
      timestamp: "2026-04-01T10:15:00.000Z",
      requestId: "req-2",
      isSidechain: false,
      model: "claude-sonnet-4-5",
      stopReason: "max_tokens",
      usage: {
        inputTokens: 3000,
        outputTokens: 1200,
        cacheReadTokens: 2000,
        cacheCreationTokens: 800,
        serviceTier: "default",
        inferenceGeo: "us",
        speed: "normal",
        serverToolUse: { webSearchRequests: 1, webFetchRequests: 0 },
      },
      toolCalls: [],
      hasThinking: false,
      textPreview: "Continuing...",
    },
  ],
  userMessages: [],
  systemEvents: {
    turnDurations: [
      { timestamp: "2026-04-01T10:05:00.000Z", durationMs: 5000, messageCount: 2, parentUuid: "root" },
      { timestamp: "2026-04-01T10:10:00.000Z", durationMs: 8000, messageCount: 3, parentUuid: "msg-1" },
      { timestamp: "2026-04-01T10:15:00.000Z", durationMs: 3000, messageCount: 1, parentUuid: "msg-2" },
    ],
    hookSummaries: [],
    localCommands: [],
    bridgeEvents: [],
  },
  toolTimeline: [],
  fileSnapshots: [],
  lifecycle: [],
  conversationTree: [],
  counts: {
    totalRecords: 30,
    assistantMessages: 2,
    userMessages: 5,
    systemEvents: 3,
    toolCalls: 15,
    toolErrors: 2,
    fileSnapshots: 0,
    sidechainMessages: 4,
  },
  ...overrides,
});

const makeHealth = (overrides = {}) => ({
  sessionId: "sess-abc123",
  toolErrors: 2,
  retries: 1,
  totalToolCalls: 30,
  healthScore: "good" as const,
  ...overrides,
});

describe("enrichTaskSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no agent executions (tests that need them override this)
    mockGetCachedExecutions.mockReturnValue([]);
  });

  it("returns null when no sessionId provided", () => {
    const result = enrichTaskSession(undefined);
    expect(result).toBeNull();
    expect(mockGetCachedSessions).not.toHaveBeenCalled();
  });

  it("returns null when session not found in cache", () => {
    mockGetCachedSessions.mockReturnValue([]);
    const result = enrichTaskSession("sess-notfound");
    expect(result).toBeNull();
  });

  it("returns full enrichment with session data, cost, and health", () => {
    const session = makeSession();
    const cost = makeCost();
    const health = makeHealth({ toolErrors: 3, healthScore: "fair" as const });

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);

    const result = enrichTaskSession("sess-abc123");

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-abc123");
    expect(result!.isActive).toBe(false);
    expect(result!.model).toBe("claude-sonnet-4-5");
    expect(result!.lastActivity).toBeNull();
    expect(result!.lastActivityTs).toBe("2026-04-01T10:30:00.000Z");
    expect(result!.messageCount).toBe(20);
    expect(result!.costUsd).toBe(0.042);
    expect(result!.inputTokens).toBe(5000);
    expect(result!.outputTokens).toBe(2000);
    expect(result!.healthScore).toBe("fair");
    expect(result!.toolErrors).toBe(3);
    expect(result!.durationMinutes).toBe(30);
  });

  it("picks the model with the highest token count when multiple models present", () => {
    const session = makeSession();
    const cost = makeCost({
      models: ["claude-haiku-3-5", "claude-sonnet-4-5"],
      modelBreakdown: {
        "claude-haiku-3-5": { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0, cost: 0.001 },
        "claude-sonnet-4-5": { input: 8000, output: 3000, cacheRead: 0, cacheCreation: 0, cost: 0.05 },
      },
    });

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.model).toBe("claude-sonnet-4-5");
  });

  it("handles missing cost data gracefully — cost returns null", () => {
    const session = makeSession();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(null);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);

    const result = enrichTaskSession("sess-abc123");

    expect(result).not.toBeNull();
    expect(result!.model).toBeNull();
    expect(result!.costUsd).toBe(0);
    expect(result!.inputTokens).toBe(0);
    expect(result!.outputTokens).toBe(0);
  });

  it("handles missing health data gracefully — health returns null", () => {
    const session = makeSession();
    const cost = makeCost();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(null);

    const result = enrichTaskSession("sess-abc123");

    expect(result).not.toBeNull();
    expect(result!.healthScore).toBeNull();
    expect(result!.toolErrors).toBe(0);
  });

  it("returns durationMinutes as null when timestamps are missing", () => {
    const session = makeSession({ firstTs: null, lastTs: null });

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(makeCost() as any);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);
    mockGetCachedExecutions.mockReturnValue([]);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.durationMinutes).toBeNull();
  });

  it("extracts agentRole from the most recent agent execution for the session", () => {
    const session = makeSession();
    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(makeCost() as any);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);
    mockGetCachedExecutions.mockReturnValue([
      {
        agentId: "agent-1",
        slug: "explore",
        sessionId: "sess-abc123",
        projectKey: "my-project",
        agentType: "Explore",
        model: "claude-sonnet-4-5",
        firstMessage: "Investigating...",
        firstTs: "2026-04-01T10:05:00.000Z",
        lastTs: "2026-04-01T10:10:00.000Z",
        messageCount: 5,
        sizeBytes: 512,
        filePath: "/tmp/agent-1.jsonl",
      },
      {
        agentId: "agent-2",
        slug: "plan",
        sessionId: "sess-abc123",
        projectKey: "my-project",
        agentType: "Plan",
        model: "claude-sonnet-4-5",
        firstMessage: "Planning...",
        firstTs: "2026-04-01T10:15:00.000Z",
        lastTs: "2026-04-01T10:20:00.000Z",
        messageCount: 8,
        sizeBytes: 1024,
        filePath: "/tmp/agent-2.jsonl",
      },
    ] as any);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.agentRole).toBe("Plan"); // most recent by lastTs
  });

  it("returns agentRole as null when no agent executions exist for the session", () => {
    const session = makeSession();
    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(makeCost() as any);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);
    mockGetCachedExecutions.mockReturnValue([
      {
        agentId: "agent-other",
        slug: "explore",
        sessionId: "sess-other-session",
        projectKey: "other-project",
        agentType: "Explore",
        model: "claude-sonnet-4-5",
        firstMessage: "Doing something else",
        firstTs: "2026-04-01T10:05:00.000Z",
        lastTs: "2026-04-01T10:10:00.000Z",
        messageCount: 5,
        sizeBytes: 512,
        filePath: "/tmp/agent-other.jsonl",
      },
    ] as any);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.agentRole).toBeNull();
  });

  it("returns agentRole as null when agent executions have null agentType", () => {
    const session = makeSession();
    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(makeCost() as any);
    mockGetSessionHealth.mockReturnValue(makeHealth() as any);
    mockGetCachedExecutions.mockReturnValue([
      {
        agentId: "agent-1",
        slug: "unknown",
        sessionId: "sess-abc123",
        projectKey: "my-project",
        agentType: null,
        model: "claude-sonnet-4-5",
        firstMessage: "Working...",
        firstTs: "2026-04-01T10:05:00.000Z",
        lastTs: "2026-04-01T10:10:00.000Z",
        messageCount: 5,
        sizeBytes: 512,
        filePath: "/tmp/agent-1.jsonl",
      },
    ] as any);

    const result = enrichTaskSession("sess-abc123");
    expect(result!.agentRole).toBeNull();
  });

  it("populates new detail fields from parsed session cache", () => {
    const session = makeSession();
    const cost = makeCost({
      cacheReadTokens: 3500,
      cacheCreationTokens: 1300,
    });
    const health = makeHealth({
      healthReasons: ["High tool error rate"],
      totalToolCalls: 30,
      retries: 3,
    });
    const parsed = makeParsedSession();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    const result = enrichTaskSession("sess-abc123");

    expect(result).not.toBeNull();
    // healthReasons from health data
    expect(result!.healthReasons).toEqual(["High tool error rate"]);
    // totalToolCalls from health data
    expect(result!.totalToolCalls).toBe(30);
    // retries from health data
    expect(result!.retries).toBe(3);
    // cacheHitRate = cacheReadTokens / (cacheReadTokens + cacheCreationTokens) = 3500 / 4800
    expect(result!.cacheHitRate).toBeCloseTo(3500 / 4800, 5);
    // maxTokensStops = count of assistant messages with stopReason === "max_tokens"
    expect(result!.maxTokensStops).toBe(1);
    // webRequests = sum of (webSearchRequests + webFetchRequests) across all assistant messages = (2+3) + (1+0) = 6
    expect(result!.webRequests).toBe(6);
    // sidechainCount = parsed.counts.sidechainMessages
    expect(result!.sidechainCount).toBe(4);
    // turnCount = parsed.systemEvents.turnDurations.length
    expect(result!.turnCount).toBe(3);
  });

  it("returns zero/empty for detail fields when parsed session not found", () => {
    const session = makeSession();
    const cost = makeCost();
    const health = makeHealth();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(null);

    const result = enrichTaskSession("sess-abc123");

    expect(result).not.toBeNull();
    expect(result!.healthReasons).toEqual([]);
    expect(result!.totalToolCalls).toBe(30);
    expect(result!.retries).toBe(1);
    expect(result!.cacheHitRate).toBeNull();
    expect(result!.maxTokensStops).toBe(0);
    expect(result!.webRequests).toBe(0);
    expect(result!.sidechainCount).toBe(0);
    expect(result!.turnCount).toBe(0);
  });

  it("auto-links session when no manual sessionId and branch matches task ID", () => {
    const session = makeSession({ id: "sess-autolinked" });
    const cost = makeCost({ sessionId: "sess-autolinked" });
    const health = makeHealth({ sessionId: "sess-autolinked" });
    const parsed = makeParsedSession({
      meta: {
        sessionId: "sess-autolinked",
        slug: "auto-link-session",
        firstMessage: "Working on task",
        firstTs: "2026-04-01T10:00:00.000Z",
        lastTs: "2026-04-01T10:30:00.000Z",
        sizeBytes: 2048,
        filePath: "/tmp/autolink.jsonl",
        projectKey: "my-project",
        cwd: "/home/user/project",
        version: "1.0.0",
        gitBranch: "feat/card-enrichment-task004",
        entrypoint: "cli",
      },
    });

    const task = {
      id: "card-enrichment-task004",
      title: "Wire auto-link",
      status: "in_progress",
      type: "task" as const,
      created: "2026-04-01",
      updated: "2026-04-01",
      labels: [],
    };

    // sessionParseCache.getAll returns all parsed sessions for auto-link
    const parsedMap = new Map([["sess-autolinked", parsed]]);
    mockGetAll.mockReturnValue(parsedMap as any);

    // Session lookup for enrichment
    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    // No manual sessionId, but task provided — should auto-link
    const result = enrichTaskSession(undefined, [session] as any, task as any);

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("sess-autolinked");
  });

  it("computes cacheHitRate as null when no cache tokens exist", () => {
    const session = makeSession();
    const cost = makeCost({
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
    const health = makeHealth();
    const parsed = makeParsedSession();

    mockGetCachedSessions.mockReturnValue([session] as any);
    mockGetSessionCost.mockReturnValue(cost as any);
    mockGetSessionHealth.mockReturnValue(health as any);
    mockGetById.mockReturnValue(parsed as any);

    const result = enrichTaskSession("sess-abc123");

    expect(result!.cacheHitRate).toBeNull();
  });
});

describe("buildSessionSnapshot", () => {
  it("extracts snapshot fields from a SessionEnrichment", () => {
    const enrichment = {
      sessionId: "sess-snap1",
      isActive: false,
      model: "claude-sonnet-4-5",
      lastActivity: null,
      lastActivityTs: "2026-04-01T10:30:00.000Z",
      messageCount: 20,
      costUsd: 0.42,
      inputTokens: 5000,
      outputTokens: 2000,
      healthScore: "good" as const,
      toolErrors: 1,
      durationMinutes: 30,
      agentRole: "Explore",
      healthReasons: ["High cost"],
      totalToolCalls: 50,
      retries: 2,
      cacheHitRate: 0.75,
      maxTokensStops: 1,
      webRequests: 5,
      sidechainCount: 3,
      turnCount: 10,
    };

    const snap = buildSessionSnapshot(enrichment);
    expect(snap.model).toBe("claude-sonnet-4-5");
    expect(snap.agentRole).toBe("Explore");
    expect(snap.messageCount).toBe(20);
    expect(snap.durationMinutes).toBe(30);
    expect(snap.inputTokens).toBe(5000);
    expect(snap.outputTokens).toBe(2000);
    expect(snap.costUsd).toBe(0.42);
    expect(snap.healthReasons).toEqual(["High cost"]);
    expect(snap.totalToolCalls).toBe(50);
    expect(snap.retries).toBe(2);
    expect(snap.cacheHitRate).toBe(0.75);
    expect(snap.maxTokensStops).toBe(1);
    expect(snap.webRequests).toBe(5);
    expect(snap.sidechainCount).toBe(3);
    expect(snap.turnCount).toBe(10);
  });

  it("preserves null values from enrichment", () => {
    const enrichment = {
      sessionId: "sess-snap2",
      isActive: true,
      model: null,
      lastActivity: null,
      lastActivityTs: null,
      messageCount: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      healthScore: null,
      toolErrors: 0,
      durationMinutes: null,
      agentRole: null,
      healthReasons: [],
      totalToolCalls: 0,
      retries: 0,
      cacheHitRate: null,
      maxTokensStops: 0,
      webRequests: 0,
      sidechainCount: 0,
      turnCount: 0,
    };

    const snap = buildSessionSnapshot(enrichment);
    expect(snap.model).toBeNull();
    expect(snap.agentRole).toBeNull();
    expect(snap.durationMinutes).toBeNull();
    expect(snap.cacheHitRate).toBeNull();
  });
});

describe("snapshot cache", () => {
  beforeEach(() => {
    clearSnapshotCache();
  });

  it("cacheSnapshot stores and getCachedSnapshot retrieves", () => {
    const snap = {
      model: "claude-opus-4-6",
      agentRole: "Plan",
      messageCount: 42,
      durationMinutes: 90,
      inputTokens: 10000,
      outputTokens: 5000,
      costUsd: 1.25,
    };
    cacheSnapshot("task-123", snap);
    expect(getCachedSnapshot("task-123")).toEqual(snap);
  });

  it("getCachedSnapshot returns undefined for unknown tasks", () => {
    expect(getCachedSnapshot("nonexistent")).toBeUndefined();
  });

  it("cacheSnapshot overwrites previous snapshot", () => {
    const snap1 = {
      model: "claude-sonnet-4-5",
      agentRole: null,
      messageCount: 10,
      durationMinutes: 5,
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.10,
    };
    const snap2 = {
      model: "claude-opus-4-6",
      agentRole: "Explore",
      messageCount: 30,
      durationMinutes: 45,
      inputTokens: 8000,
      outputTokens: 4000,
      costUsd: 0.80,
    };
    cacheSnapshot("task-456", snap1);
    cacheSnapshot("task-456", snap2);
    expect(getCachedSnapshot("task-456")).toEqual(snap2);
  });

  it("clearSnapshotCache empties all entries", () => {
    cacheSnapshot("task-a", {
      model: null, agentRole: null, messageCount: 0,
      durationMinutes: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
    });
    clearSnapshotCache();
    expect(getCachedSnapshot("task-a")).toBeUndefined();
  });
});
