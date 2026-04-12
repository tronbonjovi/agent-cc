// client/src/components/analytics/messages/SessionSidebar.tsx
//
// Narrow session picker for the Messages tab. It's a compact cousin of the
// Sessions tab's SessionList: same data source (/api/sessions via useSessions),
// same URL param convention (?id=<sessionId>) so selection carries over when
// the user navigates between the two tabs, but trimmed down to what a message
// reader actually needs — search box, scrollable rows, one-click pick.
//
// Intentional differences vs. SessionList:
//   - Fixed ~240px width (SessionList is full-flex inside a ListDetailLayout).
//   - No sort controls (hardcoded newest-first — "which conversation do I want
//     to read?" almost always means "the one I was just in").
//   - No filter pills (health/status/project/model) — the sidebar is a picker,
//     not an analysis view. Users can still bounce over to the Sessions tab
//     if they need richer filtering; URL param sync keeps the selection warm.
//   - Rows show just title + message count + relative timestamp. Model, cost,
//     and health dots are left out to keep the row skimmable at 240px.
//
// Pure helpers (filterSessionsBySearch, sortByNewest, URL read/write) are
// exported so tests can exercise them without spinning up a React tree —
// matches the convention used by session-list.test.ts.

import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSessions, useSessionNames } from "@/hooks/use-sessions";
import { getSessionDisplayName } from "@/lib/session-display-name";
import { relativeTime } from "@/lib/utils";
import type { SessionData } from "@shared/types";

/** Minimal shape the search filter needs. Exported for tests. */
export interface SearchableSession {
  id: string;
  slug?: string;
  firstMessage?: string;
  displayName?: string;
}

/** Minimal shape the newest-first sort needs. Exported for tests. */
export interface SortableSession {
  id: string;
  lastTs: string | null;
}

/**
 * Filter sessions by a free-text search query.
 *
 * Matches against (in priority order): displayName, firstMessage, slug, id.
 * Case-insensitive. Empty/undefined query returns the input unchanged.
 *
 * Exported for testing.
 */
export function filterSessionsBySearch<T extends SearchableSession>(
  sessions: T[],
  query: string | undefined,
): T[] {
  if (!query) return sessions;
  const q = query.toLowerCase();
  return sessions.filter((s) => {
    if ((s.displayName ?? "").toLowerCase().includes(q)) return true;
    if ((s.firstMessage ?? "").toLowerCase().includes(q)) return true;
    if ((s.slug ?? "").toLowerCase().includes(q)) return true;
    if (s.id.toLowerCase().includes(q)) return true;
    return false;
  });
}

/**
 * Sort sessions newest-first by lastTs.
 *
 * Null timestamps sink to the end (they are "unknown when", not "definitely
 * old"). Returns a new array — the input is not mutated.
 *
 * Exported for testing.
 */
export function sortByNewest<T extends SortableSession>(sessions: T[]): T[] {
  // localeCompare on ISO strings gives correct chronological order because
  // ISO-8601 is lexicographically sortable. Empty-string fallback pushes
  // nulls to the end since "" < any real timestamp.
  return [...sessions].sort((a, b) =>
    (b.lastTs ?? "").localeCompare(a.lastTs ?? ""),
  );
}

/**
 * Read the selected session id from a URL query string.
 *
 * Pure function over a query string so it's testable without touching
 * `window.location`. The sidebar calls it with `window.location.search`.
 *
 * Exported for testing.
 */
export function readSelectedSessionFromUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("id");
}

/**
 * Build a new query string with the selected session id set or cleared.
 *
 * Preserves every other existing param (atab, tab, etc.) so we never stomp
 * on sibling UI state. Returns a query string starting with "?" when non-empty.
 *
 * Exported for testing.
 */
export function writeSelectedSessionToUrl(
  currentSearch: string,
  sessionId: string | null,
): string {
  const params = new URLSearchParams(currentSearch);
  if (sessionId) {
    params.set("id", sessionId);
  } else {
    params.delete("id");
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

// ---------------------------------------------------------------------------
// Row

interface SidebarRowProps {
  session: SessionData;
  displayName: string;
  isSelected: boolean;
  onClick: () => void;
}

function SidebarRow({
  session,
  displayName,
  isSelected,
  onClick,
}: SidebarRowProps) {
  return (
    <div
      data-session-id={session.id}
      onClick={onClick}
      className={`flex flex-col gap-1 px-3 py-2.5 cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/50 ${
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }`}
    >
      {/* Title row — truncates, reserves space for the active pulse dot */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate flex-1">
          {displayName}
        </span>
        {session.isActive && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500"
            title="Active session"
          />
        )}
      </div>

      {/* Meta row — message count badge + relative timestamp */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span title="Message count">
          {session.messageCount} {session.messageCount === 1 ? "msg" : "msgs"}
        </span>
        <span title="Last activity">
          {session.lastTs ? relativeTime(session.lastTs) : "-"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component

export interface SessionSidebarProps {
  /**
   * Controlled selection override. When provided the sidebar reads selection
   * from this prop instead of the URL — useful for the Messages tab page to
   * own the selection state. When omitted the sidebar reads/writes `?id=`
   * directly and behaves as a standalone widget.
   */
  selectedId?: string | null;
  /** Called whenever the user picks a session. */
  onSelect?: (id: string) => void;
}

/**
 * Narrow (~240px) session sidebar for the Messages tab. Uncontrolled by
 * default: reads/writes `?id=` on window.location to stay in sync with the
 * Sessions tab. Pass `selectedId`/`onSelect` to wire it into a parent that
 * owns selection state (e.g. once task005 lands the full Messages page).
 */
export function SessionSidebar({
  selectedId: controlledSelectedId,
  onSelect,
}: SessionSidebarProps = {}) {
  const { data, isLoading } = useSessions();
  const { data: sessionNames } = useSessionNames();

  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<
    string | null
  >(() => {
    // SSR-safety: window may not exist during vitest module-exports checks.
    if (typeof window === "undefined") return null;
    return readSelectedSessionFromUrl(window.location.search);
  });
  const [search, setSearch] = useState("");

  const isControlled = controlledSelectedId !== undefined;
  const selectedId = isControlled
    ? controlledSelectedId
    : uncontrolledSelectedId;

  // Sync URL when uncontrolled selection changes so the Sessions tab picks
  // the same session up if the user navigates over there.
  useEffect(() => {
    if (isControlled) return;
    if (typeof window === "undefined") return;
    const next = writeSelectedSessionToUrl(
      window.location.search,
      uncontrolledSelectedId,
    );
    const newUrl = `${window.location.pathname}${next}`;
    window.history.replaceState({}, "", newUrl);
  }, [uncontrolledSelectedId, isControlled]);

  const handleSelect = (id: string) => {
    if (!isControlled) setUncontrolledSelectedId(id);
    onSelect?.(id);
  };

  const sessions = data?.sessions ?? [];

  // Enrich with the Sessions tab's display-name logic so the two lists show
  // matching titles for the same session.
  const enriched = useMemo(() => {
    return sessions.map((s) => ({
      ...s,
      displayName: getSessionDisplayName(s.id, {
        customNames: sessionNames,
        slug: s.slug,
        firstMessage: s.firstMessage,
      }),
    }));
  }, [sessions, sessionNames]);

  const filtered = useMemo(
    () => filterSessionsBySearch(enriched, search),
    [enriched, search],
  );
  const sorted = useMemo(() => sortByNewest(filtered), [filtered]);

  return (
    <div className="flex flex-col h-full w-[240px] border-r border-border/40 bg-background">
      {/* Header: search input only — no sort, no filter pills */}
      <div className="px-3 py-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-sm"
            aria-label="Search sessions"
          />
        </div>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            Loading sessions...
          </div>
        )}
        {!isLoading &&
          sorted.map((s) => (
            <SidebarRow
              key={s.id}
              session={s}
              displayName={s.displayName}
              isSelected={s.id === selectedId}
              onClick={() => handleSelect(s.id)}
            />
          ))}
        {!isLoading && sorted.length === 0 && (
          <div className="flex items-center justify-center h-24 px-3 text-xs text-muted-foreground text-center">
            {search
              ? "No sessions match your search"
              : "No sessions yet"}
          </div>
        )}
      </div>
    </div>
  );
}
