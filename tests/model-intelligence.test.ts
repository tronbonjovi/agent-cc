import { describe, it, expect } from "vitest";
import { computeModelIntelligence, type ModelIntelligenceRow } from "../server/scanner/model-intelligence";
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
    model: overrides.model ?? "claude-sonnet-4-20250514",
    stopReason: "end_turn",
    usage: { ...defaultUsage, ...overrides.usage },
    toolCalls: overrides.toolCalls ?? [],
    hasThinking: overrides.hasThinking ?? false,
    textPreview: overrides.textPreview ?? "Hello",
  };
}

/** Helper to build a minimal ParsedSession */
function makeSession(assistantMessages: AssistantRecord[], sessionId = "test-session-1"): ParsedSession {
  return {
    meta: {
      sessionId,
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

describe("model-intelligence", () => {
  describe("computeModelIntelligence", () => {
    it("returns empty array for no sessions", () => {
      const result = computeModelIntelligence([]);
      expect(result).toEqual([]);
    });

    it("returns empty array for sessions with no assistant messages", () => {
      const session = makeSession([]);
      const result = computeModelIntelligence([session]);
      expect(result).toEqual([]);
    });

    it("aggregates tokens per model correctly", () => {
      const msgs = [
        makeAssistantRecord({
          model: "claude-sonnet-4-20250514",
          usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheCreationTokens: 100 },
        }),
        makeAssistantRecord({
          model: "claude-sonnet-4-20250514",
          usage: { inputTokens: 3000, outputTokens: 1500, cacheReadTokens: 5000, cacheCreationTokens: 200 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      expect(result).toHaveLength(1);
      const row = result[0];
      expect(row.model).toBe("claude-sonnet-4-20250514");
      expect(row.sessions).toBe(1);
      expect(row.inputTokens).toBe(4000);
      expect(row.outputTokens).toBe(2000);
      expect(row.cacheReadTokens).toBe(7000);
      expect(row.cacheCreationTokens).toBe(300);
    });

    it("counts distinct sessions per model", () => {
      const session1 = makeSession([
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "session-1");
      const session2 = makeSession([
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 200, outputTokens: 100 } }),
      ], "session-2");
      const session3 = makeSession([
        makeAssistantRecord({ model: "claude-sonnet-4-20250514", usage: { inputTokens: 300, outputTokens: 150 } }),
      ], "session-3");

      const result = computeModelIntelligence([session1, session2, session3]);
      expect(result).toHaveLength(2);

      const opus = result.find(r => r.model === "claude-opus-4-6")!;
      const sonnet = result.find(r => r.model === "claude-sonnet-4-20250514")!;
      expect(opus.sessions).toBe(2);
      expect(sonnet.sessions).toBe(1);
    });

    it("computes API-equivalent cost using pricing", () => {
      // Sonnet: input=$3/M, output=$15/M, cacheRead=$0.30/M, cacheCreation=$3.75/M
      const msgs = [
        makeAssistantRecord({
          model: "claude-sonnet-4-20250514",
          usage: { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 2_000_000, cacheCreationTokens: 100_000 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      const row = result[0];
      // Cost = (1M*3 + 500K*15 + 2M*0.30 + 100K*3.75) / 1M
      //      = (3 + 7.5 + 0.6 + 0.375)
      //      = 11.475
      expect(row.apiEquivCost).toBeCloseTo(11.475, 3);
    });

    it("computes cache savings correctly", () => {
      // Cache savings = (cacheReadTokens * inputRate - cacheReadTokens * cacheReadRate) / 1M
      // Sonnet: input=$3/M, cacheRead=$0.30/M
      // 2M cache read tokens: uncached = 2M * 3/M = $6, cached = 2M * 0.30/M = $0.60
      // Savings = $6 - $0.60 = $5.40
      const msgs = [
        makeAssistantRecord({
          model: "claude-sonnet-4-20250514",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 2_000_000, cacheCreationTokens: 0 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      const row = result[0];
      expect(row.cacheSavings).toBeCloseTo(5.4, 3);
    });

    it("returns zero cache savings when no cache reads", () => {
      const msgs = [
        makeAssistantRecord({
          model: "claude-sonnet-4-20250514",
          usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      expect(result[0].cacheSavings).toBe(0);
    });

    it("handles multiple models in a single session", () => {
      const msgs = [
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 1000, outputTokens: 500 } }),
        makeAssistantRecord({ model: "claude-sonnet-4-20250514", usage: { inputTokens: 2000, outputTokens: 1000 } }),
      ];
      const session = makeSession(msgs, "session-mixed");
      const result = computeModelIntelligence([session]);

      expect(result).toHaveLength(2);
      // Both models should count the same session
      const opus = result.find(r => r.model === "claude-opus-4-6")!;
      const sonnet = result.find(r => r.model === "claude-sonnet-4-20250514")!;
      expect(opus.sessions).toBe(1);
      expect(sonnet.sessions).toBe(1);
      expect(opus.inputTokens).toBe(1000);
      expect(sonnet.inputTokens).toBe(2000);
    });

    it("sorts by apiEquivCost descending", () => {
      const session1 = makeSession([
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 1_000_000, outputTokens: 500_000 } }),
      ], "s1");
      const session2 = makeSession([
        makeAssistantRecord({ model: "claude-sonnet-4-20250514", usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "s2");

      const result = computeModelIntelligence([session1, session2]);
      expect(result[0].model).toBe("claude-opus-4-6");
      expect(result[0].apiEquivCost).toBeGreaterThan(result[1].apiEquivCost);
    });

    it("computes cache savings for opus 4.6 pricing", () => {
      // Opus 4.6: input=$5/M, cacheRead=$0.50/M
      // 1M cache read tokens: uncached = $5, cached = $0.50 => savings = $4.50
      const msgs = [
        makeAssistantRecord({
          model: "claude-opus-4-6",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 0 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      expect(result[0].cacheSavings).toBeCloseTo(4.5, 3);
    });

    it("aggregates across multiple sessions for the same model", () => {
      const s1 = makeSession([
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 1000, outputTokens: 500 } }),
      ], "s1");
      const s2 = makeSession([
        makeAssistantRecord({ model: "claude-opus-4-6", usage: { inputTokens: 2000, outputTokens: 1000 } }),
      ], "s2");

      const result = computeModelIntelligence([s1, s2]);
      expect(result).toHaveLength(1);
      expect(result[0].inputTokens).toBe(3000);
      expect(result[0].outputTokens).toBe(1500);
      expect(result[0].sessions).toBe(2);
    });
  });
});
