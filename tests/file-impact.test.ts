// tests/file-impact.test.ts
//
// Tests for the tree-aware FileImpact grouping helper (flat-to-tree wave2 task004).
//
// Pure-function assertions on `groupByDirectoryWithOwners` exported from
// FileImpact.tsx. No React rendering, no jsdom — same plain-vitest pattern as
// tests/subagent-colors.test.ts and tests/tool-timeline.test.ts.

import { describe, it, expect } from "vitest";
import type {
  SessionTreeNode,
  SerializedSessionTreeForClient,
  ToolExecution,
} from "@shared/session-types";
import { groupByDirectoryWithOwners } from "../client/src/components/analytics/sessions/FileImpact";

// ---------------------------------------------------------------------------
// Synthetic tree builder — minimal nodes carrying only the fields the helpers
// actually read. Mirrors the wave1 / wave2-task001 fixture pattern so the
// tests stay self-contained.
// ---------------------------------------------------------------------------

interface MinimalNode {
  id: string;
  parentId: string | null;
  kind: SessionTreeNode["kind"];
  agentId?: string;
  agentType?: string;
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
      ...(n.agentType ? { agentType: n.agentType } : {}),
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

function makeFileTool(
  callId: string,
  name: "Read" | "Write" | "Edit",
  filePath: string,
  issuedByAssistantUuid: string,
): ToolExecution {
  return {
    callId,
    name,
    filePath,
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

// ---------------------------------------------------------------------------
// Shared fixture: 1 parent session-root + 2 subagents (subagent-X, subagent-Y)
// + 3 files distributed across the owners per the contract spec.
// ---------------------------------------------------------------------------

function makeFixtureTree(): SerializedSessionTreeForClient {
  return makeWireTree([
    { id: "session-root", parentId: null, kind: "session-root" },
    // Parent assistant turns — issuing tools owned by the session root.
    { id: "asst:parent-1", parentId: "session-root", kind: "assistant-turn" },
    { id: "asst:parent-2", parentId: "session-root", kind: "assistant-turn" },
    // Subagent X under session-root, with one assistant turn issuing its tools.
    {
      id: "subagent:subagent-X",
      parentId: "session-root",
      kind: "subagent-root",
      agentId: "subagent-X",
      agentType: "Explore",
    },
    { id: "asst:sub-X-turn", parentId: "subagent:subagent-X", kind: "assistant-turn" },
    // Subagent Y under session-root, with one assistant turn issuing its tools.
    {
      id: "subagent:subagent-Y",
      parentId: "session-root",
      kind: "subagent-root",
      agentId: "subagent-Y",
      agentType: "Plan",
    },
    { id: "asst:sub-Y-turn", parentId: "subagent:subagent-Y", kind: "assistant-turn" },
  ]);
}

// File A: 2 parent-issued tools.
// File B: 3 subagent-X-issued tools.
// File C: 1 parent + 1 subagent-X + 2 subagent-Y.
function makeFixtureTools(): ToolExecution[] {
  return [
    // File A — parent-issued (2 ops)
    makeFileTool("call-a1", "Read", "/repo/src/a.ts", "parent-1"),
    makeFileTool("call-a2", "Edit", "/repo/src/a.ts", "parent-2"),
    // File B — subagent-X-issued (3 ops)
    makeFileTool("call-b1", "Read", "/repo/src/b.ts", "sub-X-turn"),
    makeFileTool("call-b2", "Edit", "/repo/src/b.ts", "sub-X-turn"),
    makeFileTool("call-b3", "Write", "/repo/src/b.ts", "sub-X-turn"),
    // File C — parent + subagent-X + subagent-Y x2 (4 ops)
    makeFileTool("call-c1", "Read", "/repo/src/c.ts", "parent-1"),
    makeFileTool("call-c2", "Read", "/repo/src/c.ts", "sub-X-turn"),
    makeFileTool("call-c3", "Edit", "/repo/src/c.ts", "sub-Y-turn"),
    makeFileTool("call-c4", "Write", "/repo/src/c.ts", "sub-Y-turn"),
  ];
}

// Helper: flatten the directory grouping into a flat path → entry map for
// easier per-file assertions. The helper returns Map<dir, FileEntry[]>.
function flattenByPath(groups: Map<string, { path: string; ownerCounts: Map<string | null, number> }[]>) {
  const out = new Map<string, { path: string; ownerCounts: Map<string | null, number> }>();
  for (const entries of groups.values()) {
    for (const entry of entries) {
      out.set(entry.path, entry);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests (9 cases per the task contract)
// ---------------------------------------------------------------------------

describe("groupByDirectoryWithOwners", () => {
  it("returns 3 FileEntry objects across all directories for the fixture", () => {
    const tree = makeFixtureTree();
    const tools = makeFixtureTools();
    const groups = groupByDirectoryWithOwners(tools, tree);
    const flat = flattenByPath(groups);
    expect(flat.size).toBe(3);
    expect(flat.has("/repo/src/a.ts")).toBe(true);
    expect(flat.has("/repo/src/b.ts")).toBe(true);
    expect(flat.has("/repo/src/c.ts")).toBe(true);
  });

  it("File A — parent-only ownerCounts", () => {
    const tree = makeFixtureTree();
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, tree));
    const fileA = flat.get("/repo/src/a.ts")!;
    expect(fileA.ownerCounts).toEqual(new Map([[null, 2]]));
  });

  it("File B — single subagent ownerCounts", () => {
    const tree = makeFixtureTree();
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, tree));
    const fileB = flat.get("/repo/src/b.ts")!;
    expect(fileB.ownerCounts).toEqual(new Map([["subagent-X", 3]]));
  });

  it("File C — parent + two subagents, correct per-owner counts", () => {
    const tree = makeFixtureTree();
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, tree));
    const fileC = flat.get("/repo/src/c.ts")!;
    expect(fileC.ownerCounts.get(null)).toBe(1);
    expect(fileC.ownerCounts.get("subagent-X")).toBe(1);
    expect(fileC.ownerCounts.get("subagent-Y")).toBe(2);
    expect(fileC.ownerCounts.size).toBe(3);
  });

  it("op totals are preserved per file (sum of ownerCounts == total tools)", () => {
    const tree = makeFixtureTree();
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, tree));
    const sum = (m: Map<string | null, number>) =>
      Array.from(m.values()).reduce((s, n) => s + n, 0);
    expect(sum(flat.get("/repo/src/a.ts")!.ownerCounts)).toBe(2);
    expect(sum(flat.get("/repo/src/b.ts")!.ownerCounts)).toBe(3);
    expect(sum(flat.get("/repo/src/c.ts")!.ownerCounts)).toBe(4);
  });

  it("null tree fallback — every entry has only the null parent-session key", () => {
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, null));
    for (const entry of flat.values()) {
      for (const key of entry.ownerCounts.keys()) {
        expect(key).toBeNull();
      }
    }
    // File C totals 4 ops, all attributed to null.
    expect(flat.get("/repo/src/c.ts")!.ownerCounts).toEqual(new Map([[null, 4]]));
  });

  it("undefined tree matches the null case", () => {
    const tools = makeFixtureTools();
    const flat = flattenByPath(groupByDirectoryWithOwners(tools, undefined));
    for (const entry of flat.values()) {
      for (const key of entry.ownerCounts.keys()) {
        expect(key).toBeNull();
      }
    }
    expect(flat.get("/repo/src/c.ts")!.ownerCounts).toEqual(new Map([[null, 4]]));
  });

  it("empty tools array returns an empty grouping", () => {
    const tree = makeFixtureTree();
    const groups = groupByDirectoryWithOwners([], tree);
    expect(groups.size).toBe(0);
  });

  it("defensive — tool whose issuing turn is not in the tree falls back to parent (null)", () => {
    const tree = makeFixtureTree();
    const ghost = makeFileTool("call-ghost", "Read", "/repo/src/ghost.ts", "ghost-uuid");
    const flat = flattenByPath(groupByDirectoryWithOwners([ghost], tree));
    const fileGhost = flat.get("/repo/src/ghost.ts")!;
    expect(fileGhost.ownerCounts).toEqual(new Map([[null, 1]]));
  });
});
