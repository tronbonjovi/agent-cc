// tests/token-breakdown.test.ts
//
// Tests for TokenBreakdown tree-aware row builder (flat-to-tree wave2 task003).
//
// Note on test scope: matches the same convention as `tool-timeline.test.ts` —
// the repo has no jsdom environment, no React Testing Library install, and the
// vitest config only globs `tests/**/*.test.ts`. We unit-test the pure exported
// helpers from `client/src/components/analytics/sessions/TokenBreakdown.tsx`
// directly. The Agent column JSX is verified manually on devbox during task005.
//
// The tested helpers are:
//   - buildTokenRowsFromTree: walks tree.nodesById for assistant-turn nodes,
//     sorts by timestamp ascending, and computes a running cumulative total
//     across ALL rows (parent + subagent). Stamps each row with its owner.
//   - buildTokenRows: today's flat helper, retained as the no-tree fallback.
//     Must keep its current shape so the no-tree render path is byte-identical.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  SessionTreeNode,
  SerializedSessionTreeForClient,
  AssistantRecord,
} from "@shared/session-types";
import {
  buildTokenRowsFromTree,
  buildTokenRows,
  roleLabel,
} from "../client/src/components/analytics/sessions/TokenBreakdown";
import { colorClassForOwner } from "../client/src/components/analytics/sessions/subagent-colors";

// ---------------------------------------------------------------------------
// Synthetic tree builder — only carries fields the helper actually reads.
// We deliberately do NOT round-trip through the real builder; the helper must
// work against the wire shape (Map → Record) the sessions route emits.
// ---------------------------------------------------------------------------

interface AssistantTurnSpec {
  id: string;
  parentId: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
}

interface SubagentRootSpec {
  id: string;
  parentId: string;
  agentId: string;
  agentType?: string;
}

function makeAssistantTurnNode(spec: AssistantTurnSpec): SessionTreeNode {
  return {
    id: spec.id,
    parentId: spec.parentId,
    kind: "assistant-turn",
    children: [],
    timestamp: spec.timestamp,
    selfCost: {
      inputTokens: spec.inputTokens,
      outputTokens: spec.outputTokens,
      cacheReadTokens: spec.cacheReadTokens ?? 0,
      cacheCreationTokens: spec.cacheCreationTokens ?? 0,
      costUsd: 0,
      durationMs: 0,
    },
    rollupCost: {
      inputTokens: spec.inputTokens,
      outputTokens: spec.outputTokens,
      cacheReadTokens: spec.cacheReadTokens ?? 0,
      cacheCreationTokens: spec.cacheCreationTokens ?? 0,
      costUsd: 0,
      durationMs: 0,
    },
    uuid: spec.id.replace(/^asst:/, ""),
    model: spec.model ?? "claude-sonnet-4-5",
    stopReason: "end_turn",
    usage: {
      inputTokens: spec.inputTokens,
      outputTokens: spec.outputTokens,
      cacheReadTokens: spec.cacheReadTokens ?? 0,
      cacheCreationTokens: spec.cacheCreationTokens ?? 0,
      serviceTier: "standard",
      inferenceGeo: "us",
      speed: "fast",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    textPreview: "",
    hasThinking: false,
    isSidechain: false,
  } as SessionTreeNode;
}

function makeSessionRootNode(): SessionTreeNode {
  return {
    id: "session-root",
    parentId: null,
    kind: "session-root",
    children: [],
    timestamp: "2026-04-12T00:00:00.000Z",
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    sessionId: "test-session",
    slug: "test",
    firstMessage: "",
    firstTs: "2026-04-12T00:00:00.000Z",
    lastTs: "2026-04-12T00:00:00.000Z",
    filePath: "/tmp/fake.jsonl",
    projectKey: "fake",
    gitBranch: "main",
  } as SessionTreeNode;
}

function makeSubagentRootNode(spec: SubagentRootSpec): SessionTreeNode {
  return {
    id: spec.id,
    parentId: spec.parentId,
    kind: "subagent-root",
    children: [],
    timestamp: "2026-04-12T00:00:00.000Z",
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    agentId: spec.agentId,
    agentType: spec.agentType ?? "Explore",
    description: "test subagent",
    prompt: "",
    sessionId: "test-session",
    filePath: "/tmp/fake-sub.jsonl",
    dispatchedByTurnId: null,
    dispatchedByToolCallId: null,
    linkage: { method: "orphan", confidence: "none", reason: "synthetic" },
  } as SessionTreeNode;
}

/**
 * Shared fixture used by every tree-path test below.
 *
 * Layout:
 *   session-root
 *     ├─ asst:p1 (T1, 100 in / 50 out)
 *     ├─ asst:p2 (T3, 200 in / 100 out)
 *     ├─ asst:p3 (T5, 300 in / 150 out)
 *     ├─ subagent:agent-a (agentId: "agent-a", agentType: "Explore")
 *     │    └─ asst:s1 (T2, 80 in / 40 out)
 *     └─ subagent:agent-b (agentId: "agent-b", agentType: "Plan")
 *          └─ asst:s2 (T4, 60 in / 30 out)
 *
 * Parent turns are inserted into nodesById in order T3, T1, T5 — out of
 * insertion order on purpose so the helper's sort step is exercised.
 *
 * tree.totals.assistantTurns = 5
 * tree.totals.inputTokens    = 100 + 200 + 300 + 80 + 60 = 740
 * tree.totals.outputTokens   = 50  + 100 + 150 + 40 + 30 = 370
 * Sum input + output         = 1110 (used by test 3)
 *
 * Sorted timestamp order: T1 → T2 → T3 → T4 → T5 (test 2)
 *
 * Per-row cumulative running totals (input+output):
 *   T1 (parent)   → 150
 *   T2 (sub-a)    → 270
 *   T3 (parent)   → 570
 *   T4 (sub-b)    → 660
 *   T5 (parent)   → 1110
 */
function makeFixtureTree(): SerializedSessionTreeForClient {
  const T1 = "2026-04-12T00:00:01.000Z";
  const T2 = "2026-04-12T00:00:02.000Z";
  const T3 = "2026-04-12T00:00:03.000Z";
  const T4 = "2026-04-12T00:00:04.000Z";
  const T5 = "2026-04-12T00:00:05.000Z";

  const nodesById: Record<string, SessionTreeNode> = {};

  // Insert parent turns out of order on purpose: T3 first, then T1, then T5.
  nodesById["asst:p2"] = makeAssistantTurnNode({
    id: "asst:p2",
    parentId: "session-root",
    timestamp: T3,
    inputTokens: 200,
    outputTokens: 100,
  });
  nodesById["asst:p1"] = makeAssistantTurnNode({
    id: "asst:p1",
    parentId: "session-root",
    timestamp: T1,
    inputTokens: 100,
    outputTokens: 50,
  });
  nodesById["asst:p3"] = makeAssistantTurnNode({
    id: "asst:p3",
    parentId: "session-root",
    timestamp: T5,
    inputTokens: 300,
    outputTokens: 150,
  });

  // Two subagents, each with one assistant turn.
  nodesById["subagent:agent-a"] = makeSubagentRootNode({
    id: "subagent:agent-a",
    parentId: "session-root",
    agentId: "agent-a",
    agentType: "Explore",
  });
  nodesById["asst:s1"] = makeAssistantTurnNode({
    id: "asst:s1",
    parentId: "subagent:agent-a",
    timestamp: T2,
    inputTokens: 80,
    outputTokens: 40,
  });

  nodesById["subagent:agent-b"] = makeSubagentRootNode({
    id: "subagent:agent-b",
    parentId: "session-root",
    agentId: "agent-b",
    agentType: "Plan",
  });
  nodesById["asst:s2"] = makeAssistantTurnNode({
    id: "asst:s2",
    parentId: "subagent:agent-b",
    timestamp: T4,
    inputTokens: 60,
    outputTokens: 30,
  });

  nodesById["session-root"] = makeSessionRootNode();

  return {
    root: nodesById["session-root"],
    nodesById,
    subagentsByAgentId: {
      "agent-a": nodesById["subagent:agent-a"],
      "agent-b": nodesById["subagent:agent-b"],
    },
    totals: {
      assistantTurns: 5,
      userTurns: 0,
      toolCalls: 0,
      toolErrors: 0,
      subagents: 2,
      inputTokens: 740,
      outputTokens: 370,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildTokenRowsFromTree", () => {
  it("returns one row per assistant-turn node (matches tree.totals.assistantTurns)", () => {
    const tree = makeFixtureTree();
    const rows = buildTokenRowsFromTree(tree, []);
    expect(rows).toHaveLength(5);
    expect(rows.length).toBe(tree.totals.assistantTurns);
  });

  it("sorts rows by timestamp ascending even when nodesById insertion order differs", () => {
    const tree = makeFixtureTree();
    const rows = buildTokenRowsFromTree(tree, []);
    const expectedOrder = [
      "2026-04-12T00:00:01.000Z", // T1
      "2026-04-12T00:00:02.000Z", // T2
      "2026-04-12T00:00:03.000Z", // T3
      "2026-04-12T00:00:04.000Z", // T4
      "2026-04-12T00:00:05.000Z", // T5
    ];
    expect(rows.map(r => r.timestamp)).toEqual(expectedOrder);
  });

  it("computes a running cumulative total across all rows that matches tree.totals", () => {
    const tree = makeFixtureTree();
    const rows = buildTokenRowsFromTree(tree, []);
    // Per-row cumulative input+output:
    //   T1 (100+50)  → 150
    //   T2 (80+40)   → 270
    //   T3 (200+100) → 570
    //   T4 (60+30)   → 660
    //   T5 (300+150) → 1110
    expect(rows.map(r => r.cumulativeTotal)).toEqual([150, 270, 570, 660, 1110]);
    // Final cumulative === sum of tree-wide input + output (the contract's
    // anchor: subagent spend is now included in the running total).
    expect(rows[rows.length - 1].cumulativeTotal).toBe(
      tree.totals.inputTokens + tree.totals.outputTokens,
    );
  });

  it("stamps each row with the owner of its issuing assistant turn", () => {
    const tree = makeFixtureTree();
    const rows = buildTokenRowsFromTree(tree, []);
    // Sorted T1..T5 → owners are: parent, sub-a, parent, sub-b, parent
    expect(rows[0].owner).toEqual({ kind: "session-root", agentId: null });
    expect(rows[1].owner).toEqual({ kind: "subagent-root", agentId: "agent-a" });
    expect(rows[2].owner).toEqual({ kind: "session-root", agentId: null });
    expect(rows[3].owner).toEqual({ kind: "subagent-root", agentId: "agent-b" });
    expect(rows[4].owner).toEqual({ kind: "session-root", agentId: null });
  });

  it("resolves a non-empty palette class for subagent rows and an empty class for parent rows", () => {
    const tree = makeFixtureTree();
    const rows = buildTokenRowsFromTree(tree, []);
    expect(colorClassForOwner(rows[0].owner)).toBe(""); // T1 — parent
    expect(colorClassForOwner(rows[1].owner).length).toBeGreaterThan(0); // T2 — sub-a
    expect(colorClassForOwner(rows[2].owner)).toBe(""); // T3 — parent
    expect(colorClassForOwner(rows[3].owner).length).toBeGreaterThan(0); // T4 — sub-b
    expect(colorClassForOwner(rows[4].owner)).toBe(""); // T5 — parent
  });

  it("returns an empty array (no throw) when the tree has no assistant-turn nodes", () => {
    const sessionOnly: SerializedSessionTreeForClient = {
      root: makeSessionRootNode(),
      nodesById: { "session-root": makeSessionRootNode() },
      subagentsByAgentId: {},
      totals: {
        assistantTurns: 0,
        userTurns: 0,
        toolCalls: 0,
        toolErrors: 0,
        subagents: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        durationMs: 0,
      },
      warnings: [],
    };
    expect(() => buildTokenRowsFromTree(sessionOnly, [])).not.toThrow();
    expect(buildTokenRowsFromTree(sessionOnly, [])).toEqual([]);
  });
});

describe("buildTokenRows (flat fallback, no tree)", () => {
  it("returns rows with today's shape — fields the component currently renders", () => {
    // Minimal AssistantRecord — only the fields the flat builder reads.
    const assistantMessages: AssistantRecord[] = [
      {
        uuid: "u1",
        parentUuid: "",
        timestamp: "2026-04-12T00:00:01.000Z",
        requestId: "r1",
        isSidechain: false,
        model: "claude-sonnet-4-5",
        stopReason: "end_turn",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cacheCreationTokens: 5,
          serviceTier: "standard",
          inferenceGeo: "us",
          speed: "fast",
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
        toolCalls: [],
        hasThinking: false,
        textPreview: "",
      },
      {
        uuid: "u2",
        parentUuid: "u1",
        timestamp: "2026-04-12T00:00:02.000Z",
        requestId: "r2",
        isSidechain: false,
        model: "claude-sonnet-4-5",
        stopReason: "end_turn",
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          cacheReadTokens: 20,
          cacheCreationTokens: 0,
          serviceTier: "standard",
          inferenceGeo: "us",
          speed: "fast",
          serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
        },
        toolCalls: [],
        hasThinking: false,
        textPreview: "",
      },
    ];
    const rows = buildTokenRows(assistantMessages, []);
    expect(rows).toHaveLength(2);
    // Field shape (every field the component renders today)
    const r0 = rows[0];
    expect(r0.role).toBe("assistant");
    expect(r0.inputTokens).toBe(100);
    expect(r0.outputTokens).toBe(50);
    expect(r0.cacheReadTokens).toBe(10);
    expect(r0.cacheCreationTokens).toBe(5);
    expect(r0.model).toBe("claude-sonnet-4-5");
    expect(r0.cumulativeTotal).toBe(150); // 100 + 50
    // Second row's cumulative is the running sum across just the flat list.
    expect(rows[1].cumulativeTotal).toBe(450); // 150 + (200 + 100)
  });
});

// ---------------------------------------------------------------------------
// Role label tests (task003, sessions-makeover fix 1)
//
// The component previously rendered `<Badge>A</Badge>` / `<Badge>U</Badge>`
// / `<Badge>sA</Badge>` — cryptic and unreadable. This milestone replaces
// that with a `roleLabel(row, tree)` helper that returns human labels and
// tree-aware subagent type names. We unit-test the pure helper here (same
// convention as the rest of this file — no jsdom / RTL) and cross-check
// via source-text assertion that the renderer actually calls it.
// ---------------------------------------------------------------------------

describe("roleLabel (task003 — TokenBreakdown role labels)", () => {
  it("returns 'User' for user rows, not 'U'", () => {
    const row = {
      role: "user" as const,
      owner: { kind: "session-root", agentId: null } as const,
    };
    expect(roleLabel(row, null)).toBe("User");
    expect(roleLabel(row, null)).not.toBe("U");
  });

  it("returns 'Assistant' for parent-session assistant rows, not 'A' or 'sA'", () => {
    const row = {
      role: "assistant" as const,
      owner: { kind: "session-root", agentId: null } as const,
    };
    // No tree at all (flat fallback)
    expect(roleLabel(row, null)).toBe("Assistant");
    expect(roleLabel(row, undefined)).toBe("Assistant");
    expect(roleLabel(row, null)).not.toBe("A");
    expect(roleLabel(row, null)).not.toBe("sA");

    // Tree present but row owner is the parent session — still 'Assistant'
    const tree = makeFixtureTree();
    expect(roleLabel(row, tree)).toBe("Assistant");
  });

  it("returns 'Subagent: <agentType>' for subagent rows when tree present", () => {
    const tree = makeFixtureTree();
    const row = {
      role: "assistant" as const,
      owner: { kind: "subagent-root", agentId: "agent-a" } as const,
    };
    expect(roleLabel(row, tree)).toBe("Subagent: Explore");

    const row2 = {
      role: "assistant" as const,
      owner: { kind: "subagent-root", agentId: "agent-b" } as const,
    };
    expect(roleLabel(row2, tree)).toBe("Subagent: Plan");
  });

  it("falls back to 'Subagent: subagent' when the agentType lookup fails", () => {
    const tree = makeFixtureTree();
    const row = {
      role: "assistant" as const,
      owner: { kind: "subagent-root", agentId: "unknown-agent" } as const,
    };
    expect(roleLabel(row, tree)).toBe("Subagent: subagent");
  });

  it("is referenced by the TokenBreakdown renderer (replaces the single-letter A/U badges)", () => {
    // Source-text check: confirm the renderer calls roleLabel(row, tree) and
    // no longer carries the old `? "A" : "U"` ternary. This guards against a
    // future refactor silently reintroducing the cryptic labels.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../client/src/components/analytics/sessions/TokenBreakdown.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("roleLabel(row, tree)");
    expect(src).not.toMatch(/\?\s*"A"\s*:\s*"U"/);
  });
});

// ---------------------------------------------------------------------------
// Viewport constraint tests (task003, sessions-makeover fix 2)
//
// Long sessions previously blew out the page — the token table had no
// max-height and no sticky header. Fix wraps the table in a
// `max-h-[60vh] overflow-auto` container (tagged `data-token-table-scroll`)
// and pins the <thead> with `sticky top-0 bg-card z-10`. The background must
// be SOLID (bg-card), never `bg-transparent` — otherwise rows scroll visibly
// under the header. We assert these invariants via source-text checks because
// the repo intentionally does not ship jsdom / @testing-library/react.
// ---------------------------------------------------------------------------

describe("TokenBreakdown viewport constraint (task003)", () => {
  const src = readFileSync(
    path.resolve(
      __dirname,
      "../client/src/components/analytics/sessions/TokenBreakdown.tsx",
    ),
    "utf8",
  );

  it("wraps the table in a max-h-[60vh] overflow-auto container tagged data-token-table-scroll", () => {
    // Must have the data attribute marker used by manual QA + future tests.
    expect(src).toContain("data-token-table-scroll");
    // Find the wrapper element carrying the marker and assert the classes
    // live on the same element.
    const match = src.match(
      /data-token-table-scroll[\s\S]*?className="([^"]*)"/,
    );
    expect(match, "data-token-table-scroll must have a className").toBeTruthy();
    const className = match![1];
    expect(className).toContain("max-h-[60vh]");
    expect(className).toContain("overflow-auto");
  });

  it("uses a sticky <thead> with a SOLID bg-card background, never bg-transparent", () => {
    // Grab the <thead ... className="..."> className string.
    const theadMatch = src.match(/<thead[^>]*className="([^"]*)"/);
    expect(theadMatch, "<thead> must carry a className").toBeTruthy();
    const theadClass = theadMatch![1];
    expect(theadClass).toContain("sticky");
    expect(theadClass).toContain("top-0");
    expect(theadClass).toContain("z-10");
    // Solid background — must match bg-card (or bg-background), must NOT be
    // bg-transparent. Content bleed-through on scroll is the exact bug.
    expect(theadClass).toMatch(/bg-(card|background)/);
    expect(theadClass).not.toContain("bg-transparent");
  });
});
