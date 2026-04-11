import { describe, it, expect } from "vitest";
import { computeSessionProjectValue } from "../server/scanner/session-project-value";
import type { ParsedSession, AssistantRecord, TokenUsage, UserRecord } from "../shared/session-types";

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

/** Helper to build a minimal UserRecord */
function makeUserRecord(): UserRecord {
  return {
    uuid: "u-user-1",
    parentUuid: "",
    timestamp: "2026-04-11T12:00:00Z",
    isSidechain: false,
    isMeta: false,
    permissionMode: null,
    toolResults: [],
    textPreview: "user message",
  };
}

/** Helper to build a minimal ParsedSession */
function makeSession(
  assistantMessages: AssistantRecord[],
  sessionId = "test-session-1",
  overrides: {
    projectKey?: string;
    firstMessage?: string;
    userMessages?: UserRecord[];
  } = {},
): ParsedSession {
  const userMessages = overrides.userMessages ?? [];
  return {
    meta: {
      sessionId,
      slug: "test",
      firstMessage: overrides.firstMessage ?? "hello world",
      firstTs: "2026-04-11T12:00:00Z",
      lastTs: "2026-04-11T12:30:00Z",
      sizeBytes: 1000,
      filePath: "/tmp/test.jsonl",
      projectKey: overrides.projectKey ?? "test-proj",
      cwd: "/tmp",
      version: "1.0",
      gitBranch: "main",
      entrypoint: "cli",
    },
    assistantMessages,
    userMessages,
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: assistantMessages.length + userMessages.length,
      assistantMessages: assistantMessages.length,
      userMessages: userMessages.length,
      systemEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      fileSnapshots: 0,
      sidechainMessages: 0,
    },
  };
}

describe("session-project-value", () => {
  describe("computeSessionProjectValue", () => {
    it("returns empty result for no sessions", () => {
      const result = computeSessionProjectValue([]);
      expect(result.byProject).toEqual([]);
      expect(result.topExpensive).toEqual([]);
      expect(result.topEfficient).toEqual([]);
      expect(result.avgTokensPerTurn).toBe(0);
      expect(result.avgOutputInputRatio).toBe(0);
    });

    it("aggregates per-project correctly", () => {
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreationTokens: 50 } }),
        makeAssistantRecord({ usage: { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 300, cacheCreationTokens: 100 } }),
      ], "s1", { projectKey: "proj-alpha", userMessages: [makeUserRecord(), makeUserRecord()] });

      const s2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 500, outputTokens: 200, cacheReadTokens: 100, cacheCreationTokens: 20 } }),
      ], "s2", { projectKey: "proj-alpha", userMessages: [makeUserRecord()] });

      const result = computeSessionProjectValue([s1, s2]);

      expect(result.byProject).toHaveLength(1);
      const proj = result.byProject[0];
      expect(proj.project).toBe("proj-alpha");
      expect(proj.sessions).toBe(2);
      // Total tokens = sum of all input + output + cacheRead + cacheCreation across all assistant messages
      expect(proj.tokens).toBe(1000 + 500 + 200 + 50 + 2000 + 1000 + 300 + 100 + 500 + 200 + 100 + 20);
    });

    it("sorts projects by cost descending", () => {
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "s1", { projectKey: "cheap-proj" });

      const s2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1_000_000, outputTokens: 500_000 } }),
      ], "s2", { projectKey: "expensive-proj" });

      const result = computeSessionProjectValue([s1, s2]);
      expect(result.byProject[0].project).toBe("expensive-proj");
      expect(result.byProject[1].project).toBe("cheap-proj");
    });

    it("computes average session depth (turns per session)", () => {
      // Session 1: 3 assistant + 2 user = 5 turns
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "s1", { projectKey: "proj-a", userMessages: [makeUserRecord(), makeUserRecord()] });

      // Session 2: 1 assistant + 1 user = 2 turns
      const s2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "s2", { projectKey: "proj-a", userMessages: [makeUserRecord()] });

      const result = computeSessionProjectValue([s1, s2]);
      // Average depth = (5 + 2) / 2 = 3.5
      expect(result.byProject[0].avgDepth).toBeCloseTo(3.5, 1);
    });

    it("returns top 10 most expensive sessions sorted by cost desc", () => {
      const sessions: ParsedSession[] = [];
      for (let i = 0; i < 15; i++) {
        sessions.push(
          makeSession([
            makeAssistantRecord({
              usage: { inputTokens: (i + 1) * 10000, outputTokens: (i + 1) * 5000 },
            }),
          ], `session-${i}`, { firstMessage: `Message ${i}` }),
        );
      }

      const result = computeSessionProjectValue(sessions);
      expect(result.topExpensive).toHaveLength(10);
      // Most expensive should be first (session-14 has highest tokens)
      expect(result.topExpensive[0].sessionId).toBe("session-14");
      expect(result.topExpensive[0].cost).toBeGreaterThan(result.topExpensive[1].cost);
    });

    it("truncates first message to ~100 chars in topExpensive", () => {
      const longMessage = "A".repeat(200);
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500 } }),
      ], "s1", { firstMessage: longMessage });

      const result = computeSessionProjectValue([s1]);
      expect(result.topExpensive[0].firstMessage.length).toBeLessThanOrEqual(103); // 100 + "..."
    });

    it("includes model and health score in topExpensive", () => {
      const s1 = makeSession([
        makeAssistantRecord({
          model: "claude-opus-4-6",
          usage: { inputTokens: 1000, outputTokens: 500 },
        }),
      ], "s1");

      const result = computeSessionProjectValue([s1]);
      expect(result.topExpensive[0].model).toBe("claude-opus-4-6");
      expect(["good", "fair", "poor"]).toContain(result.topExpensive[0].healthScore);
    });

    it("computes top efficient sessions correctly", () => {
      // High efficiency: many messages, few tokens
      const efficientSession = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 10, outputTokens: 5 } }),
        makeAssistantRecord({ usage: { inputTokens: 10, outputTokens: 5 } }),
        makeAssistantRecord({ usage: { inputTokens: 10, outputTokens: 5 } }),
      ], "efficient", {
        userMessages: [makeUserRecord(), makeUserRecord(), makeUserRecord(), makeUserRecord(), makeUserRecord()],
      });

      // Low efficiency: few messages, many tokens
      const inefficientSession = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 100000, outputTokens: 50000 } }),
        makeAssistantRecord({ usage: { inputTokens: 100000, outputTokens: 50000 } }),
        makeAssistantRecord({ usage: { inputTokens: 100000, outputTokens: 50000 } }),
      ], "inefficient", {
        userMessages: [makeUserRecord(), makeUserRecord(), makeUserRecord(), makeUserRecord(), makeUserRecord()],
      });

      const result = computeSessionProjectValue([efficientSession, inefficientSession]);
      expect(result.topEfficient[0].sessionId).toBe("efficient");
      expect(result.topEfficient[0].efficiency).toBeGreaterThan(result.topEfficient[1].efficiency);
    });

    it("excludes sessions with fewer than 5 messages from efficiency ranking", () => {
      // 4 messages total — should be excluded
      const shortSession = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 10, outputTokens: 5 } }),
        makeAssistantRecord({ usage: { inputTokens: 10, outputTokens: 5 } }),
      ], "short", {
        userMessages: [makeUserRecord(), makeUserRecord()],
      });

      // 5 messages — included
      const okSession = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
        makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } }),
      ], "ok", {
        userMessages: [makeUserRecord(), makeUserRecord()],
      });

      const result = computeSessionProjectValue([shortSession, okSession]);
      expect(result.topEfficient).toHaveLength(1);
      expect(result.topEfficient[0].sessionId).toBe("ok");
    });

    it("limits topEfficient to 5 results", () => {
      const sessions: ParsedSession[] = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(
          makeSession(
            Array(3).fill(null).map(() =>
              makeAssistantRecord({ usage: { inputTokens: (i + 1) * 100, outputTokens: (i + 1) * 50 } }),
            ),
            `s-${i}`,
            { userMessages: Array(3).fill(null).map(() => makeUserRecord()) },
          ),
        );
      }

      const result = computeSessionProjectValue(sessions);
      expect(result.topEfficient.length).toBeLessThanOrEqual(5);
    });

    it("computes avgTokensPerTurn correctly", () => {
      // Session with 2 assistant messages = 2 turns
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheCreationTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 300, cacheCreationTokens: 100 } }),
      ], "s1");

      const result = computeSessionProjectValue([s1]);
      // Total tokens = 1000+500+200+100 + 2000+1000+300+100 = 5200
      // 2 turns => 5200 / 2 = 2600
      expect(result.avgTokensPerTurn).toBeCloseTo(2600, 0);
    });

    it("computes avgOutputInputRatio correctly", () => {
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500 } }),
        makeAssistantRecord({ usage: { inputTokens: 2000, outputTokens: 1000 } }),
      ], "s1");

      const result = computeSessionProjectValue([s1]);
      // Total output = 1500, total input = 3000
      // Ratio = 1500 / 3000 = 0.5
      expect(result.avgOutputInputRatio).toBeCloseTo(0.5, 3);
    });

    it("handles sessions with zero tokens gracefully", () => {
      const s1 = makeSession([], "empty-session");
      const result = computeSessionProjectValue([s1]);

      expect(result.byProject).toHaveLength(1);
      expect(result.byProject[0].tokens).toBe(0);
      expect(result.byProject[0].cost).toBe(0);
      expect(result.avgTokensPerTurn).toBe(0);
      expect(result.avgOutputInputRatio).toBe(0);
    });

    it("computes health score based on tool errors", () => {
      // Session with many tool errors => poor
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500 } }),
      ], "s1");
      s1.counts.toolErrors = 15;

      const result = computeSessionProjectValue([s1]);
      expect(result.topExpensive[0].healthScore).toBe("poor");
    });

    it("computes health score as fair for moderate errors", () => {
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500 } }),
      ], "s1");
      s1.counts.toolErrors = 5;

      const result = computeSessionProjectValue([s1]);
      expect(result.topExpensive[0].healthScore).toBe("fair");
    });

    it("handles multiple projects correctly", () => {
      const s1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 500 } }),
      ], "s1", { projectKey: "project-a" });

      const s2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 2000, outputTokens: 1000 } }),
      ], "s2", { projectKey: "project-b" });

      const s3 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 3000, outputTokens: 1500 } }),
      ], "s3", { projectKey: "project-a" });

      const result = computeSessionProjectValue([s1, s2, s3]);
      expect(result.byProject).toHaveLength(2);

      const projA = result.byProject.find(p => p.project === "project-a")!;
      expect(projA.sessions).toBe(2);
    });
  });
});
