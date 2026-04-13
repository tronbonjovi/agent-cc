// client/src/components/analytics/sessions/SessionToolTimeline.tsx
//
// Tool timeline for the Sessions detail panel. Reuses the Messages tab's
// per-tool renderer registry directly (option A — no extraction to a shared
// module yet; if a third consumer ever appears, refactor then). Fetches
// /api/sessions/:id/messages?include=tree&types=tool_call,tool_result and
// renders the result via the existing ToolCallBlock / ToolResultBlock
// components, grouped by subagent owner using subagentContext.agentId.
//
// This replaces the bespoke ~860-LOC ToolTimeline.tsx that did its own
// chronological grouping with hand-rolled tool rendering. The Messages
// renderers are battle-tested by messages-redesign and shipping them here
// is strictly less code to maintain.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TimelineMessage,
  ToolCallMessage,
  ToolResultMessage,
  MessageTimelineResponse,
} from "@shared/session-types";
import { ToolCallBlock } from "../messages/bubbles/ToolCallBlock";
import { ToolResultBlock } from "../messages/bubbles/ToolResultBlock";
import {
  type ToolOwner,
  colorClassForOwner,
} from "./subagent-colors";

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

export interface ToolGroup {
  agentId: string | null;
  agentType: string | null;
  toolCalls: ToolCallMessage[];
  /** Indexed by callId, for pairing tool_calls with their tool_results. */
  resultsByCallId: Map<string, ToolResultMessage>;
}

/**
 * Sort messages chronologically and split them into runs grouped by the
 * subagentContext.agentId of consecutive tool_calls. A null agentId means
 * the tool ran in the parent session (session-root). Non-tool_call messages
 * are dropped from the grouping but their tool_results (if any) are
 * collected into resultsByCallId for pairing inside the active group.
 *
 * The "consecutive runs" model matches how the user reads timelines:
 * "first the parent did X, then it dispatched a subagent that did Y and Z,
 * then the parent did W". Switching back to the same owner starts a new
 * group (we don't merge non-adjacent runs).
 */
export function groupTimelineByOwner(messages: TimelineMessage[]): ToolGroup[] {
  const sorted = [...messages].sort(
    (a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
  );
  const resultsByCallId = new Map<string, ToolResultMessage>();
  for (const m of sorted) {
    if (m.type === "tool_result") {
      resultsByCallId.set(m.toolUseId, m);
    }
  }

  const groups: ToolGroup[] = [];
  let current: ToolGroup | null = null;

  for (const m of sorted) {
    if (m.type !== "tool_call") continue;
    const agentId = m.subagentContext?.agentId ?? null;
    const agentType = m.subagentContext?.agentType ?? null;
    if (!current || current.agentId !== agentId) {
      current = { agentId, agentType, toolCalls: [], resultsByCallId };
      groups.push(current);
    }
    current.toolCalls.push(m);
  }
  return groups;
}

/**
 * For errors-only mode: keep only tool_calls whose paired tool_result has
 * isError true, plus the matching tool_results so the renderer can still
 * pair them. Other message types are dropped.
 */
export function filterToolMessagesForErrorsOnly(
  messages: TimelineMessage[],
): TimelineMessage[] {
  const erroredCallIds = new Set<string>();
  for (const m of messages) {
    if (m.type === "tool_result" && m.isError) {
      erroredCallIds.add(m.toolUseId);
    }
  }
  return messages.filter((m) => {
    if (m.type === "tool_call") return erroredCallIds.has(m.callId);
    if (m.type === "tool_result") return erroredCallIds.has(m.toolUseId);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SessionToolTimelineProps {
  sessionId: string;
  errorsOnly: boolean;
}

export function SessionToolTimeline({ sessionId, errorsOnly }: SessionToolTimelineProps) {
  const url = `/api/sessions/${sessionId}/messages?include=tree&types=tool_call,tool_result`;
  const { data, isLoading, isError } = useQuery<MessageTimelineResponse>({
    queryKey: [url],
    enabled: !!sessionId,
  });

  const groups = useMemo(() => {
    if (!data?.messages) return [];
    const filtered = errorsOnly
      ? filterToolMessagesForErrorsOnly(data.messages)
      : data.messages;
    return groupTimelineByOwner(filtered);
  }, [data?.messages, errorsOnly]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading tool timeline...</div>;
  }
  if (isError) {
    return <div className="p-4 text-sm text-red-500">Failed to load tool timeline</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {errorsOnly ? "No errored tool calls in this session" : "No tool calls in this session"}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {groups.map((group, idx) => {
        const owner: ToolOwner = group.agentId
          ? { kind: "subagent-root", agentId: group.agentId }
          : { kind: "session-root", agentId: null };
        const colorClass = colorClassForOwner(owner);
        return (
          <div key={`${group.agentId ?? "root"}-${idx}`} className="space-y-1">
            {/* Group header — only for subagent runs; parent runs render flat. */}
            {group.agentId && (
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
                <span>Subagent: {group.agentType ?? "subagent"}</span>
                <span className="text-muted-foreground">({group.toolCalls.length} tools)</span>
              </div>
            )}
            <div className="space-y-1">
              {group.toolCalls.map((tc) => {
                const result = group.resultsByCallId.get(tc.callId);
                return (
                  <div key={tc.uuid} className="space-y-0.5">
                    <ToolCallBlock message={tc} />
                    {result && <ToolResultBlock message={result} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
