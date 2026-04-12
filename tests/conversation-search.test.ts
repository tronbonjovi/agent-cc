// tests/conversation-search.test.ts
//
// Tests for the Messages tab ConversationSearch component + the pure
// search helpers exported by ConversationViewer
// (messages-redesign task006).
//
// Matches the project convention: file-text guardrails for the React
// component, pure-helper imports for `findMatches` / `navigateMatches` /
// `isMessageInFilteredSet` / `getMessageSearchText`. Vitest excludes
// `client/` from its run, so no jsdom / RTL.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { TimelineMessage } from "../shared/session-types";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/ConversationSearch.tsx",
);
const VIEWER_SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/ConversationViewer.tsx",
);

// ---------------------------------------------------------------------------
// Fixture helpers — mirror the convention from conversation-viewer.test.ts
// so both files share the same minimal TimelineMessage shapes.
// ---------------------------------------------------------------------------

function userMsg(
  uuid: string,
  text: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "user_text",
    uuid,
    text,
    isMeta: false,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function asstMsg(
  uuid: string,
  text: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "assistant_text",
    uuid,
    model: "claude-opus-4-6",
    text,
    stopReason: "end_turn",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "",
      inferenceGeo: "",
      speed: "",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    },
    timestamp: ts,
    ...opts,
  } as unknown as TimelineMessage;
}

function thinkingMsg(
  uuid: string,
  text: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "thinking",
    uuid,
    text,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function toolCallMsg(
  uuid: string,
  name: string,
  input: Record<string, unknown>,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "tool_call",
    uuid,
    callId: `c-${uuid}`,
    name,
    input,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function toolResultMsg(
  uuid: string,
  content: string,
  ts: string,
  opts: Partial<TimelineMessage> = {},
): TimelineMessage {
  return {
    type: "tool_result",
    uuid,
    toolUseId: `c-${uuid}`,
    content,
    isError: false,
    timestamp: ts,
    ...opts,
  } as TimelineMessage;
}

function systemMsg(
  subtype: string,
  summary: string,
  ts: string,
): TimelineMessage {
  return {
    type: "system_event",
    subtype,
    summary,
    timestamp: ts,
  } as TimelineMessage;
}

// ---------------------------------------------------------------------------
// File-structure guardrails for ConversationSearch.tsx
// ---------------------------------------------------------------------------

describe("ConversationSearch — source structure", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a ConversationSearch component", () => {
    // Accept either `export function ConversationSearch` (plain function)
    // or `export const ConversationSearch = forwardRef(...)` (ref-forwarding)
    // — both are valid component definitions.
    expect(src).toMatch(/export\s+(function|const)\s+ConversationSearch/);
  });

  it("renders a search input", () => {
    // Either type="search" or type="text" — we accept either, but require
    // some <input> with a value/onChange wiring.
    expect(src).toMatch(/<input/);
    expect(src).toMatch(/onChange/);
  });

  it("renders prev and next match navigation buttons", () => {
    // Buttons for navigating. Data attributes keep the guardrail stable
    // across icon/label changes.
    expect(src).toMatch(/data-action=["']prev["']|aria-label=["'][^"']*Prev/i);
    expect(src).toMatch(/data-action=["']next["']|aria-label=["'][^"']*Next/i);
  });

  it("renders a clear/dismiss control", () => {
    expect(src).toMatch(/data-action=["']clear["']|aria-label=["'][^"']*(Clear|Dismiss|Close)/i);
  });

  it("renders a match counter in 'X of Y' or 'X / Y' form", () => {
    // The counter is load-bearing — guardrail against typos / layout rewrites.
    expect(src).toMatch(/\bof\b|\/\s*\{/);
    // And it reads from matches / total — require at least one matching identifier.
    expect(src).toMatch(/match/i);
  });

  it("handles Enter to advance to the next match", () => {
    expect(src).toMatch(/["']Enter["']/);
  });

  it("handles Escape to dismiss the search", () => {
    expect(src).toMatch(/["']Escape["']/);
  });

  it("does not use bounce/scale animations (safety rule)", () => {
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/hover:scale-/);
    expect(src).not.toMatch(/active:scale-/);
  });

  it("does not use text gradients (safety rule)", () => {
    expect(src).not.toMatch(/bg-gradient-to-/);
    expect(src).not.toMatch(/text-transparent/);
  });
});

// ---------------------------------------------------------------------------
// File-structure guardrails for ConversationViewer's search integration
// ---------------------------------------------------------------------------

describe("ConversationViewer — search integration", () => {
  const src = fs.existsSync(VIEWER_SRC) ? fs.readFileSync(VIEWER_SRC, "utf-8") : "";

  it("imports the ConversationSearch component", () => {
    expect(src).toMatch(/ConversationSearch/);
  });

  it("exposes a search highlight context for bubbles", () => {
    // We use React context to thread the current highlight query + active
    // match id into bubbles that own their text rendering. Either of two
    // identifier conventions passes the guardrail.
    expect(src).toMatch(/SearchHighlightContext|SearchHighlightProvider|useSearchHighlight/);
  });

  it("tracks active search query state", () => {
    expect(src).toMatch(/searchQuery|searchTerm|searchText/);
  });

  it("exports findMatches as a pure helper", () => {
    expect(src).toMatch(/export\s+function\s+findMatches/);
  });

  it("exports navigateMatches as a pure helper", () => {
    expect(src).toMatch(/export\s+function\s+navigateMatches/);
  });

  it("exports getMessageSearchText as a pure helper", () => {
    // Extracts the searchable text body from a TimelineMessage variant.
    // Exported so tests can drive it without mounting the component.
    expect(src).toMatch(/export\s+function\s+getMessageSearchText/);
  });
});

// ---------------------------------------------------------------------------
// Pure helper — getMessageSearchText
// ---------------------------------------------------------------------------

describe("getMessageSearchText", () => {
  it("returns the user text body", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = userMsg("u1", "please refactor the router", "2026-01-01T00:00:00Z");
    expect(getMessageSearchText(msg)).toBe("please refactor the router");
  });

  it("returns the assistant text body", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = asstMsg("a1", "I will read the router file", "2026-01-01T00:00:00Z");
    expect(getMessageSearchText(msg)).toBe("I will read the router file");
  });

  it("returns the thinking text body", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = thinkingMsg("t1", "I should check the imports first", "2026-01-01T00:00:00Z");
    expect(getMessageSearchText(msg)).toBe("I should check the imports first");
  });

  it("returns the tool_result content", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = toolResultMsg("tr1", "file not found", "2026-01-01T00:00:00Z");
    expect(getMessageSearchText(msg)).toBe("file not found");
  });

  it("serializes tool_call input for matching across param values", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = toolCallMsg(
      "tc1",
      "Read",
      { file_path: "/tmp/router.ts", offset: 0 },
      "2026-01-01T00:00:00Z",
    );
    const text = getMessageSearchText(msg);
    expect(text).toContain("Read");
    expect(text).toContain("router");
  });

  it("returns the system event summary", async () => {
    const { getMessageSearchText } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = systemMsg("turn_duration", "turn took 3.5s", "2026-01-01T00:00:00Z");
    expect(getMessageSearchText(msg)).toContain("turn took");
  });
});

// ---------------------------------------------------------------------------
// Pure helper — findMatches
// ---------------------------------------------------------------------------

describe("findMatches", () => {
  it("returns an empty match list for an empty query", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [userMsg("u1", "hello world", "2026-01-01T00:00:00Z")];
    expect(findMatches(msgs, "")).toEqual([]);
    expect(findMatches(msgs, "   ")).toEqual([]);
  });

  it("returns an empty match list when nothing matches", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [userMsg("u1", "hello world", "2026-01-01T00:00:00Z")];
    expect(findMatches(msgs, "nomatch")).toEqual([]);
  });

  it("finds a basic single match in user_text", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "please read the router file", "2026-01-01T00:00:00Z"),
    ];
    const matches = findMatches(msgs, "router");
    expect(matches).toHaveLength(1);
    expect(matches[0].rawIndex).toBe(0);
  });

  it("is case-insensitive by default", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [userMsg("u1", "Router.ts", "2026-01-01T00:00:00Z")];
    expect(findMatches(msgs, "router")).toHaveLength(1);
    expect(findMatches(msgs, "ROUTER")).toHaveLength(1);
    expect(findMatches(msgs, "RoUtEr")).toHaveLength(1);
  });

  it("finds multiple matches in the same message (multiple occurrences)", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "router router router", "2026-01-01T00:00:00Z"),
    ];
    const matches = findMatches(msgs, "router");
    expect(matches).toHaveLength(3);
    // All three matches live in the same raw message.
    expect(matches.every((m) => m.rawIndex === 0)).toBe(true);
    // Spans must be in ascending start order.
    expect(matches[0].start).toBeLessThan(matches[1].start);
    expect(matches[1].start).toBeLessThan(matches[2].start);
  });

  it("finds matches across multiple message types", async () => {
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      userMsg("u1", "router one", "2026-01-01T00:00:00Z"),
      asstMsg("a1", "router two", "2026-01-01T00:00:01Z"),
      thinkingMsg("t1", "router three", "2026-01-01T00:00:02Z"),
      toolResultMsg("tr1", "router four", "2026-01-01T00:00:03Z"),
    ];
    const matches = findMatches(msgs, "router");
    expect(matches).toHaveLength(4);
    expect(matches.map((m) => m.rawIndex)).toEqual([0, 1, 2, 3]);
  });

  it("finds matches inside collapsed-by-default message types (thinking, tool_call)", async () => {
    // Guardrail: findMatches must run over full message content regardless
    // of whether the bubble renders the text in a collapsed view. The
    // component-level auto-expand logic is what surfaces the text to the
    // reader; the helper just finds the hit.
    const { findMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msgs = [
      thinkingMsg("t1", "secret phrase here", "2026-01-01T00:00:00Z"),
      toolCallMsg(
        "tc1",
        "Bash",
        { command: "grep secret phrase /tmp/log" },
        "2026-01-01T00:00:01Z",
      ),
    ];
    const matches = findMatches(msgs, "secret");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const rawIndexes = matches.map((m) => m.rawIndex);
    expect(rawIndexes).toContain(0); // thinking
    expect(rawIndexes).toContain(1); // tool_call
  });
});

// ---------------------------------------------------------------------------
// Pure helper — navigateMatches
// ---------------------------------------------------------------------------

describe("navigateMatches", () => {
  it("returns 0 when given an empty match list", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(0, 0, "next")).toBe(0);
    expect(navigateMatches(0, 0, "prev")).toBe(0);
  });

  it("advances to the next match", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(5, 2, "next")).toBe(3);
  });

  it("wraps around to 0 when advancing past the last match", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(5, 4, "next")).toBe(0);
  });

  it("steps back to the previous match", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(5, 2, "prev")).toBe(1);
  });

  it("wraps around to the last match when stepping back from 0", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(5, 0, "prev")).toBe(4);
  });

  it("clamps a single-match list to index 0 regardless of direction", async () => {
    const { navigateMatches } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    expect(navigateMatches(1, 0, "next")).toBe(0);
    expect(navigateMatches(1, 0, "prev")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure helper — isMessageInFilteredSet
// ---------------------------------------------------------------------------
//
// The viewer combines filter state with search surfacing: a message that's
// hidden by the current filters may still be temporarily shown because it
// contains a search match. `isMessageInFilteredSet` answers "is this raw
// message in the post-filter set, ignoring search surfacing?" so the UI can
// render a "Hidden by filter — shown due to search" badge when it surfaces
// a match that wouldn't otherwise be visible.

describe("isMessageInFilteredSet", () => {
  it("returns true for messages that pass the filter", async () => {
    const { isMessageInFilteredSet, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = userMsg("u1", "hello", "2026-01-01T00:00:00Z");
    expect(isMessageInFilteredSet(msg, DEFAULT_FILTERS)).toBe(true);
  });

  it("returns false for messages hidden by a per-type filter", async () => {
    const { isMessageInFilteredSet, DEFAULT_FILTERS } = await import(
      "../client/src/components/analytics/messages/ConversationViewer"
    );
    const msg = thinkingMsg("t1", "hidden reasoning", "2026-01-01T00:00:00Z");
    const filters = { ...DEFAULT_FILTERS, thinking: false };
    expect(isMessageInFilteredSet(msg, filters)).toBe(false);
  });
});
