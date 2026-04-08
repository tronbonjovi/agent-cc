// tests/board-session-enricher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/scanner/session-scanner", () => ({
  getCachedSessions: vi.fn(),
}));

vi.mock("../server/scanner/session-analytics", () => ({
  getSessionCost: vi.fn(),
  getSessionHealth: vi.fn(),
}));

import { enrichTaskSession } from "../server/board/session-enricher";
import { getCachedSessions } from "../server/scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../server/scanner/session-analytics";

const mockGetCachedSessions = vi.mocked(getCachedSessions);
const mockGetSessionCost = vi.mocked(getSessionCost);
const mockGetSessionHealth = vi.mocked(getSessionHealth);

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
  tags: [],
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

    const result = enrichTaskSession("sess-abc123");
    expect(result!.durationMinutes).toBeNull();
  });
});
