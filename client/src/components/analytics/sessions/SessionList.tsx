import { useState, useCallback, useEffect, useRef } from "react";
import { SessionRow } from "./SessionRow";
import { SessionFilters, type SessionFilterState } from "./SessionFilters";
import type { SessionData } from "@shared/types";

interface SessionListItem {
  id: string;
  isActive: boolean;
  healthScore: "good" | "fair" | "poor" | null;
  isEmpty: boolean;
}

/** Apply filter pills to sessions. Exported for testing. */
export function applyFilters<T extends SessionListItem>(
  sessions: T[],
  filters: { health?: string[]; status?: string[] },
): T[] {
  let result = sessions;

  if (filters.health?.length) {
    result = result.filter(s => filters.health!.includes(s.healthScore ?? ""));
  }

  if (filters.status?.length) {
    result = result.filter(s => {
      if (filters.status!.includes("active") && s.isActive) return true;
      if (filters.status!.includes("inactive") && !s.isActive && !s.isEmpty) return true;
      if (filters.status!.includes("empty") && s.isEmpty) return true;
      if (filters.status!.includes("stale") && !s.isActive && !s.isEmpty && "lastTs" in s) {
        const lastTs = (s as any).lastTs;
        if (lastTs && Date.now() - new Date(lastTs).getTime() > 30 * 24 * 60 * 60 * 1000) return true;
      }
      return false;
    });
  }

  return result;
}

interface SortableSession {
  id: string;
  lastTs: string | null;
  messageCount: number;
  costUsd: number;
  healthScore: "good" | "fair" | "poor" | null;
  durationMinutes: number | null;
  sizeBytes: number;
}

const healthRank = { poor: 0, fair: 1, good: 2 } as const;

/** Apply sorting. Exported for testing. */
export function applySorting<T extends SortableSession>(sessions: T[], sort: string): T[] {
  const sorted = [...sessions];
  switch (sort) {
    case "newest":
      sorted.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
      break;
    case "oldest":
      sorted.sort((a, b) => (a.lastTs ?? "").localeCompare(b.lastTs ?? ""));
      break;
    case "most-messages":
      sorted.sort((a, b) => b.messageCount - a.messageCount);
      break;
    case "highest-cost":
      sorted.sort((a, b) => b.costUsd - a.costUsd);
      break;
    case "worst-health":
      sorted.sort((a, b) => (healthRank[a.healthScore ?? "good"] ?? 2) - (healthRank[b.healthScore ?? "good"] ?? 2));
      break;
    case "longest":
      sorted.sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0));
      break;
    case "largest":
      sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
      break;
  }
  return sorted;
}

export interface EnrichedSession extends SessionData {
  healthScore: "good" | "fair" | "poor" | null;
  healthReasons?: string[];
  model: string | null;
  costUsd: number;
  durationMinutes: number | null;
  displayName?: string;
}

interface SessionListProps {
  sessions: EnrichedSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  projects?: string[];
  models?: string[];
}

export function SessionList({ sessions, selectedId, onSelect, projects, models }: SessionListProps) {
  const [filters, setFilters] = useState<SessionFilterState>({ sort: "newest" });
  const listRef = useRef<HTMLDivElement>(null);

  // Apply search, filters, and sorting
  let filtered = sessions;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(s =>
      (s.firstMessage ?? "").toLowerCase().includes(q) ||
      (s.projectKey ?? "").toLowerCase().includes(q) ||
      (s.displayName ?? "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }

  if (filters.project) {
    filtered = filtered.filter(s => s.projectKey === filters.project);
  }

  if (filters.model) {
    filtered = filtered.filter(s => s.model === filters.model);
  }

  filtered = applyFilters(filtered, filters);
  const sorted = applySorting(filtered, filters.sort ?? "newest");

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = sorted.findIndex(s => s.id === selectedId);
    if (e.key === "ArrowDown" && idx < sorted.length - 1) {
      onSelect(sorted[idx + 1].id);
    } else if (e.key === "ArrowUp" && idx > 0) {
      onSelect(sorted[idx - 1].id);
    } else if (e.key === "ArrowDown" && idx === -1 && sorted.length > 0) {
      onSelect(sorted[0].id);
    }
  }, [sorted, selectedId, onSelect]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div ref={listRef} className="flex flex-col h-full" tabIndex={0}>
      <SessionFilters
        filters={filters}
        onChange={setFilters}
        sessionCount={sorted.length}
        projects={projects}
        models={models}
      />
      <div className="flex-1 overflow-y-auto">
        {sorted.map(session => (
          <SessionRow
            key={session.id}
            session={session}
            isSelected={session.id === selectedId}
            onClick={() => onSelect(session.id)}
            healthScore={session.healthScore}
            model={session.model}
            costUsd={session.costUsd}
            durationMinutes={session.durationMinutes}
            displayName={session.displayName}
          />
        ))}
        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No sessions match filters
          </div>
        )}
      </div>
    </div>
  );
}
