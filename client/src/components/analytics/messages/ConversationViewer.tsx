// client/src/components/analytics/messages/ConversationViewer.tsx
//
// Messages tab — conversation viewer (messages-redesign task004 + task006).
//
// This component owns the message stream for one session:
//   - fetches `GET /api/sessions/:id/messages?include=tree`
//   - orders messages chronologically (defensive; the server should already
//     return them in order, but sidechains are merged in and we want a stable
//     guarantee regardless of flattener quirks)
//   - applies a `FilterState` (type-level on/off toggles)
//   - groups consecutive messages belonging to the same subagent into
//     <SidechainGroup> wrappers using the authoritative `subagentContext.agentId`
//     supplied by the tree-enriched response, falling back to the
//     consecutive `isSidechain` heuristic when the tree is unavailable
//   - renders a header banner in the unavailable fallback case
//   - provides jump-to-top / jump-to-bottom controls + a "Message X of Y"
//     position indicator
//   - handles keyboard navigation (Up/Down/Enter/Escape)
//   - preserves scroll position across filter changes by anchoring to the
//     nearest visible message (walks back, then forward, then gives up)
//   - falls back to an empty state when every filter hides every message
//   - (task006) in-conversation search: highlights matches, navigates them,
//     auto-expands collapsed bubbles, surfaces filter-hidden messages that
//     contain matches. Threading done via React context so bubbles opt in
//     by calling `useSearchHighlight()` instead of every caller plumbing a
//     `searchHighlight` prop through the dispatcher.
//
// Out of scope:
//   - the filter bar UI itself — we accept a FilterState prop and the
//     parent MessagesTab owns toggling it
//   - session picking (SessionSidebar handles that)
//
// Design notes:
//   - Pure helpers (filterMessages, groupMessagesForRender,
//     sortMessagesByTimestamp, computeVisiblePosition,
//     findAnchorAfterFilterChange) are exported so tests can drive them
//     without a DOM. Matches the convention used by SessionSidebar.
//   - Windowed rendering is flagged in the contract as "consider for 100+
//     messages." React rendering of 100-500 chat bubbles is fine for the
//     first iteration — we skip react-window until we see a real perf
//     regression. The lazy-expand behavior already lives in ThinkingBlock
//     and ToolResultBlock, so collapsed items don't render heavy markdown.

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, AlertCircle, Search } from "lucide-react";
import type {
  MessageTimelineResponse,
  TimelineMessage,
  TimelineSubagentContext,
} from "@shared/session-types";
import { renderMessage, SidechainGroup } from "./bubbles";
import { ConversationSearch } from "./ConversationSearch";
import {
  SearchHighlightContext,
  type SearchHighlightValue,
} from "./search-highlight";

// Re-export the search highlight hook + helper so the test file and any
// downstream callers can import them from the viewer module directly,
// matching the task004 convention of exposing pure helpers via the
// viewer's barrel.
export { useSearchHighlight, highlightText } from "./search-highlight";
export type { SearchHighlightValue } from "./search-highlight";

// ---------------------------------------------------------------------------
// Filter state — shape consumed by task005's filter bar.
// ---------------------------------------------------------------------------

/**
 * Per-type visibility toggles. Task005's filter bar builds one of these
 * and hands it in as a prop; this viewer treats it as read-only state.
 *
 * The first seven keys map 1:1 to a TimelineMessage.type variant. Adding a
 * new message type means adding a new key here AND a case in
 * `isMessageVisible`.
 *
 * The two trailing keys (`sidechains`, `errorsOnly`) are orthogonal cross-
 * cutting filters added in task005 so the FilterBar's "Sidechains" and
 * "Errors Only" pills bind to the same canonical FilterState rather than
 * forking it. Both are optional so existing call sites that build a
 * 7-key FilterState literal continue to type-check; missing values are
 * treated as the safe default (sidechains visible, errorsOnly off).
 */
export interface FilterState {
  userText: boolean;
  assistantText: boolean;
  thinking: boolean;
  toolCalls: boolean;
  toolResults: boolean;
  systemEvents: boolean;
  skillInvocations: boolean;
  /** When false, hides every message that lives inside a subagent run. */
  sidechains?: boolean;
  /** When true, shows only tool_result messages where isError is set. */
  errorsOnly?: boolean;
}

/** All seven types on — the first-load default for a freshly opened session. */
export const DEFAULT_FILTERS: FilterState = {
  userText: true,
  assistantText: true,
  thinking: true,
  toolCalls: true,
  toolResults: true,
  systemEvents: true,
  skillInvocations: true,
  sidechains: true,
  errorsOnly: false,
};

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests.
// ---------------------------------------------------------------------------

/**
 * True if `msg` is a sidechain record the `sidechains=false` filter would
 * hide — either `isSidechain` is set or a `subagentContext` is attached.
 * Both signals can stand alone: the scanner sometimes stamps only one.
 */
function isSidechainMessage(msg: TimelineMessage): boolean {
  return msg.isSidechain === true || msg.subagentContext != null;
}

/**
 * True if `msg` passes the per-type toggles. The cross-cutting `errorsOnly`
 * and `sidechains` filters are NOT applied here — they live in
 * `filterMessages` because `errorsOnly` needs surrounding-context logic
 * that a one-message-at-a-time predicate can't express (see step 5).
 *
 * Exhaustive over TimelineMessage.type — a never-guard default forces a
 * compile error when a new variant lands.
 */
function passesTypeFilter(msg: TimelineMessage, filters: FilterState): boolean {
  switch (msg.type) {
    case "user_text":
      return filters.userText;
    case "assistant_text":
      return filters.assistantText;
    case "thinking":
      return filters.thinking;
    case "tool_call":
      return filters.toolCalls;
    case "tool_result":
      return filters.toolResults;
    case "system_event":
      return filters.systemEvents;
    case "skill_invocation":
      return filters.skillInvocations;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

/**
 * True if `msg` passes the full filter state, including cross-cutting
 * sidechain gating. Does NOT apply the `errorsOnly` surrounding-context
 * enrichment — that's per-set, not per-message. Callers that need to
 * know "is this message in the post-filter set?" (e.g. the search
 * surfacing indicator) should use `isMessageInFilteredSet`.
 */
function isMessageVisible(msg: TimelineMessage, filters: FilterState): boolean {
  // Sidechain precedence: hide sidechain messages first, before the
  // errorsOnly check. This is the documented "hide sidechains wins over
  // show errors" rule from step 5 of the task006 contract.
  if (filters.sidechains === false && isSidechainMessage(msg)) {
    return false;
  }

  // Errors-only mode: short-circuit after the sidechain gate so sidechain
  // errors stay hidden. Any non-errored-tool_result is hidden.
  if (filters.errorsOnly === true) {
    if (msg.type !== "tool_result") return false;
    return msg.isError === true;
  }

  return passesTypeFilter(msg, filters);
}

/**
 * Public "is this message in the post-filter set?" predicate used by the
 * search surfacing indicator: when a search match lives in a filter-hidden
 * message we still want to render it, but the bubble should flag that it
 * normally wouldn't be visible. Exported for testing.
 */
export function isMessageInFilteredSet(
  msg: TimelineMessage,
  filters: FilterState,
): boolean {
  return isMessageVisible(msg, filters);
}

/**
 * Filter the raw message stream down to the subset matching `filters`.
 * Order is preserved.
 *
 * Step 5 of task006: when `filters.errorsOnly === true`, each errored
 * tool_result is surfaced together with its surrounding context —
 *   (a) the errored tool_result itself,
 *   (b) its paired tool_call (matched by `callId === toolUseId`),
 *   (c) the nearest preceding assistant_text (the turn that issued the call).
 * Assistant turns and tool_calls are deduplicated: one assistant turn
 * issuing multiple errored calls appears exactly once in the output, and
 * a tool_call can't duplicate itself. The assembled set is returned in
 * chronological order (stable sort over raw indices).
 *
 * The `sidechains=false` precedence is handled before the error scan:
 * sidechain records never make it into the assembled set, so sidechain
 * errors stay hidden in errorsOnly + sidechains=false mode.
 *
 * Exported for testing.
 */
export function filterMessages(
  messages: TimelineMessage[],
  filters: FilterState,
): TimelineMessage[] {
  // Fast path: errorsOnly off → straightforward per-message gate.
  if (filters.errorsOnly !== true) {
    return messages.filter((m) => isMessageVisible(m, filters));
  }

  // errorsOnly path: walk the stream, find each errored tool_result, then
  // include its paired tool_call + preceding assistant turn. Collect into
  // a Set<number> of raw indices so dedup is automatic. Then materialize
  // the result in ascending-index order.
  const keep = new Set<number>();
  const hideSidechains = filters.sidechains === false;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== "tool_result") continue;
    if (msg.isError !== true) continue;
    // Sidechain precedence — skip errors inside subagent runs when
    // sidechains are hidden.
    if (hideSidechains && isSidechainMessage(msg)) continue;

    keep.add(i);

    // Walk backwards to find the paired tool_call (same callId) and the
    // nearest assistant_text before that call. Stops on the first match
    // for each so a single pass over indices < i is enough.
    const pairId = msg.toolUseId;
    let toolCallIdx = -1;
    let assistantIdx = -1;

    for (let j = i - 1; j >= 0; j--) {
      const prev = messages[j];
      // Skip sidechain records in the walk when hidden — they can't be
      // surfaced as context for a top-level error.
      if (hideSidechains && isSidechainMessage(prev)) continue;

      if (toolCallIdx === -1 && prev.type === "tool_call" && prev.callId === pairId) {
        toolCallIdx = j;
        continue; // keep walking — we still need the assistant turn
      }
      if (
        toolCallIdx !== -1 &&
        assistantIdx === -1 &&
        prev.type === "assistant_text"
      ) {
        assistantIdx = j;
        break;
      }
      // Edge case: no tool_call pairs the result but an earlier
      // assistant_text exists. We only surface the assistant when we
      // found a tool_call — the contract is "the turn that issued the
      // tool_call," so without a tool_call there's nothing to anchor to.
    }

    if (toolCallIdx >= 0) keep.add(toolCallIdx);
    if (assistantIdx >= 0) keep.add(assistantIdx);
  }

  // Materialize in chronological (raw-index) order.
  const sortedIndices = Array.from(keep).sort((a, b) => a - b);
  return sortedIndices.map((idx) => messages[idx]);
}

/**
 * Return a new array sorted ascending by timestamp. Defensive — the server
 * normally returns records in chronological order, but sidechain merging is
 * fiddly and we do not want to depend on flattener ordering here.
 *
 * Exported for testing.
 */
export function sortMessagesByTimestamp(
  messages: TimelineMessage[],
): TimelineMessage[] {
  // ISO-8601 strings sort lexicographically in chronological order, so a
  // simple localeCompare-free string compare is correct and avoids any
  // locale / timezone surprise.
  return [...messages].sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });
}

/**
 * One item in the render list the viewer walks:
 *   - `single` — a standalone message (rendered via `renderMessage`)
 *   - `sidechain` — a run of messages belonging to one subagent (rendered
 *     via <SidechainGroup>)
 */
export type RenderGroup =
  | { kind: "single"; message: TimelineMessage }
  | {
      kind: "sidechain";
      subagentContext: TimelineSubagentContext | null;
      members: TimelineMessage[];
    };

/**
 * Walk a chronological message list and produce the render-ready group list.
 *
 * Tree-ok path (authoritative): consecutive messages sharing the same
 * `subagentContext.agentId` collapse into one sidechain group. Messages
 * without a `subagentContext` become single items, even if they carry
 * `isSidechain: true` — we trust the tree over the heuristic.
 *
 * Tree-unavailable path (fallback): we don't have agentIds, so we use the
 * legacy heuristic — consecutive messages with `isSidechain: true` collapse
 * into one anonymous group (subagentContext = null).
 *
 * Exported for testing.
 */
export function groupMessagesForRender(
  messages: TimelineMessage[],
  treeStatus: "ok" | "unavailable",
): RenderGroup[] {
  const groups: RenderGroup[] = [];

  if (treeStatus === "ok") {
    let current: {
      agentId: string;
      context: TimelineSubagentContext;
      members: TimelineMessage[];
    } | null = null;

    const flush = () => {
      if (!current) return;
      groups.push({
        kind: "sidechain",
        subagentContext: current.context,
        members: current.members,
      });
      current = null;
    };

    for (const msg of messages) {
      const ctx = msg.subagentContext ?? null;
      if (ctx && ctx.agentId) {
        if (current && current.agentId === ctx.agentId) {
          current.members.push(msg);
        } else {
          flush();
          current = { agentId: ctx.agentId, context: ctx, members: [msg] };
        }
      } else {
        flush();
        groups.push({ kind: "single", message: msg });
      }
    }
    flush();
    return groups;
  }

  // Unavailable fallback — consecutive isSidechain runs collapse into an
  // anonymous group. Null context tells SidechainGroup to render its
  // generic "Sidechain (N messages)" label.
  let fallback: TimelineMessage[] | null = null;
  const flushFallback = () => {
    if (!fallback) return;
    groups.push({
      kind: "sidechain",
      subagentContext: null,
      members: fallback,
    });
    fallback = null;
  };

  for (const msg of messages) {
    if (msg.isSidechain) {
      if (!fallback) fallback = [];
      fallback.push(msg);
    } else {
      flushFallback();
      groups.push({ kind: "single", message: msg });
    }
  }
  flushFallback();
  return groups;
}

/**
 * Compute the 1-based "Message X of Y" position for a given raw index,
 * counting only messages that survive the filter.
 *
 * Contract:
 *   - If the target itself is hidden, `index` reports the count of visible
 *     messages at-or-before the target (i.e. collapses to the previous
 *     visible position, or 0 when none).
 *   - Empty visible set returns `{ index: 0, total: 0 }`.
 *
 * Exported for testing.
 */
export function computeVisiblePosition(
  messages: TimelineMessage[],
  rawIndex: number,
  filters: FilterState,
): { index: number; total: number } {
  let total = 0;
  let index = 0;
  for (let i = 0; i < messages.length; i++) {
    const visible = isMessageVisible(messages[i], filters);
    if (visible) total += 1;
    if (i <= rawIndex && visible) index = total;
  }
  if (total === 0) return { index: 0, total: 0 };
  return { index, total };
}

/**
 * Pick a new anchor raw-index after a filter change: start from `rawIndex`,
 * walk backwards until we find a still-visible message, then forwards if
 * nothing earlier is visible. Returns `-1` if nothing is visible in the
 * whole stream (empty state will render a placeholder anyway).
 *
 * The anchor index is used by the viewer to scroll the freshly visible
 * group back into view, so the reader doesn't lose their place when they
 * toggle a filter.
 *
 * Exported for testing.
 */
export function findAnchorAfterFilterChange(
  messages: TimelineMessage[],
  rawIndex: number,
  filters: FilterState,
): number {
  if (messages.length === 0) return -1;
  const start = Math.max(0, Math.min(rawIndex, messages.length - 1));
  // Walk back first — the reader's eye was already above the anchor, so a
  // slightly-earlier message is the least disruptive jump.
  for (let i = start; i >= 0; i--) {
    if (isMessageVisible(messages[i], filters)) return i;
  }
  // Nothing earlier is visible — walk forward.
  for (let i = start + 1; i < messages.length; i++) {
    if (isMessageVisible(messages[i], filters)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Search helpers (task006)
// ---------------------------------------------------------------------------

/**
 * One search hit. `rawIndex` points into the raw message array so the
 * viewer can scroll/surface the owning bubble; `start` and `end` are
 * character offsets into the message's searchable text (from
 * `getMessageSearchText`). `globalIndex` is the match's position in the
 * full ordered match list (0-based) — used as the DOM anchor for the
 * current-match scroll target.
 */
export interface SearchMatch {
  rawIndex: number;
  start: number;
  end: number;
  globalIndex: number;
}

/**
 * Extract the searchable text body from a TimelineMessage. Different
 * variants have different text fields; this centralizes the mapping so
 * both `findMatches` and the bubble-level highlight hook read the same
 * string. Exhaustive over TimelineMessage.type.
 *
 * For tool_call, we serialize the `name` + the stringified `input` so
 * searches can hit params like file paths, commands, queries, etc.
 * (the fallback renderer picks the first string-valued input field for
 * its compact summary, but findMatches scans the whole input object).
 *
 * Exported for testing.
 */
export function getMessageSearchText(msg: TimelineMessage): string {
  switch (msg.type) {
    case "user_text":
      return msg.text;
    case "assistant_text":
      return msg.text;
    case "thinking":
      return msg.text;
    case "tool_call": {
      // Include the tool name so "Read" or "Bash" query terms match, then
      // serialize the input object so command strings, paths, queries,
      // patterns etc. are all searchable.
      return `${msg.name} ${JSON.stringify(msg.input)}`;
    }
    case "tool_result":
      return msg.content;
    case "system_event":
      return msg.summary;
    case "skill_invocation":
      return `/${msg.commandName} ${msg.commandArgs}`;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

/**
 * Scan every message for all occurrences of `query` and return a flat
 * list of matches in document order (raw-index ascending, then span
 * position within a message). Case-insensitive — users expect
 * Ctrl+F-style behavior, not regex.
 *
 * Empty / whitespace-only queries return an empty list so the UI doesn't
 * highlight everything when the search field is cleared.
 *
 * Exported for testing.
 */
export function findMatches(
  messages: TimelineMessage[],
  query: string,
): SearchMatch[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const needle = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];
  let globalIndex = 0;
  for (let i = 0; i < messages.length; i++) {
    const body = getMessageSearchText(messages[i]).toLowerCase();
    if (body.length === 0) continue;
    let from = 0;
    while (from <= body.length - needle.length) {
      const hit = body.indexOf(needle, from);
      if (hit < 0) break;
      matches.push({
        rawIndex: i,
        start: hit,
        end: hit + needle.length,
        globalIndex: globalIndex++,
      });
      from = hit + needle.length;
    }
  }
  return matches;
}

/**
 * Advance or retreat the current-match pointer with wrap-around. Empty
 * match lists clamp to 0. Single-match lists always return 0.
 *
 * Exported for testing.
 */
export function navigateMatches(
  total: number,
  currentIndex: number,
  direction: "next" | "prev",
): number {
  if (total <= 0) return 0;
  if (total === 1) return 0;
  if (direction === "next") {
    return (currentIndex + 1) % total;
  }
  // prev with wrap-around
  return (currentIndex - 1 + total) % total;
}

// ---------------------------------------------------------------------------
// Search highlight threading — context, hook, and highlightText helper
// live in `./search-highlight.tsx` so bubble components can import them
// without forming a circular dependency through `./bubbles/dispatcher`.
// Re-exports above make the surface identical to pre-task006 callers.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ConversationViewerProps {
  /** Session id to fetch messages for. When undefined, renders an empty state. */
  sessionId: string | undefined;
  /** Per-type visibility toggles from the (task005) filter bar. */
  filters: FilterState;
}

/**
 * Conversation viewer — fetches and renders one session's full message
 * timeline with scroll management and keyboard navigation.
 */
export function ConversationViewer({
  sessionId,
  filters,
}: ConversationViewerProps) {
  // React Query default queryFn (see client/src/lib/queryClient.ts) uses
  // `queryKey.join("/")` as the fetch URL, so the key IS the URL. Passing
  // `?include=tree` as part of the key makes every request tree-enriched
  // by default, matching the contract.
  const url = sessionId
    ? `/api/sessions/${sessionId}/messages?include=tree`
    : null;
  const { data, isLoading, isError } = useQuery<MessageTimelineResponse>({
    queryKey: [url],
    enabled: !!url,
  });

  // Scroll container — all jump / scroll-to-anchor logic targets this ref.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Per-message DOM refs keyed by raw message index so we can scroll a
  // specific bubble into view when filters change or the user presses a
  // nav key. Using a Map keeps lookups O(1) and lets us reset on every
  // render without leaking stale nodes.
  const messageRefs = useRef<Map<number, HTMLElement>>(new Map());

  const registerMessageRef = useCallback(
    (rawIndex: number) => (el: HTMLElement | null) => {
      const map = messageRefs.current;
      if (el) map.set(rawIndex, el);
      else map.delete(rawIndex);
    },
    [],
  );

  // Normalize: sort once, then everything downstream walks this list.
  // `rawMessages` here is the full stream — filtering happens below so
  // the position indicator can count against the filtered subset while
  // keyboard nav still walks against the visible subset.
  const rawMessages = useMemo<TimelineMessage[]>(() => {
    if (!data?.messages) return [];
    return sortMessagesByTimestamp(data.messages);
  }, [data?.messages]);

  const treeStatus: "ok" | "unavailable" =
    data?.meta?.treeStatus === "ok"
      ? "ok"
      : data?.meta?.treeStatus === "unavailable"
        ? "unavailable"
        : // Absent meta = request didn't include the tree at all, which
          // shouldn't happen here (we always request it) — treat as unavailable
          // for safety so we never claim authoritative grouping we don't have.
          "unavailable";

  // Filtered subset, keeping raw-index mapping for the ref scroll target.
  // For errorsOnly mode, filterMessages returns a reordered / surrounding-
  // context set rather than a strict per-message subset, so we run
  // filterMessages once and then look up each result's raw index.
  const filteredWithRawIdx = useMemo(() => {
    const filtered = filterMessages(rawMessages, filters);
    // Preserve raw-index mapping by using identity (filterMessages returns
    // a subset that points into rawMessages so each element is ===).
    return filtered.map((msg) => ({
      msg,
      rawIndex: rawMessages.indexOf(msg),
    }));
  }, [rawMessages, filters]);

  // ---------- task006 search state ----------
  // The user toggles the search bar open via the magnifier button in the
  // header or by pressing `/` or Ctrl+F inside the viewer. When closed
  // query is "" and no surfacing happens.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // All matches across the full (unfiltered) stream. Search scope is
  // intentionally "full content regardless of filter" per task006 step 4.
  const matches = useMemo(() => {
    if (!searchOpen || searchQuery.trim().length === 0) return [];
    return findMatches(rawMessages, searchQuery);
  }, [searchOpen, searchQuery, rawMessages]);

  // Set of raw indices that own at least one match. Used to decide
  // whether a filter-hidden message should be temporarily surfaced.
  const matchedRawIndices = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) set.add(m.rawIndex);
    return set;
  }, [matches]);

  // Effective visible list: union of the filter result + any raw indices
  // that own a match and weren't already visible. Rendered in raw-index
  // order so surfacing a hidden message doesn't scramble the timeline.
  const visibleWithRawIdx = useMemo(() => {
    const visibleIdxSet = new Set(filteredWithRawIdx.map((v) => v.rawIndex));
    const extraIndices: number[] = [];
    Array.from(matchedRawIndices).forEach((idx) => {
      if (!visibleIdxSet.has(idx)) extraIndices.push(idx);
    });
    if (extraIndices.length === 0) return filteredWithRawIdx;
    // Merge + re-sort by raw index so surfacing a filter-hidden message
    // lands it in the correct chronological slot.
    const merged = [
      ...filteredWithRawIdx,
      ...extraIndices.map((rawIndex) => ({
        msg: rawMessages[rawIndex],
        rawIndex,
      })),
    ];
    merged.sort((a, b) => a.rawIndex - b.rawIndex);
    return merged;
  }, [filteredWithRawIdx, matchedRawIndices, rawMessages]);

  // Group the *filtered* stream for rendering. Grouping after filtering
  // means hiding a tool_call inside a subagent run doesn't split the
  // group — the surviving messages stay in one block.
  const groups = useMemo(
    () =>
      groupMessagesForRender(
        visibleWithRawIdx.map((v) => v.msg),
        treeStatus,
      ),
    [visibleWithRawIdx, treeStatus],
  );

  // Reset current match index whenever matches change (new query, new
  // data) — keep it in range if matches shrank.
  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
      return;
    }
    setCurrentMatchIndex((idx) => (idx >= matches.length ? 0 : idx));
  }, [matches]);

  // Current match — the highlighted "active" hit.
  const currentMatch = matches[currentMatchIndex];

  // Map from rawIndex → starting global match offset. Built from the
  // matches list. Lets bubbles resolve their own offset without knowing
  // their raw position.
  const rawIndexToGlobalOffset = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of matches) {
      if (!map.has(m.rawIndex)) map.set(m.rawIndex, m.globalIndex);
    }
    return map;
  }, [matches]);

  // Search highlight context value — rebuilt when query or current match
  // changes. Bubbles consume this via `useSearchHighlight` to decide
  // whether to wrap matched spans.
  const searchHighlightValue = useMemo<SearchHighlightValue | null>(() => {
    if (!searchOpen) return null;
    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) return null;
    return {
      query: trimmed,
      needle: trimmed.toLowerCase(),
      currentRawIndex: currentMatch?.rawIndex ?? -1,
      currentGlobalIndex: currentMatch?.globalIndex ?? -1,
      buildAnchorId: (globalIndex: number) =>
        `conv-search-match-${globalIndex}`,
      getGlobalOffsetFor: (msg: TimelineMessage) => {
        const rawIdx = rawMessages.indexOf(msg);
        if (rawIdx < 0) return -1;
        return rawIndexToGlobalOffset.get(rawIdx) ?? -1;
      },
    };
  }, [searchOpen, searchQuery, currentMatch, rawMessages, rawIndexToGlobalOffset]);

  // Auto-expand + scroll on current-match change. We lean on the
  // existing querySelector pattern from task004's Enter keyboard handler:
  // the collapsed disclosure buttons (ThinkingBlock, ToolCallBlock,
  // ToolResultBlock, SidechainGroup) all expose `aria-expanded="false"`
  // when collapsed. Clicking that button flips the bubble's internal
  // state; after a frame we scroll the actual match anchor into view.
  useEffect(() => {
    if (!currentMatch) return;
    const el = messageRefs.current.get(currentMatch.rawIndex);
    if (!el) return;
    // Expand every collapsed disclosure inside the bubble so nested
    // content (e.g. a tool_call inside a sidechain) is accessible.
    const collapsed = el.querySelectorAll<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    collapsed.forEach((btn) => btn.click());

    // Wait one rAF so React commits the expanded state, then scroll the
    // exact match anchor (if rendered) into view. Fall back to scrolling
    // the whole bubble when the span isn't rendered yet (first paint
    // race; the next effect run will handle it).
    const raf = requestAnimationFrame(() => {
      const anchorId = `conv-search-match-${currentMatch.globalIndex}`;
      const anchor = el.querySelector<HTMLElement>(
        `[data-match-anchor="${anchorId}"]`,
      );
      if (anchor && typeof anchor.scrollIntoView === "function") {
        anchor.scrollIntoView({ block: "center" });
      } else if (typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [currentMatch]);

  // Keyboard focus: which visible message is "current"? Drives both the
  // position indicator and arrow-key navigation. We index into
  // `visibleWithRawIdx`, not the raw list.
  const [focusedVisibleIndex, setFocusedVisibleIndex] = useState(0);

  // When the filtered set changes (filter toggles, new data), preserve
  // scroll by anchoring to the nearest visible message around the current
  // focused raw index. Use useLayoutEffect so the scroll happens before
  // the browser paints — no flash of "jumped to top" then "jumped back."
  const prevFocusedRawIndexRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (rawMessages.length === 0) {
      prevFocusedRawIndexRef.current = null;
      return;
    }
    const prevRaw = prevFocusedRawIndexRef.current;
    if (prevRaw === null) {
      // First data arrival — land on the first visible message, no scroll.
      prevFocusedRawIndexRef.current =
        visibleWithRawIdx[0]?.rawIndex ?? null;
      setFocusedVisibleIndex(0);
      return;
    }
    // Walk to find a still-visible anchor near the old position.
    const anchorRaw = findAnchorAfterFilterChange(
      rawMessages,
      prevRaw,
      filters,
    );
    if (anchorRaw < 0) {
      prevFocusedRawIndexRef.current = null;
      setFocusedVisibleIndex(0);
      return;
    }
    const newVisibleIndex = visibleWithRawIdx.findIndex(
      (v) => v.rawIndex === anchorRaw,
    );
    if (newVisibleIndex >= 0) {
      setFocusedVisibleIndex(newVisibleIndex);
      prevFocusedRawIndexRef.current = anchorRaw;
      // Scroll the anchor into view (nearest block — no animation, just
      // land on the right spot).
      const el = messageRefs.current.get(anchorRaw);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
    // Dependency: filters drives re-anchoring. rawMessages is handled by
    // its own effect above on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, rawMessages]);

  // Jump controls show only after the user has scrolled — avoids cluttering
  // a short conversation with useless buttons.
  const [scrollProgress, setScrollProgress] = useState({
    atTop: true,
    atBottom: true,
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const atTop = el.scrollTop <= 8;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
      setScrollProgress({ atTop, atBottom });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [rawMessages.length]);

  // Keyboard navigation: Up/Down move focus, Enter/Escape are forwarded via
  // a CustomEvent so individual bubbles (ThinkingBlock, ToolCallBlock,
  // SidechainGroup) can react if they own the focused message. For now we
  // implement the scroll half — individual bubble expand/collapse is a
  // follow-up once we wire the viewer in task005 and can observe real usage.
  //
  // task006: `/` opens the search bar. Ctrl+F also opens it (intercepts the
  // browser find-in-page because Ctrl+F is the obvious mental model).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inEditor =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const ceditable = (e.target as HTMLElement | null)?.isContentEditable;

      // Search toggle shortcut — `/` or Ctrl+F. Only fires when the focus
      // is not already inside an input, so typing `/` in the search field
      // works normally.
      if (
        !inEditor &&
        !ceditable &&
        (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f"))
      ) {
        e.preventDefault();
        setSearchOpen(true);
        // Focus the search input on next tick (the input mounts when
        // searchOpen flips to true).
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (inEditor || ceditable) return;
      if (visibleWithRawIdx.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedVisibleIndex((i) => {
          const next = Math.min(i + 1, visibleWithRawIdx.length - 1);
          const raw = visibleWithRawIdx[next]?.rawIndex;
          if (raw !== undefined) {
            prevFocusedRawIndexRef.current = raw;
            const el = messageRefs.current.get(raw);
            if (el && typeof el.scrollIntoView === "function") {
              el.scrollIntoView({ block: "nearest" });
            }
          }
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedVisibleIndex((i) => {
          const next = Math.max(i - 1, 0);
          const raw = visibleWithRawIdx[next]?.rawIndex;
          if (raw !== undefined) {
            prevFocusedRawIndexRef.current = raw;
            const el = messageRefs.current.get(raw);
            if (el && typeof el.scrollIntoView === "function") {
              el.scrollIntoView({ block: "nearest" });
            }
          }
          return next;
        });
      } else if (e.key === "Enter") {
        // Forward to the focused element so its own click/expand handler
        // fires. Safe no-op when the focused node isn't expandable.
        const raw = visibleWithRawIdx[focusedVisibleIndex]?.rawIndex;
        if (raw !== undefined) {
          const el = messageRefs.current.get(raw);
          const btn = el?.querySelector<HTMLButtonElement>(
            'button[aria-expanded="false"]',
          );
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
      } else if (e.key === "Escape") {
        const raw = visibleWithRawIdx[focusedVisibleIndex]?.rawIndex;
        if (raw !== undefined) {
          const el = messageRefs.current.get(raw);
          const btn = el?.querySelector<HTMLButtonElement>(
            'button[aria-expanded="true"]',
          );
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleWithRawIdx, focusedVisibleIndex]);

  // Position indicator — counts the visible set.
  const position = useMemo(() => {
    const total = visibleWithRawIdx.length;
    const index = Math.min(focusedVisibleIndex + 1, total);
    return { index: total === 0 ? 0 : index, total };
  }, [visibleWithRawIdx, focusedVisibleIndex]);

  // Jump handlers.
  const jumpTo = useCallback((dir: "top" | "bottom") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: dir === "top" ? 0 : el.scrollHeight,
      behavior: "auto",
    });
    if (dir === "top") {
      setFocusedVisibleIndex(0);
      const raw = visibleWithRawIdx[0]?.rawIndex;
      if (raw !== undefined) prevFocusedRawIndexRef.current = raw;
    } else {
      const last = Math.max(0, visibleWithRawIdx.length - 1);
      setFocusedVisibleIndex(last);
      const raw = visibleWithRawIdx[last]?.rawIndex;
      if (raw !== undefined) prevFocusedRawIndexRef.current = raw;
    }
  }, [visibleWithRawIdx]);

  // Search navigation callbacks. Navigating past the last match wraps to
  // the first; before the first wraps to the last. The current-match
  // effect handles auto-expand + scroll, so these handlers only move
  // the index.
  const handleSearchNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((idx) =>
      navigateMatches(matches.length, idx, "next"),
    );
  }, [matches]);

  const handleSearchPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((idx) =>
      navigateMatches(matches.length, idx, "prev"),
    );
  }, [matches]);

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
    setSearchOpen(false);
  }, []);

  const toggleSearchOpen = useCallback(() => {
    setSearchOpen((open) => {
      const next = !open;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else {
        setSearchQuery("");
        setCurrentMatchIndex(0);
      }
      return next;
    });
  }, []);

  // Set of raw indices that are "surfaced by search" — i.e. matched but
  // would otherwise be hidden by the current filter state. Used to tag
  // their bubble wrappers with a "hidden by filter" indicator so the
  // reader knows why they're seeing them.
  const surfacedRawIndices = useMemo(() => {
    const set = new Set<number>();
    if (matchedRawIndices.size === 0) return set;
    Array.from(matchedRawIndices).forEach((idx) => {
      if (!isMessageInFilteredSet(rawMessages[idx], filters)) set.add(idx);
    });
    return set;
  }, [matchedRawIndices, rawMessages, filters]);

  // Render ----------------------------------------------------------------

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a session to view its messages.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading messages...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-destructive">
        <AlertCircle className="h-4 w-4 mr-2" />
        Failed to load messages.
      </div>
    );
  }

  if (rawMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No messages in this session.
      </div>
    );
  }

  // Header bar — search toggle + active search component. Shared across
  // the filter-empty and the normal render paths so the user can open
  // search even when no messages match the current filter state.
  const header: ReactNode = (
    <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-border/30 bg-background">
      {searchOpen ? (
        <ConversationSearch
          ref={searchInputRef}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          totalMatches={matches.length}
          currentIndex={matches.length === 0 ? -1 : currentMatchIndex}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClear={handleSearchClear}
        />
      ) : (
        <button
          type="button"
          onClick={toggleSearchOpen}
          data-action="open-search"
          aria-label="Open search"
          title="Search conversation (/)"
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (visibleWithRawIdx.length === 0) {
    return (
      <div className="relative flex flex-col h-full">
        {treeStatus === "unavailable" && <UnavailableBanner />}
        {header}
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          No messages match the current filters.
        </div>
      </div>
    );
  }

  // `previousModel` threads across top-level assistant turns so
  // AssistantBlock's model-change badge only fires on an actual switch.
  // SidechainGroup maintains its own local previousModel inside the group.
  let previousModel: string | undefined;

  return (
    <SearchHighlightContext.Provider value={searchHighlightValue}>
      <div className="relative flex flex-col h-full">
        {treeStatus === "unavailable" && <UnavailableBanner />}
        {header}

        {/* Scrollable message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-3"
          data-testid="conversation-scroll-region"
        >
          <div className="flex flex-col gap-2 max-w-4xl mx-auto">
            {groups.map((group, groupIdx) => {
              if (group.kind === "sidechain") {
                // SidechainGroup renders its own wrapper — we need the first
                // member's raw index so keyboard nav / scroll-into-view can
                // still target "this group" by its top message.
                const firstMember = group.members[0];
                const rawIndex = rawMessages.indexOf(firstMember);
                return (
                  <div
                    key={`group-${groupIdx}`}
                    ref={registerMessageRef(rawIndex)}
                    data-raw-index={rawIndex}
                  >
                    <SidechainGroup
                      subagentContext={group.subagentContext}
                      children={group.members}
                    />
                  </div>
                );
              }
              // single
              const msg = group.message;
              const rawIndex = rawMessages.indexOf(msg);
              const node = renderMessage(msg, { previousModel });
              if (msg.type === "assistant_text") previousModel = msg.model;
              const key =
                "uuid" in msg && typeof msg.uuid === "string"
                  ? msg.uuid
                  : `msg-${groupIdx}`;
              const surfacedBySearch = surfacedRawIndices.has(rawIndex);
              return (
                <div
                  key={key}
                  ref={registerMessageRef(rawIndex)}
                  data-raw-index={rawIndex}
                  data-surfaced-by-search={surfacedBySearch ? "true" : undefined}
                >
                  {surfacedBySearch && (
                    <div className="mb-1 px-2 py-0.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded inline-block font-mono">
                      Hidden by filter — shown due to search
                    </div>
                  )}
                  <Fragment>{node}</Fragment>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating scroll controls + position indicator — only show when
            the conversation is long enough to actually scroll. */}
        {!(scrollProgress.atTop && scrollProgress.atBottom) && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
            <div className="px-2 py-1 rounded bg-background/90 border border-border/40 text-[11px] text-muted-foreground font-mono pointer-events-auto">
              {`Message ${position.index} of ${position.total}`}
            </div>
            <div className="flex flex-col gap-1 pointer-events-auto">
              {!scrollProgress.atTop && (
                <button
                  type="button"
                  onClick={() => jumpTo("top")}
                  data-jump="top"
                  aria-label="Jump to top"
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-background/90 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
              {!scrollProgress.atBottom && (
                <button
                  type="button"
                  onClick={() => jumpTo("bottom")}
                  data-jump="bottom"
                  aria-label="Jump to bottom"
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-background/90 border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </SearchHighlightContext.Provider>
  );
}

/**
 * Subtle banner shown when the scanner could not build a SessionTree for
 * this session — the viewer has fallen back to the consecutive-isSidechain
 * heuristic, which is strictly worse, so we tell the reader.
 */
function UnavailableBanner() {
  return (
    <div
      role="status"
      className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border/30 bg-muted/20 flex items-center gap-2"
    >
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Subagent grouping unavailable for this session</span>
    </div>
  );
}
