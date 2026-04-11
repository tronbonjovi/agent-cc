import { useState, useEffect } from "react";
import { ListDetailLayout } from "./ListDetailLayout";
import { SessionList, type EnrichedSession } from "./SessionList";
import { SessionDetail } from "./SessionDetail";
import { useSessions, useSessionNames } from "@/hooks/use-sessions";
import { getSessionDisplayName } from "@/lib/session-display-name";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";

/**
 * Sessions tab — list-detail inspector layout.
 * Replaces the old SessionsPanel in the analytics page.
 */
export function SessionsTab() {
  const { data, isLoading } = useSessions();
  const { data: sessionNames } = useSessionNames();
  const bp = useBreakpoint();
  const mobile = isMobile(bp);

  // Read session ID from URL params for deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const initialId = urlParams.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  // Sync URL when selection changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedId) {
      params.set("id", selectedId);
    } else {
      params.delete("id");
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [selectedId]);

  const sessions = data?.sessions ?? [];

  // Enrich sessions with display data
  // Note: full enrichment (health, cost, model) would come from a dedicated
  // endpoint. For now we use basic data from the sessions list endpoint.
  const enriched: EnrichedSession[] = sessions.map(s => ({
    ...s,
    healthScore: null, // Will be enriched when backend supports it
    model: null,
    costUsd: 0,
    durationMinutes: s.firstTs && s.lastTs
      ? Math.round((new Date(s.lastTs).getTime() - new Date(s.firstTs).getTime()) / 60000)
      : null,
    displayName: getSessionDisplayName(s.id, {
      customNames: sessionNames,
      slug: s.slug,
      firstMessage: s.firstMessage,
    }),
  }));

  // Extract unique projects and models for filter dropdowns
  const projects = Array.from(new Set(sessions.map(s => s.projectKey).filter(Boolean)));

  const handleBack = () => setSelectedId(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-12rem)]">
      <ListDetailLayout
        list={
          <SessionList
            sessions={enriched}
            selectedId={selectedId}
            onSelect={setSelectedId}
            projects={projects}
          />
        }
        detail={selectedId ? (
          <SessionDetail
            sessionId={selectedId}
            onDelete={handleBack}
          />
        ) : null}
        onBack={handleBack}
      />
    </div>
  );
}
