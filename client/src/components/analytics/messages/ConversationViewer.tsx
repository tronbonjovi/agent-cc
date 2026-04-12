// client/src/components/analytics/messages/ConversationViewer.tsx
//
// Messages tab — conversation viewer (messages-redesign task004).
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
//
// Out of scope (task005 / task006):
//   - the filter bar UI itself — we accept a FilterState prop and the
//     parent MessagesTab owns toggling it
//   - in-conversation search / highlight
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
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, AlertCircle } from "lucide-react";
import type {
  MessageTimelineResponse,
  TimelineMessage,
  TimelineSubagentContext,
} from "@shared/session-types";
import { renderMessage, SidechainGroup } from "./bubbles";

// ---------------------------------------------------------------------------
// Filter state — shape consumed by task005's filter bar.
// ---------------------------------------------------------------------------

/**
 * Per-type visibility toggles. Task005's filter bar will build one of these
 * and hand it in as a prop; this viewer treats it as read-only state.
 *
 * Each field maps 1:1 to a TimelineMessage.type variant. Adding a new
 * message type means adding a new key here AND a case in `isMessageVisible`.
 */
export interface FilterState {
  userText: boolean;
  assistantText: boolean;
  thinking: boolean;
  toolCalls: boolean;
  toolResults: boolean;
  systemEvents: boolean;
  skillInvocations: boolean;
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
};

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests.
// ---------------------------------------------------------------------------

/**
 * True if `msg` passes the current filter state.
 *
 * Exhaustive over TimelineMessage.type — a never-guard default forces a
 * compile error when a new variant lands.
 */
function isMessageVisible(msg: TimelineMessage, filters: FilterState): boolean {
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
 * Filter the raw message stream down to the subset matching `filters`.
 * Order is preserved.
 *
 * Exported for testing.
 */
export function filterMessages(
  messages: TimelineMessage[],
  filters: FilterState,
): TimelineMessage[] {
  return messages.filter((m) => isMessageVisible(m, filters));
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
  const visibleWithRawIdx = useMemo(() => {
    return rawMessages
      .map((msg, rawIndex) => ({ msg, rawIndex }))
      .filter(({ msg }) => isMessageVisible(msg, filters));
  }, [rawMessages, filters]);

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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
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

  if (visibleWithRawIdx.length === 0) {
    return (
      <div className="relative flex flex-col h-full">
        {treeStatus === "unavailable" && <UnavailableBanner />}
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
    <div className="relative flex flex-col h-full">
      {treeStatus === "unavailable" && <UnavailableBanner />}

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
            return (
              <div
                key={key}
                ref={registerMessageRef(rawIndex)}
                data-raw-index={rawIndex}
              >
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
