// client/src/components/analytics/messages/MessagesTab.tsx
//
// Messages tab — top-level container (messages-redesign task005).
//
// Composes the three pieces built in tasks 002 / 004 / 005:
//   - SessionSidebar (left, ~240px) — narrow session picker
//   - FilterBar (top of main panel) — six toggle pills + three presets
//   - ConversationViewer (main panel body) — fetches and renders the
//     selected session's message timeline with the current FilterState
//
// State management:
//   - selectedSessionId is held here so the sidebar (controlled mode) and
//     the viewer share one source of truth. We initialize from `?id=` so
//     the selection round-trips with the Sessions tab — both tabs use the
//     same param key (verified by tests/messages-tab.test.ts and
//     tests/session-sidebar.test.ts).
//   - filters defaults to DEFAULT_FILTERS (every per-type toggle on).
//
// URL param sync uses the same helpers as SessionSidebar
// (`readSelectedSessionFromUrl` / `writeSelectedSessionToUrl`) so the
// shape of the param stays consistent across both consumers. We do not
// touch `?tab=` here — the parent <Tabs> in stats.tsx writes that.

import { useEffect, useState } from "react";
import { ConversationViewer, DEFAULT_FILTERS } from "./ConversationViewer";
import type { FilterState } from "./ConversationViewer";
import { FilterBar } from "./FilterBar";
import {
  SessionSidebar,
  readSelectedSessionFromUrl,
  writeSelectedSessionToUrl,
} from "./SessionSidebar";

export function MessagesTab() {
  // Initial selection comes from `?id=` so deep links from the Sessions
  // tab open the same conversation. SSR-safety: window may not exist
  // when this module is imported in a vitest helper.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return readSelectedSessionFromUrl(window.location.search);
  });

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Sync URL when the selection changes. Preserves every other existing
  // query param (notably `?tab=messages` so reloading lands the user back
  // on this tab) — see writeSelectedSessionToUrl.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = writeSelectedSessionToUrl(
      window.location.search,
      selectedId,
    );
    const newUrl = `${window.location.pathname}${next}`;
    window.history.replaceState({}, "", newUrl);
  }, [selectedId]);

  return (
    <div
      className="flex h-[calc(100vh-12rem)] border border-border/40 rounded-md overflow-hidden bg-background"
      data-testid="messages-tab"
    >
      {/* Left: narrow session sidebar (controlled by us) */}
      <SessionSidebar
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Right: filter bar + conversation viewer stacked vertically */}
      <div className="flex flex-col flex-1 min-w-0">
        <FilterBar filters={filters} onFiltersChange={setFilters} />
        <div className="flex-1 min-h-0">
          <ConversationViewer
            sessionId={selectedId ?? undefined}
            filters={filters}
          />
        </div>
      </div>
    </div>
  );
}
