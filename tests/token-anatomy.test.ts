import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { computeTokenAnatomy, type TokenAnatomyResult, type TokenAnatomyCategory } from "../server/scanner/token-anatomy";
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
    model: "claude-opus-4-6",
    stopReason: "end_turn",
    usage: { ...defaultUsage, ...overrides.usage },
    toolCalls: overrides.toolCalls ?? [],
    hasThinking: overrides.hasThinking ?? false,
    textPreview: overrides.textPreview ?? "Hello",
  };
}

/** Helper to build a minimal ParsedSession */
function makeSession(assistantMessages: AssistantRecord[]): ParsedSession {
  return {
    meta: {
      sessionId: "test-session-1",
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

function zeroCategory(): TokenAnatomyCategory {
  return { tokens: 0, cost: 0 };
}

describe("token-anatomy", () => {
  describe("computeTokenAnatomy", () => {
    it("returns all zeros for empty sessions array", () => {
      const result = computeTokenAnatomy([]);
      expect(result.systemPrompt.tokens).toBe(0);
      expect(result.conversation.tokens).toBe(0);
      expect(result.toolExecution.tokens).toBe(0);
      expect(result.thinking.tokens).toBe(0);
      expect(result.cacheOverhead.tokens).toBe(0);
      expect(result.total.tokens).toBe(0);
      expect(result.total.cost).toBe(0);
    });

    it("returns all zeros for sessions with no assistant messages", () => {
      const session = makeSession([]);
      const result = computeTokenAnatomy([session]);
      expect(result.total.tokens).toBe(0);
    });

    it("estimates system prompt tokens from first message input spike", () => {
      // First message has a big input (system prompt + user msg)
      // Subsequent messages have smaller input (just user msg + context growth)
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 5000, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 1200, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 1100, outputTokens: 100 } }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      // Steady-state average is (1000+1200+1100)/3 = 1100
      // System prompt estimate: 5000 - 1100 = 3900
      expect(result.systemPrompt.tokens).toBe(3900);
      expect(result.systemPrompt.cost).toBeGreaterThan(0);
    });

    it("handles single-message sessions (no steady state to compare)", () => {
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 5000, outputTokens: 200 } }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      // With only 1 message, no steady-state baseline — system prompt stays 0
      expect(result.systemPrompt.tokens).toBe(0);
      // All input goes to conversation
      expect(result.conversation.tokens).toBe(5200);
    });

    it("categorizes tool call output tokens separately", () => {
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 1000, outputTokens: 500 },
          toolCalls: [{ id: "tc1", name: "Read", filePath: "/tmp/f.ts", command: null, pattern: null }],
          hasThinking: false,
        }),
        makeAssistantRecord({
          usage: { inputTokens: 1200, outputTokens: 300 },
          toolCalls: [],
          hasThinking: false,
        }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      // Message with tool calls: output tokens go to toolExecution
      // Message without tool calls: output tokens go to conversation
      expect(result.toolExecution.tokens).toBe(500);
      expect(result.conversation.tokens).toBeGreaterThan(0);
    });

    it("categorizes thinking message output tokens separately", () => {
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 1000, outputTokens: 800 },
          hasThinking: true,
          toolCalls: [],
        }),
        makeAssistantRecord({
          usage: { inputTokens: 1200, outputTokens: 200 },
          hasThinking: false,
          toolCalls: [],
        }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      // Thinking message output goes to thinking category
      expect(result.thinking.tokens).toBe(800);
    });

    it("tracks cache creation tokens as overhead", () => {
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 1000, outputTokens: 100, cacheCreationTokens: 3000 },
        }),
        makeAssistantRecord({
          usage: { inputTokens: 1100, outputTokens: 100, cacheCreationTokens: 500 },
        }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      expect(result.cacheOverhead.tokens).toBe(3500);
      expect(result.cacheOverhead.cost).toBeGreaterThan(0);
    });

    it("total equals sum of all categories", () => {
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 5000, outputTokens: 500, cacheCreationTokens: 1000 },
          toolCalls: [{ id: "tc1", name: "Bash", filePath: null, command: "ls", pattern: null }],
          hasThinking: false,
        }),
        makeAssistantRecord({
          usage: { inputTokens: 1000, outputTokens: 300, cacheCreationTokens: 200 },
          toolCalls: [],
          hasThinking: true,
        }),
        makeAssistantRecord({
          usage: { inputTokens: 1200, outputTokens: 200, cacheCreationTokens: 0 },
          toolCalls: [],
          hasThinking: false,
        }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      const sumTokens =
        result.systemPrompt.tokens +
        result.conversation.tokens +
        result.toolExecution.tokens +
        result.thinking.tokens +
        result.cacheOverhead.tokens;
      expect(result.total.tokens).toBe(sumTokens);

      const sumCost =
        result.systemPrompt.cost +
        result.conversation.cost +
        result.toolExecution.cost +
        result.thinking.cost +
        result.cacheOverhead.cost;
      // Floating point — close enough
      expect(result.total.cost).toBeCloseTo(sumCost, 10);
    });

    it("aggregates across multiple sessions", () => {
      const session1 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 5000, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 100 } }),
      ]);
      const session2 = makeSession([
        makeAssistantRecord({ usage: { inputTokens: 3000, outputTokens: 200 } }),
        makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 200 } }),
      ]);
      const result = computeTokenAnatomy([session1, session2]);

      // Both sessions contribute to totals
      expect(result.total.tokens).toBeGreaterThan(0);
      // System prompt: session1 = 5000 - 1000 = 4000, session2 = 3000 - 1000 = 2000 => 6000
      expect(result.systemPrompt.tokens).toBe(6000);
    });

    it("clamps system prompt estimate at zero (no negative values)", () => {
      // Edge case: first message input is LESS than steady-state average
      // (this can happen if first message is short and later context grows)
      const msgs = [
        makeAssistantRecord({ usage: { inputTokens: 500, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 2000, outputTokens: 100 } }),
        makeAssistantRecord({ usage: { inputTokens: 3000, outputTokens: 100 } }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      expect(result.systemPrompt.tokens).toBe(0);
    });

    it("computes costs using pricing for the model", () => {
      const msgs = [
        makeAssistantRecord({
          usage: { inputTokens: 1_000_000, outputTokens: 0 },
          model: "claude-opus-4-6",
        }),
      ];
      const session = makeSession(msgs);
      const result = computeTokenAnatomy([session]);

      // Opus 4.6 input = $5/million
      // 1M input tokens = $5.00
      expect(result.total.cost).toBeCloseTo(5.0, 1);
    });
  });

  // ---------------------------------------------------------------------
  // SessionTree migration (flat-to-tree wave3)
  // ---------------------------------------------------------------------
  describe("computeTokenAnatomy with SessionTree", () => {
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
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acc-tokanat-tree-"));
      const projectDir = path.join(tmpRoot, "-home-user-projects-demo");
      parentFilePath = copyFixtureInto(projectDir);
      sessionParseCache.invalidateAll();
    });

    afterEach(() => {
      sessionParseCache.invalidateAll();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    /** Compute parent-only token totals from the flat assistantMessages array. */
    function parentOnlyTokenTotal(parsed: ParsedSession): number {
      let total = 0;
      for (const msg of parsed.assistantMessages) {
        total +=
          msg.usage.inputTokens +
          msg.usage.outputTokens +
          msg.usage.cacheReadTokens +
          msg.usage.cacheCreationTokens;
      }
      return total;
    }

    it("includes subagent spend in token totals", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();
      const tree = sessionParseCache.getTreeById(parsed!.meta.sessionId)!;
      expect(tree).not.toBeNull();
      expect(tree.totals.subagents).toBeGreaterThan(0);

      const anatomy = computeTokenAnatomy([parsed!]);

      // Tree path must count more tokens than the parent-only flat path —
      // the fixture invariant guarantees every subagent contributes usage.
      const parentOnly = parentOnlyTokenTotal(parsed!);
      expect(anatomy.total.tokens).toBeGreaterThan(parentOnly);
    });

    it("applies per-subagent system-prompt estimation", () => {
      const parsed = parseSessionAndBuildTree(parentFilePath, "-home-user-projects-demo");
      expect(parsed).not.toBeNull();

      // Prime a second, tree-less ParsedSession to compare against the
      // parent-only estimate: same input data but no subagents wired up.
      const flatOnly: ParsedSession = {
        ...parsed!,
        meta: { ...parsed!.meta, sessionId: "flat-copy-no-tree" },
      };
      // Tree for "flat-copy-no-tree" is not in cache → flat fallback.
      expect(sessionParseCache.getTreeById("flat-copy-no-tree")).toBeNull();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const flatAnatomy = computeTokenAnatomy([flatOnly]);
      const treeAnatomy = computeTokenAnatomy([parsed!]);

      // Each subagent session has its own first-message spike, so the tree
      // path's system-prompt token estimate must be >= the flat path's.
      expect(treeAnatomy.systemPrompt.tokens).toBeGreaterThanOrEqual(
        flatAnatomy.systemPrompt.tokens,
      );
      // And the tree path's total tokens must exceed the flat path's.
      expect(treeAnatomy.total.tokens).toBeGreaterThan(flatAnatomy.total.tokens);
      warnSpy.mockRestore();
    });

    it("falls back gracefully when tree is null", () => {
      // Build a flat ParsedSession with no cached tree.
      const flat: ParsedSession = {
        meta: {
          sessionId: "no-tree-anatomy",
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
          makeAssistantRecord({ usage: { inputTokens: 5000, outputTokens: 100 } }),
          makeAssistantRecord({ usage: { inputTokens: 1000, outputTokens: 100 } }),
          makeAssistantRecord({ usage: { inputTokens: 1100, outputTokens: 100 } }),
        ],
        userMessages: [],
        systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
        toolTimeline: [],
        fileSnapshots: [],
        lifecycle: [],
        conversationTree: [],
        counts: {
          totalRecords: 3,
          assistantMessages: 3,
          userMessages: 0,
          systemEvents: 0,
          toolCalls: 0,
          toolErrors: 0,
          fileSnapshots: 0,
          sidechainMessages: 0,
        },
      };

      expect(sessionParseCache.getTreeById("no-tree-anatomy")).toBeNull();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = computeTokenAnatomy([flat]);

      // System prompt estimate: first (5000) - avg(1000, 1100) = 3950
      expect(result.systemPrompt.tokens).toBe(3950);
      // Parent-only total = 5000+100 + 1000+100 + 1100+100 = 7400
      expect(result.total.tokens).toBe(7400);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
