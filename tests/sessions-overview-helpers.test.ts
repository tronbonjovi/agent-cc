import { describe, it, expect } from "vitest";
import { computeCostFromTree } from "@/components/analytics/sessions/SessionOverview";
import type {
  ParsedSession,
  SerializedSessionTreeForClient,
} from "@shared/session-types";

function makeParsed(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    meta: {} as ParsedSession["meta"],
    assistantMessages: [],
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: 0, assistantMessages: 0, userMessages: 0, systemEvents: 0,
      toolCalls: 0, toolErrors: 0, fileSnapshots: 0, sidechainMessages: 0,
    },
    ...overrides,
  };
}

describe("computeCostFromTree", () => {
  it("prefers tree.totals when tree is present", () => {
    const tree = {
      root: { kind: "session-root", id: "root" } as any,
      nodesById: {},
      subagentsByAgentId: {},
      totals: {
        assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
        inputTokens: 1000, outputTokens: 500,
        cacheReadTokens: 200, cacheCreationTokens: 100,
        costUsd: 1.23, durationMs: 0,
      },
      warnings: [],
    } as unknown as SerializedSessionTreeForClient;

    const parsed = makeParsed();
    const result = computeCostFromTree(tree, parsed);
    expect(result.costUsd).toBe(1.23);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
    expect(result.cacheReadTokens).toBe(200);
    expect(result.cacheCreationTokens).toBe(100);
  });

  it("falls back to summing parsed.assistantMessages when tree is null", () => {
    const parsed = makeParsed({
      assistantMessages: [
        { uuid: "1", parentUuid: "", timestamp: "", requestId: "", isSidechain: false,
          model: "claude-sonnet", stopReason: "end_turn", toolCalls: [], hasThinking: false, textPreview: "",
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheCreationTokens: 10,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } } },
        { uuid: "2", parentUuid: "1", timestamp: "", requestId: "", isSidechain: false,
          model: "claude-sonnet", stopReason: "end_turn", toolCalls: [], hasThinking: false, textPreview: "",
          usage: { inputTokens: 200, outputTokens: 75, cacheReadTokens: 40, cacheCreationTokens: 0,
                   serviceTier: "", inferenceGeo: "", speed: "",
                   serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 } } },
      ] as ParsedSession["assistantMessages"],
    });
    const result = computeCostFromTree(null, parsed);
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(125);
    expect(result.cacheReadTokens).toBe(60);
    expect(result.cacheCreationTokens).toBe(10);
    // Flat path returns 0 cost — no per-message cost field on AssistantRecord.
    expect(result.costUsd).toBe(0);
  });

  it("returns zeros for empty input", () => {
    const result = computeCostFromTree(null, makeParsed());
    expect(result).toEqual({
      costUsd: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0,
    });
  });
});
