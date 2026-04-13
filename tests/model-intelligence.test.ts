import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { computeModelIntelligence, type ModelIntelligenceRow } from "../server/scanner/model-intelligence";
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

    it("groups messages with model: undefined under 'unknown'", () => {
      const base1 = makeAssistantRecord({ usage: { inputTokens: 500, outputTokens: 200 } });
      const base2 = makeAssistantRecord({ usage: { inputTokens: 300, outputTokens: 100 } });
      // Override model to undefined after construction to bypass ?? default
      const msg1 = { ...base1, model: undefined as unknown as string };
      const msg2 = { ...base2, model: undefined as unknown as string };
      const session = makeSession([msg1, msg2]);
      const result = computeModelIntelligence([session]);

      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("unknown");
      expect(result[0].inputTokens).toBe(800);
      expect(result[0].outputTokens).toBe(300);
    });

    it("groups messages with model: '<synthetic>' under 'unknown'", () => {
      const msgs = [
        makeAssistantRecord({
          model: "<synthetic>",
          usage: { inputTokens: 400, outputTokens: 150 },
        }),
        makeAssistantRecord({
          model: "<synthetic>",
          usage: { inputTokens: 600, outputTokens: 250 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeModelIntelligence([session]);

      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("unknown");
      expect(result[0].inputTokens).toBe(1000);
      expect(result[0].outputTokens).toBe(400);
    });

    it("merges undefined and <synthetic> models into the same 'unknown' bucket", () => {
      const base = makeAssistantRecord({ usage: { inputTokens: 100, outputTokens: 50 } });
      const undefinedMsg = { ...base, model: undefined as unknown as string };
      const syntheticMsg = makeAssistantRecord({
        model: "<synthetic>",
        usage: { inputTokens: 200, outputTokens: 100 },
      });
      const session = makeSession([undefinedMsg, syntheticMsg]);
      const result = computeModelIntelligence([session]);

      expect(result).toHaveLength(1);
      expect(result[0].model).toBe("unknown");
      expect(result[0].inputTokens).toBe(300);
      expect(result[0].outputTokens).toBe(150);
    });
  });

  // ---------------------------------------------------------------------
  // SessionTree migration (flat-to-tree wave3)
  // ---------------------------------------------------------------------
  describe("computeModelIntelligence with SessionTree", () => {
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
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acc-modint-tree-"));
      const projectDir = path.join(tmpRoot, "-home-user-projects-demo");
      parentFilePath = copyFixtureInto(projectDir);
      sessionParseCache.invalidateAll();
    });

    afterEach(() => {
      sessionParseCache.invalidateAll();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it("includes subagent spend in per-model token sums", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();
      const tree = sessionParseCache.getTreeById(parsed!.meta.sessionId)!;
      expect(tree).not.toBeNull();
      expect(tree.totals.subagents).toBeGreaterThan(0);

      // Tree-less twin for parity compare.
      const flatCopy: ParsedSession = {
        ...parsed!,
        meta: { ...parsed!.meta, sessionId: "no-tree-modint" },
      };
      expect(sessionParseCache.getTreeById("no-tree-modint")).toBeNull();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const flatRows = computeModelIntelligence([flatCopy]);
      const treeRows = computeModelIntelligence([parsed!]);

      // Sum input tokens across all rows for each path.
      const sumInput = (rows: ModelIntelligenceRow[]) =>
        rows.reduce((acc, r) => acc + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheCreationTokens, 0);

      // Fixture invariant: subagents add meaningful usage. Tree path must
      // strictly exceed the flat-only path's total per-model token sum.
      expect(sumInput(treeRows)).toBeGreaterThan(sumInput(flatRows));

      // Every row must still have sessions >= 1 (session attribution intact).
      for (const row of treeRows) {
        expect(row.sessions).toBeGreaterThanOrEqual(1);
      }
      warnSpy.mockRestore();
    });

    it("attributes subagent turns to the parent session for the 'sessions' count", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();

      const rows = computeModelIntelligence([parsed!]);

      // Only one input session was passed, so no model row may report more
      // than one distinct session — subagents don't create new sessionIds.
      for (const row of rows) {
        expect(row.sessions).toBe(1);
      }
    });

    it("falls back gracefully when tree is null", () => {
      const flat: ParsedSession = {
        meta: {
          sessionId: "no-tree-modint-fallback",
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
          makeAssistantRecord({
            model: "claude-sonnet-4-20250514",
            usage: { inputTokens: 1000, outputTokens: 500 },
          }),
        ],
        userMessages: [],
        systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
        toolTimeline: [],
        fileSnapshots: [],
        lifecycle: [],
        conversationTree: [],
        counts: {
          totalRecords: 1,
          assistantMessages: 1,
          userMessages: 0,
          systemEvents: 0,
          toolCalls: 0,
          toolErrors: 0,
          fileSnapshots: 0,
          sidechainMessages: 0,
        },
      };

      expect(sessionParseCache.getTreeById("no-tree-modint-fallback")).toBeNull();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const rows = computeModelIntelligence([flat]);

      expect(rows).toHaveLength(1);
      expect(rows[0].model).toBe("claude-sonnet-4-20250514");
      expect(rows[0].inputTokens).toBe(1000);
      expect(rows[0].outputTokens).toBe(500);
      expect(rows[0].sessions).toBe(1);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
