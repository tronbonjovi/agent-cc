// tests/tool-timeline.test.ts
//
// Tests for ToolTimeline tree-aware rendering helpers (flat-to-tree wave1 task004).
//
// Note on test scope: The task contract called for `tool-timeline.test.tsx`
// using React Testing Library, but the repo has no jsdom environment, no
// testing-library install, and the vitest config only globs `*.test.ts`.
// All existing client-component tests in this repo (e.g.
// `session-detail-sections.test.ts`) follow the same pattern: extract
// rendering logic into pure exported helpers and unit-test those. We do the
// same here so the new tests run inside the existing infra.
//
// The tested helpers are the load-bearing logic for tree-aware rendering:
// owner resolution, deterministic palette hashing, group building, and the
// existing filterTools (re-exercised under tree mode).

import { describe, it, expect } from "vitest";
import type {
  SessionTree,
  SessionTreeNode,
  SerializedSessionTreeForClient,
  ToolExecution,
} from "@shared/session-types";
import {
  filterTools,
  resolveToolOwner,
  colorClassForOwner,
  groupToolsByAssistantTurn,
  PALETTE,
  type ToolOwner,
} from "../client/src/components/analytics/sessions/ToolTimeline";

// ---------------------------------------------------------------------------
// Synthetic tree builders — minimal nodes only carrying the fields the helpers
// actually read. We deliberately do NOT round-trip through the real builder;
// the helpers must work against the wire shape (Map → Record).
// ---------------------------------------------------------------------------

interface MinimalNode {
  id: string;
  parentId: string | null;
  kind: SessionTreeNode["kind"];
  agentId?: string;
}

function makeWireTree(nodes: MinimalNode[]): SerializedSessionTreeForClient {
  const nodesById: Record<string, SessionTreeNode> = {};
  const subagentsByAgentId: Record<string, SessionTreeNode> = {};
  for (const n of nodes) {
    // Cast through unknown — we only need the fields the helpers touch.
    const node = {
      id: n.id,
      parentId: n.parentId,
      kind: n.kind,
      children: [],
      timestamp: "2026-04-12T00:00:00.000Z",
      selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      rollupCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
      ...(n.agentId ? { agentId: n.agentId } : {}),
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

function makeTool(callId: string, name: string, issuedByAssistantUuid: string, isError = false): ToolExecution {
  return {
    callId,
    name,
    filePath: null,
    command: null,
    pattern: null,
    timestamp: "2026-04-12T00:00:00.000Z",
    resultTimestamp: "2026-04-12T00:00:01.000Z",
    durationMs: 100,
    isError,
    isSidechain: false,
    issuedByAssistantUuid,
  };
}

// ---------------------------------------------------------------------------
// resolveToolOwner — walk parentId chain to session-root or subagent-root
// ---------------------------------------------------------------------------

describe("resolveToolOwner", () => {
  it("returns parent owner when issuing turn lives directly under session-root", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:turn-1", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tool = makeTool("call-1", "Read", "turn-1");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("session-root");
    expect(owner.agentId).toBeNull();
  });

  it("walks parentId chain across user-turn nodes to find session-root", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "user:u1", parentId: "session-root", kind: "user-turn" },
      { id: "asst:turn-1", parentId: "user:u1", kind: "assistant-turn" },
    ]);
    const tool = makeTool("call-1", "Read", "turn-1");
    expect(resolveToolOwner(tree, tool).kind).toBe("session-root");
  });

  it("returns subagent owner with agentId when issuing turn descends from subagent-root", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "subagent:agent-abc", parentId: "session-root", kind: "subagent-root", agentId: "agent-abc" },
      { id: "asst:sub-turn-1", parentId: "subagent:agent-abc", kind: "assistant-turn" },
    ]);
    const tool = makeTool("call-1", "Bash", "sub-turn-1");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("subagent-root");
    expect(owner.agentId).toBe("agent-abc");
  });

  it("defensively returns parent owner when issuing turn is missing from nodesById", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
    ]);
    const tool = makeTool("call-1", "Read", "ghost-uuid");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("session-root");
    expect(owner.agentId).toBeNull();
  });

  it("defensively returns parent owner when parentId chain is broken", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:orphan", parentId: "missing-parent", kind: "assistant-turn" },
    ]);
    const tool = makeTool("call-1", "Read", "orphan");
    expect(resolveToolOwner(tree, tool).kind).toBe("session-root");
  });
});

// ---------------------------------------------------------------------------
// colorClassForOwner — palette resolution; deterministic by agentId
// ---------------------------------------------------------------------------

describe("colorClassForOwner", () => {
  it("returns empty string (neutral / no tag) for session-root owners", () => {
    const owner: ToolOwner = { kind: "session-root", agentId: null };
    expect(colorClassForOwner(owner)).toBe("");
  });

  it("returns a non-empty palette class for subagent owners", () => {
    const owner: ToolOwner = { kind: "subagent-root", agentId: "agent-abc" };
    const cls = colorClassForOwner(owner);
    expect(cls.length).toBeGreaterThan(0);
    expect(PALETTE).toContain(cls);
  });

  it("returns the same color across calls for the same agentId (stability)", () => {
    const owner: ToolOwner = { kind: "subagent-root", agentId: "agent-xyz" };
    expect(colorClassForOwner(owner)).toBe(colorClassForOwner(owner));
  });

  it("can return distinct colors for different agentIds (palette has > 1 color)", () => {
    // We can't guarantee any two specific ids land on different palette entries
    // (hash collisions are possible in a small palette), but we CAN guarantee
    // that across many ids the palette is exercised non-trivially.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(colorClassForOwner({ kind: "subagent-root", agentId: `agent-${i}` }));
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(PALETTE.length).toBeGreaterThanOrEqual(6);
  });

  it("returns neutral when subagent owner has null agentId (defensive)", () => {
    const owner: ToolOwner = { kind: "subagent-root", agentId: null };
    expect(colorClassForOwner(owner)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// groupToolsByAssistantTurn — main rendering helper
// ---------------------------------------------------------------------------

describe("groupToolsByAssistantTurn", () => {
  it("returns a single ungrouped bucket when tree is undefined", () => {
    const tools = [
      makeTool("c1", "Read", "t1"),
      makeTool("c2", "Bash", "t2"),
    ];
    const groups = groupToolsByAssistantTurn(tools, undefined);
    expect(groups).toHaveLength(1);
    expect(groups[0].turnId).toBeNull();
    expect(groups[0].showHeader).toBe(false);
    expect(groups[0].tools).toHaveLength(2);
  });

  it("returns a single ungrouped bucket when tree is null", () => {
    const tools = [makeTool("c1", "Read", "t1")];
    const groups = groupToolsByAssistantTurn(tools, null);
    expect(groups).toHaveLength(1);
    expect(groups[0].turnId).toBeNull();
    expect(groups[0].showHeader).toBe(false);
  });

  it("groups tools under their issuing assistant turn when tree is provided", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:t1", parentId: "session-root", kind: "assistant-turn" },
      { id: "asst:t2", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "t1"),
      makeTool("c2", "Bash", "t2"),
    ];
    const groups = groupToolsByAssistantTurn(tools, tree);
    expect(groups).toHaveLength(2);
    expect(groups[0].turnId).toBe("asst:t1");
    expect(groups[0].showHeader).toBe(true);
    expect(groups[0].tools.map(t => t.callId)).toEqual(["c1"]);
    expect(groups[1].turnId).toBe("asst:t2");
    expect(groups[1].tools.map(t => t.callId)).toEqual(["c2"]);
  });

  it("keeps multiple tools from the same turn in the same group", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:t1", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "t1"),
      makeTool("c2", "Edit", "t1"),
      makeTool("c3", "Bash", "t1"),
    ];
    const groups = groupToolsByAssistantTurn(tools, tree);
    expect(groups).toHaveLength(1);
    expect(groups[0].tools.map(t => t.callId)).toEqual(["c1", "c2", "c3"]);
  });

  it("preserves chronological order when consecutive tools share a turn", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:t1", parentId: "session-root", kind: "assistant-turn" },
      { id: "asst:t2", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "t1"),
      makeTool("c2", "Read", "t2"),
      makeTool("c3", "Read", "t1"),
    ];
    const groups = groupToolsByAssistantTurn(tools, tree);
    // Three groups because t1 → t2 → t1 alternates; we group by run-length so
    // visual order matches chronology rather than reordering tools.
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.tools[0].callId)).toEqual(["c1", "c2", "c3"]);
  });

  it("groups distinct subagent-issued tools so caller can color them differently", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "subagent:a", parentId: "session-root", kind: "subagent-root", agentId: "agent-a" },
      { id: "subagent:b", parentId: "session-root", kind: "subagent-root", agentId: "agent-b" },
      { id: "asst:sa", parentId: "subagent:a", kind: "assistant-turn" },
      { id: "asst:sb", parentId: "subagent:b", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "sa"),
      makeTool("c2", "Read", "sb"),
    ];
    const groups = groupToolsByAssistantTurn(tools, tree);
    expect(groups).toHaveLength(2);
    // Owner attribution per group
    const ownerA = resolveToolOwner(tree, groups[0].tools[0]);
    const ownerB = resolveToolOwner(tree, groups[1].tools[0]);
    expect(ownerA.agentId).toBe("agent-a");
    expect(ownerB.agentId).toBe("agent-b");
    // Different palette colors for different agents in this construction
    // (50-trial guarantee in colorClassForOwner test ensures palette is used)
    expect(colorClassForOwner(ownerA)).not.toBe("");
    expect(colorClassForOwner(ownerB)).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// Filtering still works under tree mode
// ---------------------------------------------------------------------------

describe("filterTools + groupToolsByAssistantTurn", () => {
  it("filtering by name removes non-matching tools and groups still build correctly", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:t1", parentId: "session-root", kind: "assistant-turn" },
      { id: "asst:t2", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "t1"),
      makeTool("c2", "Bash", "t2"),
      makeTool("c3", "Read", "t2"),
    ];
    const filtered = filterTools(tools, { toolTypes: ["Read"] });
    expect(filtered.map(t => t.callId)).toEqual(["c1", "c3"]);

    const groups = groupToolsByAssistantTurn(filtered, tree);
    expect(groups).toHaveLength(2);
    expect(groups[0].turnId).toBe("asst:t1");
    expect(groups[0].tools.map(t => t.callId)).toEqual(["c1"]);
    expect(groups[1].turnId).toBe("asst:t2");
    expect(groups[1].tools.map(t => t.callId)).toEqual(["c3"]);
  });

  it("filtering by errorsOnly removes successful tools and surviving rows still attribute correctly", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "subagent:x", parentId: "session-root", kind: "subagent-root", agentId: "agent-x" },
      { id: "asst:t1", parentId: "session-root", kind: "assistant-turn" },
      { id: "asst:sx", parentId: "subagent:x", kind: "assistant-turn" },
    ]);
    const tools = [
      makeTool("c1", "Read", "t1", false),
      makeTool("c2", "Bash", "sx", true),
    ];
    const filtered = filterTools(tools, { errorsOnly: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].callId).toBe("c2");

    const owner = resolveToolOwner(tree, filtered[0]);
    expect(owner.kind).toBe("subagent-root");
    expect(owner.agentId).toBe("agent-x");
  });
});
