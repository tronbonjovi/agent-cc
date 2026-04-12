// tests/subagent-colors.test.ts
//
// Tests for the extracted subagent-colors module (flat-to-tree wave2 task001).
//
// This module is the shared home for the palette + owner-resolution helpers
// that previously lived inline in ToolTimeline.tsx. The four originals
// (PALETTE, ToolOwner, colorClassForOwner, resolveToolOwner) are moved
// unchanged from ToolTimeline.tsx, plus a new resolveAssistantTurnOwner
// helper used by TokenBreakdown in task003.
//
// Same plain-vitest pattern as tests/tool-timeline.test.ts: pure-function
// assertions, no React, no jsdom, no testing-library. Synthetic wire trees
// constructed inline so each case stays self-contained.

import { describe, it, expect } from "vitest";
import type {
  SessionTreeNode,
  SerializedSessionTreeForClient,
  ToolExecution,
} from "@shared/session-types";
import {
  PALETTE,
  colorClassForOwner,
  resolveToolOwner,
  resolveAssistantTurnOwner,
  type ToolOwner,
} from "../client/src/components/analytics/sessions/subagent-colors";

// ---------------------------------------------------------------------------
// Synthetic tree builders — minimal nodes carrying only the fields the helpers
// actually read. We construct against the wire shape (Record<id, node>).
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
    subagentsByAgentId,
    totals: {
      assistantTurns: 0, userTurns: 0, toolCalls: 0, toolErrors: 0, subagents: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      costUsd: 0, durationMs: 0,
    },
    warnings: [],
  };
}

function makeTool(callId: string, name: string, issuedByAssistantUuid: string): ToolExecution {
  return {
    callId,
    name,
    filePath: null,
    command: null,
    pattern: null,
    timestamp: "2026-04-12T00:00:00.000Z",
    resultTimestamp: "2026-04-12T00:00:01.000Z",
    durationMs: 100,
    isError: false,
    isSidechain: false,
    issuedByAssistantUuid,
  };
}

// Shared fixture for resolveToolOwner / resolveAssistantTurnOwner tests that
// need a tree with both a parent assistant turn and a subagent's child turn.
function makeMixedTree(): SerializedSessionTreeForClient {
  return makeWireTree([
    { id: "session-root", parentId: null, kind: "session-root" },
    { id: "asst:parent-turn", parentId: "session-root", kind: "assistant-turn" },
    { id: "subagent:explore-01", parentId: "session-root", kind: "subagent-root", agentId: "explore-01" },
    { id: "asst:sub-turn", parentId: "subagent:explore-01", kind: "assistant-turn" },
  ]);
}

// ---------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------

describe("PALETTE", () => {
  it("has 6 entries and each is a non-empty string", () => {
    expect(PALETTE).toHaveLength(6);
    for (const entry of PALETTE) {
      expect(typeof entry).toBe("string");
      expect(entry.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// colorClassForOwner
// ---------------------------------------------------------------------------

describe("colorClassForOwner", () => {
  it("returns empty string for session-root owners", () => {
    const owner: ToolOwner = { kind: "session-root", agentId: null };
    expect(colorClassForOwner(owner)).toBe("");
  });

  it("returns a palette entry for subagent-root owners", () => {
    const owner: ToolOwner = { kind: "subagent-root", agentId: "explore-01" };
    const cls = colorClassForOwner(owner);
    expect(PALETTE).toContain(cls);
  });

  it("is deterministic — same agentId returns the same color across calls", () => {
    const owner: ToolOwner = { kind: "subagent-root", agentId: "explore-01" };
    expect(colorClassForOwner(owner)).toBe(colorClassForOwner(owner));
  });

  it("spreads different agentIds across the palette (>= 3 distinct entries from 12 ids)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(colorClassForOwner({ kind: "subagent-root", agentId: `agent-${i}` }));
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// resolveToolOwner
// ---------------------------------------------------------------------------

describe("resolveToolOwner", () => {
  it("returns session-root owner for a parent-issued tool", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
      { id: "asst:parent-turn", parentId: "session-root", kind: "assistant-turn" },
    ]);
    const tool = makeTool("call-1", "Read", "parent-turn");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("session-root");
  });

  it("returns subagent-root owner with agentId for a subagent-issued tool", () => {
    const tree = makeMixedTree();
    const tool = makeTool("call-1", "Bash", "sub-turn");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("subagent-root");
    expect(owner.agentId).toBe("explore-01");
  });

  it("defensively returns session-root when issuing turn is missing from nodesById", () => {
    const tree = makeWireTree([
      { id: "session-root", parentId: null, kind: "session-root" },
    ]);
    const tool = makeTool("call-1", "Read", "ghost-uuid");
    const owner = resolveToolOwner(tree, tool);
    expect(owner.kind).toBe("session-root");
  });

  it("defensively returns session-root when tree is null", () => {
    const tool = makeTool("call-1", "Read", "anything");
    const owner = resolveToolOwner(null, tool);
    expect(owner.kind).toBe("session-root");
  });
});

// ---------------------------------------------------------------------------
// resolveAssistantTurnOwner
// ---------------------------------------------------------------------------

describe("resolveAssistantTurnOwner", () => {
  it("returns session-root for a parent-owned assistant turn", () => {
    const tree = makeMixedTree();
    const owner = resolveAssistantTurnOwner(tree, "asst:parent-turn");
    expect(owner.kind).toBe("session-root");
  });

  it("returns subagent-root with agentId for a subagent-owned assistant turn", () => {
    const tree = makeMixedTree();
    const owner = resolveAssistantTurnOwner(tree, "asst:sub-turn");
    expect(owner.kind).toBe("subagent-root");
    expect(owner.agentId).toBe("explore-01");
  });

  it("defensively returns session-root when tree is null", () => {
    const owner = resolveAssistantTurnOwner(null, "anything");
    expect(owner.kind).toBe("session-root");
  });

  it("defensively returns session-root when turnId is not in nodesById", () => {
    const tree = makeMixedTree();
    const owner = resolveAssistantTurnOwner(tree, "asst:nonexistent");
    expect(owner.kind).toBe("session-root");
  });
});
