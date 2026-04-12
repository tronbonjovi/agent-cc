// client/src/components/analytics/messages/search-highlight.tsx
//
// Shared module for the Messages tab search highlight context, hook, and
// text-highlight helper (messages-redesign task006).
//
// Why this file exists:
//
// ConversationViewer owns the search state. It needs to wrap its render
// tree in a SearchHighlightContext.Provider so each bubble can decide
// whether to wrap matched text spans. But bubbles import *from*
// `./bubbles/dispatcher.ts`, which is imported *by* ConversationViewer,
// and threading the search context through the dispatcher would create
// a circular module dependency.
//
// Moving the context + hook + highlight helper into their own module
// breaks the cycle:
//
//   ConversationViewer.tsx ─┐              ┌─> search-highlight.tsx
//                           │              │   (context, useSearchHighlight,
//                           └─> bubbles ───┘    highlightText)
//                               (UserBubble, AssistantBlock, ThinkingBlock,
//                                ToolResultBlock, SystemEventBlock, ToolCallBlock,
//                                SidechainGroup)
//
// Bubbles import from `../search-highlight`. ConversationViewer also
// imports from `./search-highlight` and re-exports the hook + helper so
// tests and downstream callers have a single import site.
//
// Scope:
//   - `SearchHighlightValue` — context payload
//   - `SearchHighlightContext` — React context used by bubbles + provider
//   - `useSearchHighlight` — bubble-side hook that returns null when search is idle
//   - `highlightText` — wrap matched spans in <mark> with anchor attributes

import { createContext, useContext, type ReactNode } from "react";
import type { TimelineMessage } from "@shared/session-types";

/**
 * Payload supplied by ConversationViewer's SearchHighlightContext.Provider
 * to every bubble inside its render tree. See ConversationViewer for the
 * construction site; see useSearchHighlight for the consumption side.
 */
export interface SearchHighlightValue {
  /** Current query string (trimmed). Empty string when search is idle. */
  query: string;
  /** Lowercased needle — bubbles shouldn't re-lowercase on every render. */
  needle: string;
  /** Raw index of the currently-focused match's owning message, or -1. */
  currentRawIndex: number;
  /**
   * Global 0-based index of the current match within the ordered match
   * list, or -1 when no match is selected.
   */
  currentGlobalIndex: number;
  /** Build the data-attribute DOM target for a given global match index. */
  buildAnchorId: (globalIndex: number) => string;
  /**
   * Resolve the starting global-match index for a given message (by
   * identity). Returns -1 when the message has no matches. Lets bubbles
   * emit correct data-match-anchor ids without knowing their raw
   * timeline position.
   */
  getGlobalOffsetFor: (msg: TimelineMessage) => number;
}

/**
 * Context value — `null` means no provider is mounted OR search is idle.
 * `useSearchHighlight` folds both cases into a single return so bubbles
 * can check for null once.
 */
export const SearchHighlightContext =
  createContext<SearchHighlightValue | null>(null);

/**
 * Hook consumed by text-owning bubbles to check whether a search is
 * active. Returns null when no provider is mounted or the query is
 * empty. Bubbles should render plain text (or their normal markdown /
 * pre body) in that case.
 */
export function useSearchHighlight(): SearchHighlightValue | null {
  const ctx = useContext(SearchHighlightContext);
  if (!ctx) return null;
  if (!ctx.query) return null;
  return ctx;
}

/**
 * Wrap plain text with <mark> spans around every case-insensitive
 * occurrence of `highlight.needle`. Returns a React-renderable
 * (string or node array) preserving the original whitespace. The
 * current-match span carries a `data-match-anchor` attribute so
 * ConversationViewer's scroll effect can target it directly.
 *
 * `globalOffsetBase` is the starting global-match counter for this text
 * body. Passing 0 is safe but causes the viewer's anchor-scroll fallback
 * to jump to the whole bubble rather than the exact span; pass
 * `highlight.getGlobalOffsetFor(message)` to line up the anchors with
 * `findMatches`.
 *
 * Color rules (per project safety rules):
 *   - Non-current matches: solid yellow background, black text
 *   - Current match: solid orange background, black text
 *   - No gradients, no bounce/scale animations. The visual distinction
 *     between current and other matches is color contrast only.
 */
export function highlightText(
  text: string,
  highlight: SearchHighlightValue,
  globalOffsetBase: number,
): ReactNode {
  const needle = highlight.needle;
  if (!needle || !text) return text;
  const lower = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let from = 0;
  let localMatchCount = 0;
  while (from < text.length) {
    const hit = lower.indexOf(needle, from);
    if (hit < 0) {
      nodes.push(text.slice(from));
      break;
    }
    if (hit > from) nodes.push(text.slice(from, hit));
    const hasOffset = globalOffsetBase >= 0;
    const globalIndex = hasOffset
      ? globalOffsetBase + localMatchCount
      : -1;
    const isCurrent =
      globalIndex >= 0 && globalIndex === highlight.currentGlobalIndex;
    const anchorId =
      globalIndex >= 0 ? highlight.buildAnchorId(globalIndex) : undefined;
    nodes.push(
      <mark
        key={`m-${hit}-${localMatchCount}`}
        data-match-anchor={anchorId}
        data-current-match={isCurrent ? "true" : undefined}
        className={
          isCurrent
            ? "bg-orange-400 text-black rounded-sm px-0.5"
            : "bg-yellow-200 text-black rounded-sm px-0.5"
        }
      >
        {text.slice(hit, hit + needle.length)}
      </mark>,
    );
    from = hit + needle.length;
    localMatchCount += 1;
  }
  if (nodes.length === 0) return text;
  return nodes;
}
