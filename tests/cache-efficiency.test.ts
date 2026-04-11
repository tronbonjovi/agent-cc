import { describe, it, expect } from "vitest";
import { computeCacheEfficiency, type CacheEfficiencyResult } from "../server/scanner/cache-efficiency";
import type { ParsedSession, AssistantRecord, TokenUsage } from "../shared/session-types";

/** Helper to build a minimal AssistantRecord */
function makeAssistantRecord(overrides: Partial<AssistantRecord> & { usage?: Partial<TokenUsage> } = {}): AssistantRecord {
  const defaultUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    serviceTier: "",
    inferenceGeo: "",
    speed: "",
    serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
  };
  return {
    uuid: "u-1",
    parentUuid: "",
    timestamp: "2026-04-11T12:00:00Z",
    requestId: "r-1",
    isSidechain: false,
    model: overrides.model ?? "claude-opus-4-6",
    stopReason: overrides.stopReason ?? "end_turn",
    usage: { ...defaultUsage, ...overrides.usage },
    toolCalls: overrides.toolCalls ?? [],
    hasThinking: overrides.hasThinking ?? false,
    textPreview: overrides.textPreview ?? "Hello",
  };
}

/** Helper to build a minimal ParsedSession */
function makeSession(assistantMessages: AssistantRecord[], id = "test-session-1"): ParsedSession {
  return {
    meta: {
      sessionId: id,
      slug: "test",
      firstMessage: "hello",
      firstTs: "2026-04-11T12:00:00Z",
      lastTs: "2026-04-11T12:30:00Z",
      sizeBytes: 1000,
      filePath: "/tmp/test.jsonl",
      projectKey: "test-proj",
      cwd: "/tmp",
      version: "1.0",
      gitBranch: "main",
      entrypoint: "cli",
    },
    assistantMessages,
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: assistantMessages.length,
      assistantMessages: assistantMessages.length,
      userMessages: 0,
      systemEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      fileSnapshots: 0,
      sidechainMessages: 0,
    },
  };
}

describe("cache-efficiency", () => {
  describe("computeCacheEfficiency", () => {
    it("returns zeros for empty sessions array", () => {
      const result = computeCacheEfficiency([]);
      expect(result.hitRate).toBe(0);
      expect(result.firstMessageAvgInput).toBe(0);
      expect(result.steadyStateAvgInput).toBe(0);
      expect(result.cacheCreationCost).toBe(0);
      expect(result.cacheReadSavings).toBe(0);
      expect(result.roi).toBe(0);
      expect(result.messageCurve).toEqual([]);
    });

    it("returns zeros for sessions with no assistant messages", () => {
      const session = makeSession([]);
      const result = computeCacheEfficiency([session]);
      expect(result.hitRate).toBe(0);
      expect(result.messageCurve).toEqual([]);
    });

    it("computes cache hit rate correctly", () => {
      // inputTokens: 200, cacheReadTokens: 800
      // hitRate = 800 / (200 + 800) * 100 = 80%
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 100, cacheReadTokens: 400 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, cacheReadTokens: 400 } }),
      ];
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);
      expect(result.hitRate).toBeCloseTo(80, 1);
    });

    it("handles zero cache reads (0% hit rate)", () => {
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 1000, cacheReadTokens: 0 } }),
      ];
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);
      expect(result.hitRate).toBe(0);
    });

    it("computes first-message vs steady-state averages", () => {
      // Session 1: first msg 5000, subsequent 1000, 1200
      // Session 2: first msg 3000, subsequent 800, 900
      const session1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 5000 } }),
        makeAssistantRecord({ usage: { inputTokens: 1000 } }),
        makeAssistantRecord({ usage: { inputTokens: 1200 } }),
      ], "s1");
      const session2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 3000 } }),
        makeAssistantRecord({ usage: { inputTokens: 800 } }),
        makeAssistantRecord({ usage: { inputTokens: 900 } }),
      ], "s2");

      const result = computeCacheEfficiency([session1, session2]);

      // First message avg: (5000 + 3000) / 2 = 4000
      expect(result.firstMessageAvgInput).toBe(4000);
      // Steady state avg: (1000 + 1200 + 800 + 900) / 4 = 975
      expect(result.steadyStateAvgInput).toBe(975);
    });

    it("handles single-message sessions (no steady state messages)", () => {
      const session = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 5000 } }),
      ]);
      const result = computeCacheEfficiency([session]);
      // First message avg = 5000
      expect(result.firstMessageAvgInput).toBe(5000);
      // No subsequent messages, so steady state = 0
      expect(result.steadyStateAvgInput).toBe(0);
    });

    it("computes cache ROI correctly", () => {
      // cacheCreationTokens: 10000 at opus-4-6 ($6.25/M) = $0.0625
      // cacheReadTokens: 50000 — savings = tokens * (input - cacheRead) / 1M
      //   = 50000 * (5.0 - 0.50) / 1M = 50000 * 4.5 / 1M = $0.225
      // ROI = 0.225 / 0.0625 = 3.6
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 1000, cacheReadTokens: 50000, cacheCreationTokens: 10000 },
          model: "claude-opus-4-6",
        }),
      ];
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);

      expect(result.cacheCreationCost).toBeCloseTo(0.0625, 4);
      expect(result.cacheReadSavings).toBeCloseTo(0.225, 4);
      expect(result.roi).toBeCloseTo(3.6, 1);
    });

    it("returns ROI of 0 when no cache creation cost", () => {
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 1000, cacheReadTokens: 5000 } }),
      ];
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);
      expect(result.cacheCreationCost).toBe(0);
      // Savings exist but ROI is 0 (avoid division by zero)
      expect(result.roi).toBe(0);
    });

    it("computes message curve up to 20 message indices", () => {
      // Session with 5 messages, each with increasing cache read %
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 1000, cacheReadTokens: 0 } }),
        makeAssistantRecord({ usage: { inputTokens: 500, cacheReadTokens: 500 } }),
        makeAssistantRecord({ usage: { inputTokens: 200, cacheReadTokens: 800 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, cacheReadTokens: 900 } }),
        makeAssistantRecord({ usage: { inputTokens: 50, cacheReadTokens: 950 } }),
      ];
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);

      // Should have 5 data points (indices 1-5)
      expect(result.messageCurve.length).toBe(5);
      expect(result.messageCurve[0].index).toBe(1);
      expect(result.messageCurve[0].cacheReadPct).toBeCloseTo(0, 1); // 0 / (1000+0) = 0%
      expect(result.messageCurve[1].index).toBe(2);
      expect(result.messageCurve[1].cacheReadPct).toBeCloseTo(50, 1); // 500 / (500+500) = 50%
      expect(result.messageCurve[4].index).toBe(5);
      expect(result.messageCurve[4].cacheReadPct).toBeCloseTo(95, 1); // 950 / (50+950) = 95%
    });

    it("averages message curve across multiple sessions", () => {
      // Session 1, msg 1: input=1000, cacheRead=0 → 0%
      // Session 2, msg 1: input=500, cacheRead=500 → 50%
      // Average for index 1: 25%
      const session1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, cacheReadTokens: 0 } }),
      ], "s1");
      const session2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 500, cacheReadTokens: 500 } }),
      ], "s2");

      const result = computeCacheEfficiency([session1, session2]);
      expect(result.messageCurve.length).toBe(1);
      expect(result.messageCurve[0].index).toBe(1);
      expect(result.messageCurve[0].cacheReadPct).toBeCloseTo(25, 1);
    });

    it("caps message curve at 20 indices", () => {
      // Create a session with 25 messages
      const msgs = Array.from({ length: 25 }, () =>
        makeAssistantRecord({ usage: { inputTokens: 100, cacheReadTokens: 900 } })
      );
      const session = makeSession(msgs);
      const result = computeCacheEfficiency([session]);

      expect(result.messageCurve.length).toBe(20);
      expect(result.messageCurve[19].index).toBe(20);
    });

    it("aggregates across multiple sessions for all metrics", () => {
      const session1 = makeSession([
        makeAssistantRecord({
          usage: { inputTokens: 200, cacheReadTokens: 800, cacheCreationTokens: 5000 },
          model: "claude-opus-4-6",
        }),
      ], "s1");
      const session2 = makeSession([
        makeAssistantRecord({
          usage: { inputTokens: 300, cacheReadTokens: 700, cacheCreationTokens: 3000 },
          model: "claude-opus-4-6",
        }),
      ], "s2");

      const result = computeCacheEfficiency([session1, session2]);

      // Total input: 500, total cacheRead: 1500
      // hitRate = 1500 / (500 + 1500) * 100 = 75%
      expect(result.hitRate).toBeCloseTo(75, 1);

      // cacheCreation: 8000 tokens at $6.25/M = $0.05
      expect(result.cacheCreationCost).toBeCloseTo(0.05, 4);

      // cacheRead savings: 1500 * (5.0 - 0.5) / 1M = $0.00675
      expect(result.cacheReadSavings).toBeCloseTo(0.00675, 5);
    });

    it("handles mixed models for ROI calculation", () => {
      // Opus 4.6: cacheCreation=$6.25/M, input=$5/M, cacheRead=$0.50/M
      // Sonnet: cacheCreation=$3.75/M, input=$3/M, cacheRead=$0.30/M
      const session1 = makeSession([
        makeAssistantRecord({
          usage: { inputTokens: 100, cacheReadTokens: 10000, cacheCreationTokens: 5000 },
          model: "claude-opus-4-6",
        }),
      ], "s1");
      const session2 = makeSession([
        makeAssistantRecord({
          usage: { inputTokens: 100, cacheReadTokens: 10000, cacheCreationTokens: 5000 },
          model: "claude-sonnet-4-20250514",
        }),
      ], "s2");

      const result = computeCacheEfficiency([session1, session2]);

      // Opus creation: 5000 * 6.25 / 1M = 0.03125
      // Sonnet creation: 5000 * 3.75 / 1M = 0.01875
      expect(result.cacheCreationCost).toBeCloseTo(0.03125 + 0.01875, 5);

      // Opus savings: 10000 * (5.0 - 0.5) / 1M = 0.045
      // Sonnet savings: 10000 * (3.0 - 0.3) / 1M = 0.027
      expect(result.cacheReadSavings).toBeCloseTo(0.045 + 0.027, 5);
    });
  });
});
