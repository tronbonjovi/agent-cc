// tests/conversation-viewer.test.ts
//
// Tests for the Messages tab ConversationViewer component
// (messages-redesign task004).
//
// Matches the project convention: pure helper functions are exercised as
// normal TypeScript imports, and React component structure is verified
// with file-text / regex checks (no jsdom, no React Testing Library —
// the vitest config excludes `client/` and has no DOM environment).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { TimelineMessage } from "../shared/session-types";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/ConversationViewer.tsx",
);

// ---------------------------------------------------------------------------
// Fixture helpers — build minimal TimelineMessage records for grouping /
// filtering tests. Only the fields the viewer cares about are populated.
// ---------------------------------------------------------------------------

function userMsg(
  uuid: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "user_text",
    uuid,
    text: `user ${uuid}`,
    isMeta: false,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function asstMsg(
  uuid: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "assistant_text",
    uuid,
    model: "claude-opus-4-6",
    text: `reply ${uuid}`,
    stopReason: "end_turn",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function thinkingMsg(
  uuid: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "thinking",
    uuid,
    text: `thinking ${uuid}`,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function toolCallMsg(
  uuid: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "tool_call",
    uuid,
    callId: `c-${uuid}`,
    name: "Read",
    input: {},
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function toolResultMsg(
  uuid: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "tool_result",
    uuid,
    toolUseId: `c-${uuid}`,
    content: "",
    isError: false,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function systemMsg(ts: string, opts: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    type: "system_event",
    subtype: "turn_duration",
    summary: "turn took 1.2s",
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

// ---------------------------------------------------------------------------
// File-structure guardrails (match convention used by UserBubble / dispatcher
// tests). These protect the React surface from regressions without needing
// a DOM renderer.
// ---------------------------------------------------------------------------

describe("ConversationViewer — source structure", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a ConversationViewer component", () => {
    expect(src).toMatch(/export\s+function\s+ConversationViewer/);
  });

  it("exports a FilterState type", () => {
    expect(src).toMatch(/export\s+(interface|type)\s+FilterState/);
  });

  it("exports a DEFAULT_FILTERS constant", () => {
    expect(src).toMatch(/export\s+const\s+DEFAULT_FILTERS/);
  });

  it("imports TimelineMessage and MessageTimelineResponse from shared session-types", () => {
    expect(src).toMatch(/TimelineMessage/);
    expect(src).toMatch(/MessageTimelineResponse/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("imports renderMessage and SidechainGroup from the bubbles barrel", () => {
    expect(src).toMatch(/renderMessage/);
    expect(src).toMatch(/SidechainGroup/);
    expect(src).toMatch(/from\s+["']\.\/bubbles["']/);
  });

  it("requests the timeline endpoint with ?include=tree by default", () => {
    expect(src).toMatch(/\/api\/sessions\/\$\{sessionId\}\/messages\?include=tree/);
  });

  it("uses useQuery from @tanstack/react-query", () => {
    expect(src).toMatch(/from ["']@tanstack\/react-query["']/);
    expect(src).toMatch(/useQuery/);
  });

  it("registers keyboard handlers for ArrowUp / ArrowDown / Enter / Escape", () => {
    // Guardrail — the contract requires Up/Down nav + Enter/Escape expand/collapse.
    expect(src).toMatch(/ArrowUp/);
    expect(src).toMatch(/ArrowDown/);
    expect(src).toMatch(/["']Enter["']/);
    expect(src).toMatch(/["']Escape["']/);
  });

  it("renders jump-to-top and jump-to-bottom controls", () => {
    expect(src).toMatch(/jump-to-top|data-jump="top"/i);
    expect(src).toMatch(/jump-to-bottom|data-jump="bottom"/i);
  });

  it("renders a position indicator in Message X of Y form", () => {
    expect(src).toMatch(/Message\s+\$\{/);
    expect(src).toMatch(/of/);
  });

  it("shows a banner when meta.treeStatus is unavailable", () => {
    expect(src).toMatch(/treeStatus/);
    expect(src).toMatch(/unavailable/);
    expect(src).toMatch(/Subagent grouping unavailable/);
  });

  it("does not use bounce/scale animations (safety rule)", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/hover:scale-/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

// ---------------------------------------------------------------------------
// Pure helper tests — grouping, filtering, position indexing.
// ---------------------------------------------------------------------------

describe("filterMessages", () => {
  it("returns all messages when every type is enabled", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z"),
      thinkingMsg("t1", "2026-01-01T00:00:02Z"),
      toolCallMsg("tc1", "2026-01-01T00:00:03Z"),
    ];
    expect(filterMessages(msgs, DEFAULT_FILTERS)).toHaveLength(4);
  });

  it("hides message types whose flag is false", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z"),
      thinkingMsg("t1", "2026-01-01T00:00:02Z"),
      toolCallMsg("tc1", "2026-01-01T00:00:03Z"),
      toolResultMsg("tr1", "2026-01-01T00:00:04Z"),
      systemMsg("2026-01-01T00:00:05Z"),
    ];
    const filters = {
      ...DEFAULT_FILTERS,
      thinking: false,
      toolCalls: false,
      toolResults: false,
      systemEvents: false,
    };
    const result = filterMessages(msgs, filters);
    expect(result.map((m) => m.type)).toEqual(["user_text", "assistant_text"]);
  });

  it("empty result when all filters off", async () => {
    const { filterMessages } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z"),
    ];
    const filters = {
      userText: false,
      assistantText: false,
      thinking: false,
      toolCalls: false,
      toolResults: false,
      systemEvents: false,
      skillInvocations: false,
    };
    expect(filterMessages(msgs, filters)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Grouping — the authoritative/heuristic split is load-bearing for task004.
// ---------------------------------------------------------------------------

describe("groupMessagesForRender", () => {
  it("passes through messages with no subagent context as singletons", async () => {
    const { groupMessagesForRender } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z"),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const result = groupMessagesForRender(msgs, "ok");
    expect(result).toHaveLength(3);
    expect(result.every((g) => g.kind === "single")).toBe(true);
  });

  it("groups consecutive messages sharing the same agentId (tree-ok path)", async () => {
    const { groupMessagesForRender } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const ctxA = { agentId: "agent-A", agentType: "general", description: "worker" };
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z", { subagentContext: ctxA }),
      toolCallMsg("tc1", "2026-01-01T00:00:02Z", { subagentContext: ctxA }),
      toolResultMsg("tr1", "2026-01-01T00:00:03Z", { subagentContext: ctxA }),
      userMsg("u2", "2026-01-01T00:00:04Z"),
    ];
    const result = groupMessagesForRender(msgs, "ok");
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ kind: "single" });
    expect(result[1]).toMatchObject({ kind: "sidechain" });
    if (result[1].kind === "sidechain") {
      expect(result[1].members).toHaveLength(3);
      expect(result[1].subagentContext?.agentId).toBe("agent-A");
    }
    expect(result[2]).toMatchObject({ kind: "single" });
  });

  it("splits when agentId changes between consecutive messages (tree-ok path)", async () => {
    const { groupMessagesForRender } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const ctxA = { agentId: "agent-A", agentType: "general", description: "a" };
    const ctxB = { agentId: "agent-B", agentType: "general", description: "b" };
    const msgs = [
      asstMsg("a1", "2026-01-01T00:00:00Z", { subagentContext: ctxA }),
      asstMsg("a2", "2026-01-01T00:00:01Z", { subagentContext: ctxA }),
      asstMsg("a3", "2026-01-01T00:00:02Z", { subagentContext: ctxB }),
    ];
    const result = groupMessagesForRender(msgs, "ok");
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("sidechain");
    expect(result[1].kind).toBe("sidechain");
    if (result[0].kind === "sidechain")
      expect(result[0].subagentContext?.agentId).toBe("agent-A");
    if (result[1].kind === "sidechain")
      expect(result[1].subagentContext?.agentId).toBe("agent-B");
  });

  it("falls back to consecutive isSidechain heuristic when treeStatus is unavailable", async () => {
    const { groupMessagesForRender } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z", { isSidechain: true }),
      asstMsg("a2", "2026-01-01T00:00:02Z", { isSidechain: true }),
      userMsg("u2", "2026-01-01T00:00:03Z"),
    ];
    const result = groupMessagesForRender(msgs, "unavailable");
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe("single");
    expect(result[1].kind).toBe("sidechain");
    if (result[1].kind === "sidechain") {
      expect(result[1].members).toHaveLength(2);
      // Fallback grouping has no agentId — context is null.
      expect(result[1].subagentContext).toBeNull();
    }
    expect(result[2].kind).toBe("single");
  });

  it("ignores isSidechain when tree enrichment is ok (authoritative grouping wins)", async () => {
    const { groupMessagesForRender } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // Message marked isSidechain but with no subagentContext — under ok we
    // treat it as a single normal message, NOT as a sidechain group.
    const msgs = [
      asstMsg("a1", "2026-01-01T00:00:00Z", { isSidechain: true }),
    ];
    const result = groupMessagesForRender(msgs, "ok");
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("single");
  });
});

// ---------------------------------------------------------------------------
// Message ordering by timestamp — defensive: scanner may emit out-of-order
// records when merging sidechain & parent streams.
// ---------------------------------------------------------------------------

describe("sortMessagesByTimestamp", () => {
  it("sorts ascending by timestamp (oldest first)", async () => {
    const { sortMessagesByTimestamp } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u3", "2026-01-01T00:00:02Z"),
      userMsg("u1", "2026-01-01T00:00:00Z"),
      userMsg("u2", "2026-01-01T00:00:01Z"),
    ];
    const result = sortMessagesByTimestamp(msgs);
    expect(result.map((m) => ("uuid" in m ? m.uuid : ""))).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("returns a new array (does not mutate input)", async () => {
    const { sortMessagesByTimestamp } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u2", "2026-01-01T00:00:01Z"),
      userMsg("u1", "2026-01-01T00:00:00Z"),
    ];
    const snapshot = msgs.slice();
    sortMessagesByTimestamp(msgs);
    expect(msgs).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Scroll / position helpers
// ---------------------------------------------------------------------------

describe("computeVisiblePosition", () => {
  it("returns 1-based index of the target message within the visible set", async () => {
    const { computeVisiblePosition, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      thinkingMsg("t1", "2026-01-01T00:00:01Z"),
      asstMsg("a1", "2026-01-01T00:00:02Z"),
      userMsg("u2", "2026-01-01T00:00:03Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, thinking: false };
    // After hiding thinking, the visible list is [u1, a1, u2].
    // a1 at raw index 2 should report position 2 of 3.
    const pos = computeVisiblePosition(msgs, 2, filters);
    expect(pos).toEqual({ index: 2, total: 3 });
  });

  it("skips over hidden messages when computing position", async () => {
    const { computeVisiblePosition, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      thinkingMsg("t1", "2026-01-01T00:00:01Z"),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, thinking: false };
    // Target a hidden message (thinking) — behavior: report the next-visible
    // message's position. Contract choice: hidden target collapses to 0.
    const pos = computeVisiblePosition(msgs, 1, filters);
    expect(pos.total).toBe(2);
  });

  it("handles empty visible set (total = 0)", async () => {
    const { computeVisiblePosition } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const filters = {
      userText: false,
      assistantText: false,
      thinking: false,
      toolCalls: false,
      toolResults: false,
      systemEvents: false,
      skillInvocations: false,
    };
    const msgs = [userMsg("u1", "2026-01-01T00:00:00Z")];
    const pos = computeVisiblePosition(msgs, 0, filters);
    expect(pos.total).toBe(0);
    expect(pos.index).toBe(0);
  });
});

describe("findAnchorAfterFilterChange", () => {
  it("returns the same raw index when the message is still visible", async () => {
    const { findAnchorAfterFilterChange, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      thinkingMsg("t1", "2026-01-01T00:00:01Z"),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const anchor = findAnchorAfterFilterChange(msgs, 2, DEFAULT_FILTERS);
    // u2 is still visible — anchor to u2 (raw index 2).
    expect(anchor).toBe(2);
  });

  it("walks backwards when the current anchor was hidden by a filter change", async () => {
    const { findAnchorAfterFilterChange, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      thinkingMsg("t1", "2026-01-01T00:00:01Z"),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, thinking: false };
    // Previous anchor was t1 (raw idx 1), which is now hidden.
    // Should walk back to u1 (raw idx 0), still visible.
    const anchor = findAnchorAfterFilterChange(msgs, 1, filters);
    expect(anchor).toBe(0);
  });

  it("walks forward when no earlier message is visible", async () => {
    const { findAnchorAfterFilterChange, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      thinkingMsg("t1", "2026-01-01T00:00:00Z"),
      userMsg("u1", "2026-01-01T00:00:01Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, thinking: false };
    const anchor = findAnchorAfterFilterChange(msgs, 0, filters);
    // t1 hidden; nothing behind; forward to u1.
    expect(anchor).toBe(1);
  });

  it("returns -1 when nothing is visible anywhere", async () => {
    const { findAnchorAfterFilterChange } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const filters = {
      userText: false,
      assistantText: false,
      thinking: false,
      toolCalls: false,
      toolResults: false,
      systemEvents: false,
      skillInvocations: false,
    };
    const msgs = [userMsg("u1", "2026-01-01T00:00:00Z")];
    expect(findAnchorAfterFilterChange(msgs, 0, filters)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// task006 step 6 — filter coverage gap for task005's errorsOnly / sidechains
// paths, plus step 5 — surrounding-context enrichment for errored tool_results.
// ---------------------------------------------------------------------------

describe("filterMessages — sidechains hidden", () => {
  it("hides messages with isSidechain: true when sidechains=false", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z", { isSidechain: true }),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, sidechains: false };
    const result = filterMessages(msgs, filters);
    expect(result.map((m) => ("uuid" in m ? m.uuid : ""))).toEqual(["u1", "u2"]);
  });

  it("hides messages carrying a subagentContext when sidechains=false", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const ctx = { agentId: "agent-A", agentType: "general", description: "w" };
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z", { subagentContext: ctx }),
      userMsg("u2", "2026-01-01T00:00:02Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, sidechains: false };
    const result = filterMessages(msgs, filters);
    expect(result.map((m) => ("uuid" in m ? m.uuid : ""))).toEqual(["u1", "u2"]);
  });

  it("keeps sidechains visible when sidechains flag is undefined (backward compat)", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z", { isSidechain: true }),
    ];
    // Strip the sidechains field entirely to simulate a legacy 7-key literal.
    const filters = { ...DEFAULT_FILTERS };
    delete (filters as Record<string, unknown>).sidechains;
    const result = filterMessages(msgs, filters);
    expect(result).toHaveLength(2);
  });
});

describe("filterMessages — errorsOnly with surrounding context (step 5)", () => {
  it("returns the errored tool_result, its paired tool_call, and the preceding assistant turn", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // Conversation:
    //   u1 → a1 (normal) → tc1 (ok) → tr1 (ok) → a2 (issues bad call)
    //   → tc-bad → tr-bad (ERROR) → a3 (summary)
    // errorsOnly: true should surface [a2, tc-bad, tr-bad] in chronological order.
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "2026-01-01T00:00:01Z"),
      toolCallMsg("tc1", "2026-01-01T00:00:02Z"),
      toolResultMsg("tr1", "2026-01-01T00:00:03Z"),
      asstMsg("a2", "2026-01-01T00:00:04Z"),
      toolCallMsg("bad", "2026-01-01T00:00:05Z"),
      toolResultMsg("bad", "2026-01-01T00:00:06Z", { isError: true }),
      asstMsg("a3", "2026-01-01T00:00:07Z"),
    ];
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    expect(result.map((m) => ("uuid" in m ? m.uuid : ""))).toEqual([
      "a2",
      "bad",
      "bad",
    ]);
    // Chronological order preserved (no timestamp reversal).
    expect(result[0].timestamp < result[1].timestamp).toBe(true);
    expect(result[1].timestamp < result[2].timestamp).toBe(true);
  });

  it("deduplicates an assistant turn that issued multiple errored tool_calls", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // a1 issues tc1 AND tc2, both errored. The assistant turn must appear
    // exactly once, followed by its two tool_call / tool_result pairs in
    // chronological order.
    const msgs = [
      asstMsg("a1", "2026-01-01T00:00:00Z"),
      toolCallMsg("c1", "2026-01-01T00:00:01Z"),
      toolResultMsg("c1", "2026-01-01T00:00:02Z", { isError: true }),
      toolCallMsg("c2", "2026-01-01T00:00:03Z"),
      toolResultMsg("c2", "2026-01-01T00:00:04Z", { isError: true }),
    ];
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    // Expected order: [a1, tc1, tr1, tc2, tr2] — 5 items total, a1 only once.
    expect(result).toHaveLength(5);
    const uuids = result.map((m) => ("uuid" in m ? m.uuid : ""));
    expect(uuids).toEqual(["a1", "c1", "c1", "c2", "c2"]);
    // Exactly one assistant_text in the output (the dedup case).
    expect(result.filter((m) => m.type === "assistant_text")).toHaveLength(1);
  });

  it("tolerates an errored tool_result with no preceding assistant turn", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // Only the errored tool_result, no matching tool_call or assistant turn
    // precedes it. Must not throw — just returns what it can find.
    const msgs = [
      userMsg("u1", "2026-01-01T00:00:00Z"),
      toolResultMsg("orphan", "2026-01-01T00:00:01Z", { isError: true }),
    ];
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    // Just the bare errored tool_result — no context to surface.
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("tool_result");
  });

  it("tolerates an errored tool_result whose tool_call has no preceding assistant turn", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // tool_call exists, but no assistant_text precedes it.
    const msgs = [
      toolCallMsg("tc", "2026-01-01T00:00:00Z"),
      toolResultMsg("tc", "2026-01-01T00:00:01Z", { isError: true }),
    ];
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("tool_call");
    expect(result[1].type).toBe("tool_result");
  });

  it("ignores non-errored tool_results (errorsOnly is still a debug view)", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      asstMsg("a1", "2026-01-01T00:00:00Z"),
      toolCallMsg("ok", "2026-01-01T00:00:01Z"),
      toolResultMsg("ok", "2026-01-01T00:00:02Z", { isError: false }),
    ];
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    expect(result).toHaveLength(0);
  });
});

describe("filterMessages — errorsOnly + sidechains precedence (step 5)", () => {
  it("hides sidechain-errored tool_results when sidechains=false (precedence wins)", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    // Two errored tool_results: one at top level, one inside a subagent.
    // With errorsOnly=true and sidechains=false, ONLY the top-level error
    // (plus its surrounding context) should surface.
    const ctx = { agentId: "A", agentType: "general", description: "w" };
    const msgs = [
      asstMsg("a-top", "2026-01-01T00:00:00Z"),
      toolCallMsg("top", "2026-01-01T00:00:01Z"),
      toolResultMsg("top", "2026-01-01T00:00:02Z", { isError: true }),
      // Subagent run, same-shape sequence but isSidechain / subagentContext set.
      asstMsg("a-sub", "2026-01-01T00:00:03Z", {
        isSidechain: true,
        subagentContext: ctx,
      }),
      toolCallMsg("sub", "2026-01-01T00:00:04Z", {
        isSidechain: true,
        subagentContext: ctx,
      }),
      toolResultMsg("sub", "2026-01-01T00:00:05Z", {
        isError: true,
        isSidechain: true,
        subagentContext: ctx,
      }),
    ];
    const filters = {
      ...DEFAULT_FILTERS,
      errorsOnly: true,
      sidechains: false,
    };
    const result = filterMessages(msgs, filters);
    // Only the top-level triad; sidechain triad fully suppressed.
    expect(result.map((m) => ("uuid" in m ? m.uuid : ""))).toEqual([
      "a-top",
      "top",
      "top",
    ]);
  });

  it("surfaces sidechain errors when sidechains is default (visible)", async () => {
    const { filterMessages, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const ctx = { agentId: "A", agentType: "general", description: "w" };
    const msgs = [
      asstMsg("a-sub", "2026-01-01T00:00:00Z", {
        isSidechain: true,
        subagentContext: ctx,
      }),
      toolCallMsg("sub", "2026-01-01T00:00:01Z", {
        isSidechain: true,
        subagentContext: ctx,
      }),
      toolResultMsg("sub", "2026-01-01T00:00:02Z", {
        isError: true,
        isSidechain: true,
        subagentContext: ctx,
      }),
    ];
    // sidechains defaults to true, so sidechain errors should appear.
    const filters = { ...DEFAULT_FILTERS, errorsOnly: true };
    const result = filterMessages(msgs, filters);
    expect(result).toHaveLength(3);
  });
});
