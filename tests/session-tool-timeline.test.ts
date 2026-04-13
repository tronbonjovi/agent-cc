import { describe, it, expect } from "vitest";
import {
  groupTimelineByOwner,
  filterToolMessagesForErrorsOnly,
} from "@/components/analytics/sessions/SessionToolTimeline";
import type { TimelineMessage, ToolCallMessage, ToolResultMessage } from "@shared/session-types";

function makeToolCall(
  uuid: string,
  callId: string,
  name: string,
  subagentId: string | null = null,
  ts = "2026-04-13T10:00:00Z",
): ToolCallMessage {
  return {
    type: "tool_call",
    uuid,
    callId,
    name,
    input: {},
    timestamp: ts,
    subagentContext: subagentId
      ? { agentId: subagentId, agentType: "Explore", description: "" }
      : null,
  };
}

function makeToolResult(
  uuid: string,
  toolUseId: string,
  isError = false,
  ts = "2026-04-13T10:00:01Z",
): ToolResultMessage {
  return {
    type: "tool_result",
    uuid,
    toolUseId,
    content: "ok",
    isError,
    timestamp: ts,
  };
}

describe("groupTimelineByOwner", () => {
  it("creates separate groups for parent-session vs subagent owners", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash", null, "2026-04-13T10:00:00Z"),
      makeToolCall("b", "c2", "Read", "agent1", "2026-04-13T10:00:01Z"),
      makeToolCall("c", "c3", "Grep", "agent1", "2026-04-13T10:00:02Z"),
      makeToolCall("d", "c4", "Edit", null, "2026-04-13T10:00:03Z"),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups).toHaveLength(3);
    expect(groups[0].agentId).toBeNull();
    expect(groups[0].toolCalls).toHaveLength(1);
    expect(groups[1].agentId).toBe("agent1");
    expect(groups[1].toolCalls).toHaveLength(2);
    expect(groups[2].agentId).toBeNull();
    expect(groups[2].toolCalls).toHaveLength(1);
  });

  it("preserves chronological order within and across groups", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Read", null, "2026-04-13T10:00:00Z"),
      makeToolCall("b", "c2", "Read", null, "2026-04-13T10:00:05Z"),
      makeToolCall("c", "c3", "Read", null, "2026-04-13T10:00:02Z"),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups[0].toolCalls.map((t) => t.callId)).toEqual(["c1", "c3", "c2"]);
  });

  it("ignores non-tool_call message types", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash", null, "2026-04-13T10:00:00Z"),
      {
        type: "user_text",
        uuid: "x",
        text: "hi",
        isMeta: false,
        timestamp: "2026-04-13T10:00:01Z",
      },
      makeToolCall("b", "c2", "Read", null, "2026-04-13T10:00:02Z"),
    ];
    const groups = groupTimelineByOwner(messages);
    expect(groups).toHaveLength(1);
    expect(groups[0].toolCalls).toHaveLength(2);
  });
});

describe("filterToolMessagesForErrorsOnly", () => {
  it("keeps only tool_calls whose paired tool_result has isError true", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash"),
      makeToolResult("ar", "c1", false),
      makeToolCall("b", "c2", "Read"),
      makeToolResult("br", "c2", true),
      makeToolCall("c", "c3", "Grep"),
      makeToolResult("cr", "c3", true),
    ];
    const filtered = filterToolMessagesForErrorsOnly(messages);
    const callIds = filtered
      .filter((m): m is ToolCallMessage => m.type === "tool_call")
      .map((m) => m.callId);
    expect(callIds).toEqual(["c2", "c3"]);
  });

  it("keeps results so the renderer can pair them", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("b", "c2", "Read"),
      makeToolResult("br", "c2", true),
    ];
    const filtered = filterToolMessagesForErrorsOnly(messages);
    expect(filtered.find((m) => m.type === "tool_result")).toBeTruthy();
  });

  it("returns empty array when nothing errored", () => {
    const messages: TimelineMessage[] = [
      makeToolCall("a", "c1", "Bash"),
      makeToolResult("ar", "c1", false),
    ];
    expect(filterToolMessagesForErrorsOnly(messages)).toEqual([]);
  });
});
