import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { computeCacheEfficiency, type CacheEfficiencyResult } from "../server/scanner/cache-efficiency";
import {
  parseSessionAndBuildTree,
  sessionParseCache,
} from "../server/scanner/session-scanner";
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

  // ---------------------------------------------------------------------
  // SessionTree migration (flat-to-tree wave3)
  // ---------------------------------------------------------------------
  describe("computeCacheEfficiency with SessionTree", () => {
    const FIXTURE_DIR = path.resolve(__dirname, "fixtures/session-hierarchy");
    const SUB_IDS = [
      "b1111111111111111",
      "b2222222222222222",
      "b3333333333333333",
      "b4444444444444444",
      "b5555555555555555",
    ];
    let tmpRoot: string;
    let parentFilePath: string;

    function copyFixtureInto(destProjectDir: string): string {
      const subagentsDest = path.join(destProjectDir, "parent", "subagents");
      fs.mkdirSync(subagentsDest, { recursive: true });
      fs.copyFileSync(
        path.join(FIXTURE_DIR, "parent.jsonl"),
        path.join(destProjectDir, "parent.jsonl"),
      );
      for (const id of SUB_IDS) {
        fs.copyFileSync(
          path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.jsonl`),
          path.join(subagentsDest, `agent-${id}.jsonl`),
        );
        fs.copyFileSync(
          path.join(FIXTURE_DIR, "parent", "subagents", `agent-${id}.meta.json`),
          path.join(subagentsDest, `agent-${id}.meta.json`),
        );
      }
      return path.join(destProjectDir, "parent.jsonl");
    }

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acc-cache-tree-"));
      const projectDir = path.join(tmpRoot, "-home-user-projects-demo");
      parentFilePath = copyFixtureInto(projectDir);
      sessionParseCache.invalidateAll();
    });

    afterEach(() => {
      sessionParseCache.invalidateAll();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it("counts subagent first-messages in the first-message bucket", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();
      const tree = sessionParseCache.getTreeById(parsed!.meta.sessionId)!;
      expect(tree).not.toBeNull();
      expect(tree.totals.subagents).toBeGreaterThan(0);

      // Tree-less twin for parity compare: same data, different sessionId so
      // cache lookup returns null and the flat fallback path runs.
      const flatCopy: ParsedSession = {
        ...parsed!,
        meta: { ...parsed!.meta, sessionId: "no-tree-cache" },
      };
      expect(sessionParseCache.getTreeById("no-tree-cache")).toBeNull();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const flatResult = computeCacheEfficiency([flatCopy]);
      const treeResult = computeCacheEfficiency([parsed!]);

      // Tree path adds N subagent first-messages into the bucket — the
      // flat/tree averages therefore must differ (subagent first-msg input
      // tokens will not coincidentally equal the parent's).
      expect(treeResult.firstMessageAvgInput).not.toBe(flatResult.firstMessageAvgInput);

      // Curve stays bounded at 20 and populated.
      expect(treeResult.messageCurve.length).toBeGreaterThan(0);
      expect(treeResult.messageCurve.length).toBeLessThanOrEqual(20);

      warnSpy.mockRestore();
    });

    it("adds subagent cache spend to creation cost / read savings", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();

      const flatCopy: ParsedSession = {
        ...parsed!,
        meta: { ...parsed!.meta, sessionId: "no-tree-cache2" },
      };
      expect(sessionParseCache.getTreeById("no-tree-cache2")).toBeNull();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const flatResult = computeCacheEfficiency([flatCopy]);
      const treeResult = computeCacheEfficiency([parsed!]);

      // Fixture subagents may not carry cache-creation / cache-read tokens,
      // so this stays a >= regression guard (never regresses below parent-only).
      expect(treeResult.cacheCreationCost).toBeGreaterThanOrEqual(
        flatResult.cacheCreationCost,
      );
      expect(treeResult.cacheReadSavings).toBeGreaterThanOrEqual(
        flatResult.cacheReadSavings,
      );
      warnSpy.mockRestore();
    });

    it("falls back gracefully when tree is null", () => {
      const flat: ParsedSession = {
        meta: {
          sessionId: "no-tree-cache-fallback",
          slug: "x",
          firstMessage: "hi",
          firstTs: "2026-04-11T12:00:00Z",
          lastTs: "2026-04-11T12:30:00Z",
          sizeBytes: 0,
          filePath: "/tmp/x.jsonl",
          projectKey: "p",
          cwd: "/tmp",
          version: "1.0",
          gitBranch: "main",
          entrypoint: "cli",
        },
        assistantMessages: [
          makeAssistantRecord({ usage: { inputTokens: 200, cacheReadTokens: 800 } }),
          makeAssistantRecord({ usage: { inputTokens: 200, cacheReadTokens: 800 } }),
        ],
        userMessages: [],
        systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
        toolTimeline: [],
        fileSnapshots: [],
        lifecycle: [],
        conversationTree: [],
        counts: {
          totalRecords: 2,
          assistantMessages: 2,
          userMessages: 0,
          systemEvents: 0,
          toolCalls: 0,
          toolErrors: 0,
          fileSnapshots: 0,
          sidechainMessages: 0,
        },
      };

      expect(sessionParseCache.getTreeById("no-tree-cache-fallback")).toBeNull();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = computeCacheEfficiency([flat]);

      // Legacy path: hitRate = 1600 / (400 + 1600) * 100 = 80%
      expect(result.hitRate).toBeCloseTo(80, 1);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
