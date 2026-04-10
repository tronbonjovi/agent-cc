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

import { enrichTaskSession, buildSessionSnapshot, cacheSnapshot, getCachedSnapshot, clearSnapshotCache } from "../server/board/session-enricher";
import { getCachedSessions } from "../server/scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../server/scanner/session-analytics";
import { getCachedExecutions } from "../server/scanner/agent-scanner";

const mockGetCachedSessions = vi.mocked(getCachedSessions);
const mockGetSessionCost = vi.mocked(getSessionCost);
const mockGetSessionHealth = vi.mocked(getSessionHealth);
const mockGetCachedExecutions = vi.mocked(getCachedExecutions);

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
    };

    const snap = buildSessionSnapshot(enrichment);
    expect(snap.model).toBe("claude-sonnet-4-5");
    expect(snap.agentRole).toBe("Explore");
    expect(snap.messageCount).toBe(20);
    expect(snap.durationMinutes).toBe(30);
    expect(snap.inputTokens).toBe(5000);
    expect(snap.outputTokens).toBe(2000);
    expect(snap.costUsd).toBe(0.42);
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
    };

    const snap = buildSessionSnapshot(enrichment);
    expect(snap.model).toBeNull();
    expect(snap.agentRole).toBeNull();
    expect(snap.durationMinutes).toBeNull();
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
