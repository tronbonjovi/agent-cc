// tests/session-overview.test.ts
//
// Tests for SessionOverview tree-aware helpers (flat-to-tree wave2 task002).
//
// Note on test scope: Following the same pattern as `tool-timeline.test.ts`
// from wave1, we extract the rendering math into pure exported helpers and
// unit-test those. The repo has no jsdom env, no testing-library install, and
// vitest globs `tests/**/*.test.ts` only — so this is a plain `.test.ts` file
// that imports the pure helpers directly.
//
// The two helpers under test:
//   - computeModelBreakdownFromTree(tree, fallbackAssistantMessages)
//     → walks the tree's assistant-turn nodes when present (surfacing
//       subagent-only models), or falls back to the flat assistantMessages
//       array when tree is null/undefined (today's pre-tree behavior).
//   - computeSubagentChips(tree)
//     → builds one chip per subagent for the new "Subagents" row, sorted by
//       cost descending, with palette colors from `colorClassForOwner`.

import { describe, it, expect } from "vitest";
import type {
  SessionTreeNode,
  SerializedSessionTreeForClient,
  AssistantRecord,
} from "@shared/session-types";
import {
  computeModelBreakdownFromTree,
  computeSubagentChips,
} from "../client/src/components/analytics/sessions/SessionOverview";
import { colorClassForOwner } from "../client/src/components/analytics/sessions/subagent-colors";

// ---------------------------------------------------------------------------
// Synthetic tree fixture builder. Mirrors the wave1 `tool-timeline.test.ts`
// pattern: a minimal wire-shape tree with only the fields the helpers read.
// We deliberately do NOT round-trip through the real builder.
// ---------------------------------------------------------------------------

interface MinimalNode {
  id: string;
  parentId: string | null;
  kind: SessionTreeNode["kind"];
  agentId?: string;
  agentType?: string;
  model?: string;
  rollupCost?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    durationMs: number;
  };
}

function makeWireTree(nodes: MinimalNode[]): SerializedSessionTreeForClient {
  const nodesById: Record<string, SessionTreeNode> = {};
  const subagentsByAgentId: Record<string, SessionTreeNode> = {};
  for (const n of nodes) {
    const node = {
      id: n.id,
      parentId: n.parentId,
      kind: n.kind,
      children: [],
      timestamp: "2026-04-12T00:00:00.000Z",
      selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      rollupCost: n.rollupCost ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      ...(n.agentId ? { agentId: n.agentId } : {}),
      ...(n.agentType ? { agentType: n.agentType } : {}),
      ...(n.model ? { model: n.model } : {}),
    } as unknown as SessionTreeNode;
    nodesById[n.id] = node;
    if (n.kind === "subagent-root" && n.agentId) {
      subagentsByAgentId[n.agentId] = node;
    }
  }
  return {
    root: nodesById["session-root"]!,
    nodesById,
    subagentsByAgentId: subagentsByAgentId as Record<string, SessionTreeNode>,
    totals: {
      assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      costUsd: 0, durationMs: 0,
    },
    warnings: [],
  };
}

// Shared fixture used across most tests:
//   - 1 parent session-root
//   - 1 parent assistant-turn (model: claude-sonnet-4-6)
//   - 2 subagent-root nodes:
//       explore-01    (Explore)        cheaper
//       rapid-proto-02 (Rapid Prototyper) more expensive
//   - 1 subagent assistant-turn under each, with distinct models
const fixture: SerializedSessionTreeForClient = makeWireTree([
  { id: "session-root", parentId: null, kind: "session-root" },
  {
    id: "asst:parent-1",
    parentId: "session-root",
    kind: "assistant-turn",
    model: "claude-sonnet-4-6",
  },
  {
    id: "subagent:explore-01",
    parentId: "session-root",
    kind: "subagent-root",
    agentId: "explore-01",
    agentType: "Explore",
    rollupCost: {
      inputTokens: 5_000,
      outputTokens: 3_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0.12,
      durationMs: 0,
    },
  },
  {
    id: "asst:explore-1-turn-1",
    parentId: "subagent:explore-01",
    kind: "assistant-turn",
    model: "claude-haiku-4-5",
  },
  {
    id: "subagent:rapid-proto-02",
    parentId: "session-root",
    kind: "subagent-root",
    agentId: "rapid-proto-02",
    agentType: "Rapid Prototyper",
    rollupCost: {
      inputTokens: 12_000,
      outputTokens: 7_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0.42,
      durationMs: 0,
    },
  },
  {
    id: "asst:rapid-proto-2-turn-1",
    parentId: "subagent:rapid-proto-02",
    kind: "assistant-turn",
    model: "claude-opus-4-6",
  },
]);

// Minimal AssistantRecord builder for the flat fallback path.
function makeAssistantRecord(model: string): AssistantRecord {
  return {
    uuid: `uuid-${model}`,
    parentUuid: "",
    timestamp: "2026-04-12T00:00:00.000Z",
    requestId: "req-1",
    isSidechain: false,
    model,
    stopReason: "end_turn",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "default",
      inferenceGeo: "",
      speed: "",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    toolCalls: [],
    hasThinking: false,
    textPreview: "",
  };
}

// ---------------------------------------------------------------------------
// computeModelBreakdownFromTree
// ---------------------------------------------------------------------------

describe("computeModelBreakdownFromTree", () => {
  it("returns a map including subagent-only models when tree is provided", () => {
    const map = computeModelBreakdownFromTree(fixture, []);
    expect(map.get("claude-sonnet-4-6")).toBe(1);
    expect(map.get("claude-haiku-4-5")).toBe(1);
    expect(map.get("claude-opus-4-6")).toBe(1);
  });

  it("returns the flat fallback breakdown when tree is null", () => {
    const flatMessages: AssistantRecord[] = [
      makeAssistantRecord("claude-sonnet-4-6"),
    ];
    const map = computeModelBreakdownFromTree(null, flatMessages);
    expect(map.size).toBe(1);
    expect(map.get("claude-sonnet-4-6")).toBe(1);
    expect(map.has("claude-haiku-4-5")).toBe(false);
  });

  it("matches the null case when tree is undefined", () => {
    const flatMessages: AssistantRecord[] = [
      makeAssistantRecord("claude-sonnet-4-6"),
    ];
    const map = computeModelBreakdownFromTree(undefined, flatMessages);
    expect(map.size).toBe(1);
    expect(map.get("claude-sonnet-4-6")).toBe(1);
    expect(map.has("claude-haiku-4-5")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeSubagentChips
// ---------------------------------------------------------------------------

describe("computeSubagentChips", () => {
  it("returns one chip per subagent (length 2 with the shared fixture)", () => {
    const chips = computeSubagentChips(fixture);
    expect(chips).toHaveLength(2);
  });

  it("populates the expected fields on each chip", () => {
    const chips = computeSubagentChips(fixture);
    const first = chips[0];
    expect(first.agentId).toBeTypeOf("string");
    expect(first.agentType).toBeTypeOf("string");
    expect(first.costUsd).toBeTypeOf("number");
    expect(first.totalTokens).toBeTypeOf("number");
    expect(first.colorClass).toBeTypeOf("string");
    // The most-expensive subagent should be first (rapid-proto-02 from fixture)
    expect(first.agentId).toBe("rapid-proto-02");
    expect(first.agentType).toBe("Rapid Prototyper");
    expect(first.costUsd).toBe(0.42);
    // totalTokens = inputTokens + outputTokens for rapid-proto-02 = 12000 + 7000
    expect(first.totalTokens).toBe(19_000);
  });

  it("sorts chips by costUsd descending", () => {
    const chips = computeSubagentChips(fixture);
    expect(chips[0].costUsd).toBeGreaterThanOrEqual(chips[1].costUsd);
    expect(chips[0].agentId).toBe("rapid-proto-02");
    expect(chips[1].agentId).toBe("explore-01");
  });

  it("derives colorClass from colorClassForOwner with a subagent-root owner", () => {
    const chips = computeSubagentChips(fixture);
    expect(chips[0].colorClass).toBe(
      colorClassForOwner({ kind: "subagent-root", agentId: chips[0].agentId }),
    );
    expect(chips[1].colorClass).toBe(
      colorClassForOwner({ kind: "subagent-root", agentId: chips[1].agentId }),
    );
  });

  it("returns [] when tree is null", () => {
    expect(computeSubagentChips(null)).toEqual([]);
  });

  it("returns [] when tree is undefined", () => {
    expect(computeSubagentChips(undefined)).toEqual([]);
  });

  it("returns [] when tree has no subagents", () => {
    const treeWithNoSubagents = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      {
        id: "asst:parent-1",
        parentId: "session-root",
        kind: "assistant-turn",
        model: "claude-sonnet-4-6",
      },
    ]);
    expect(computeSubagentChips(treeWithNoSubagents)).toEqual([]);
  });
});
