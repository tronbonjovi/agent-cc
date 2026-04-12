// client/src/components/analytics/messages/ConversationSearch.tsx
//
// Messages tab — in-conversation search control (messages-redesign task006).
//
// Renders a Ctrl+F-style search input with prev/next navigation and a match
// counter. Lives inside ConversationViewer's header area (top-right, next
// to the treeStatus banner) rather than inside FilterBar because the match
// state + navigation cursor belong to the viewer — FilterBar is a
// stateless filter surface that doesn't know which session is loaded.
//
// The component is intentionally stateless: its parent (ConversationViewer)
// owns the query string, total match count, current match index, and the
// visibility of the whole search bar. Clicking the magnifier icon button
// in the viewer's header toggles visibility on/off; this component just
// renders the active form.
//
// Keyboard behavior:
//   - Typing into the input updates `query` live (the parent debounces if
//     perf demands — not today)
//   - Enter in the input advances to the next match
//   - Shift+Enter retreats to the previous match (nice-to-have, matches
//     browser Ctrl+F behavior)
//   - Escape clears the search and returns focus to the scroll region
//
// Safety / style:
//   - No gradients, no bounce/scale animations. Solid palette colors only.
//   - Icons-only buttons carry aria-label for accessibility.
//   - Match counter uses plain text so the file-text guardrail can match
//     "of" / "/" reliably without imports of i18n helpers.

import { forwardRef, useCallback } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

export interface ConversationSearchProps {
  /** Current query string — parent owns this state. */
  query: string;
  /** Called with the new query every time the input value changes. */
  onQueryChange: (next: string) => void;
  /** Total number of matches across the message stream. */
  totalMatches: number;
  /** 0-based index of the currently-focused match, or -1 for "no match selected". */
  currentIndex: number;
  /** Jump to the next match (wraps around). */
  onNext: () => void;
  /** Jump to the previous match (wraps around). */
  onPrev: () => void;
  /** Clear the search and dismiss this control. */
  onClear: () => void;
}

/**
 * In-conversation search input with match counter + navigation. Stateless
 * — the parent ConversationViewer holds all the state.
 *
 * Forwards ref to the underlying <input> so the parent can focus it when
 * the search is opened.
 */
export const ConversationSearch = forwardRef<HTMLInputElement, ConversationSearchProps>(
  function ConversationSearch(
    {
      query,
      onQueryChange,
      totalMatches,
      currentIndex,
      onNext,
      onPrev,
      onClear,
    },
    ref,
  ) {
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) {
            onPrev();
          } else {
            onNext();
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onClear();
          return;
        }
      },
      [onNext, onPrev, onClear],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onQueryChange(e.target.value);
      },
      [onQueryChange],
    );

    // Counter text — "X of Y matches" when there are any, "No matches" when
    // the query has a value but nothing hits, empty when the query is blank.
    const hasQuery = query.trim().length > 0;
    let counterText = "";
    if (hasQuery) {
      if (totalMatches === 0) {
        counterText = "No matches";
      } else {
        // currentIndex is -1 when the viewer hasn't yet landed on a match
        // (race between query change and navigation reset). Show 0 in that
        // edge case so the counter never goes negative.
        const display = currentIndex < 0 ? 0 : currentIndex + 1;
        counterText = `${display} of ${totalMatches} matches`;
      }
    }

    return (
      <div
        data-testid="conversation-search"
        role="search"
        aria-label="Search conversation"
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/50 bg-background/90"
      >
        <Search
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          aria-label="Search conversation"
          className="h-6 w-44 bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground"
        />
        {counterText && (
          <span
            className="px-1 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            data-testid="conversation-search-counter"
          >
            {counterText}
          </span>
        )}
        <button
          type="button"
          data-action="prev"
          aria-label="Previous match"
          title="Previous match"
          onClick={onPrev}
          disabled={totalMatches === 0}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-action="next"
          aria-label="Next match"
          title="Next match"
          onClick={onNext}
          disabled={totalMatches === 0}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-action="clear"
          aria-label="Clear search"
          title="Clear search"
          onClick={onClear}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  },
);
