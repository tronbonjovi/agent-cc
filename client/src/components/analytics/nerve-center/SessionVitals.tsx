import { type ReactElement, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Activity, AlertTriangle, Tag } from "lucide-react";
import { useHealthAnalytics } from "@/hooks/use-sessions";
import type { PathwayState } from "./NervePathway";

// ---- Types ----

export interface SessionVitalsProps {
  /** Callback to report organ state back to TopologyLayout parent. */
  onStateChange?: (state: PathwayState) => void;
}

// ---- State logic ----

/**
 * Determine organ pathway state from session health distribution.
 * - alert: >= 20% of sessions are poor
 * - active: >= 10% of sessions are fair or poor (but not alert-level)
 * - idle: mostly healthy, no significant issues
 */
function computeOrganState(goodCount: number, fairCount: number, poorCount: number): PathwayState {
  const total = goodCount + fairCount + poorCount;
  if (total === 0) return "idle";

  const poorRatio = poorCount / total;
  const flaggedRatio = (fairCount + poorCount) / total;

  if (poorRatio >= 0.2) return "alert";
  if (flaggedRatio >= 0.1) return "active";
  return "idle";
}

/**
 * Determine the card border/accent color class based on organ state.
 * Solid colors only (no gradients).
 */
function stateColorClass(state: PathwayState): string {
  if (state === "alert") return "border-red-500";
  if (state === "active") return "border-amber-500";
  return "border-emerald-500";
}

/**
 * Aggregate health reason tags from all flagged sessions and return
 * the top N most common reasons.
 */
function getTopReasons(
  sessions: Array<{ healthReasons?: string[] }>,
  limit: number = 3,
): Array<{ reason: string; count: number }> {
  const frequency = new Map<string, number>();

  for (const s of sessions) {
    if (!s.healthReasons) continue;
    for (const reason of s.healthReasons) {
      frequency.set(reason, (frequency.get(reason) || 0) + 1);
    }
  }

  return Array.from(frequency.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---- Component ----

/**
 * SessionVitals — organ module showing session health at a glance.
 *
 * Displays a segmented bar showing good/fair/poor session distribution
 * with proportional widths, a flagged session count, and top health
 * reason tags. Clicking navigates to the Sessions tab with a health filter.
 *
 * Reports its organ state (idle/active/alert) to the parent topology
 * via the onStateChange callback so the nerve pathway can reflect
 * session health visually.
 */
export function SessionVitals({ onStateChange }: SessionVitalsProps): ReactElement {
  const [, setLocation] = useLocation();
  const { data: health, isLoading } = useHealthAnalytics();

  const goodCount = health?.goodCount ?? 0;
  const fairCount = health?.fairCount ?? 0;
  const poorCount = health?.poorCount ?? 0;
  const total = goodCount + fairCount + poorCount;

  // Compute organ state and report to parent
  const organState = useMemo(
    () => computeOrganState(goodCount, fairCount, poorCount),
    [goodCount, fairCount, poorCount],
  );

  useEffect(() => {
    onStateChange?.(organState);
  }, [organState, onStateChange]);

  // Flagged = non-good sessions
  const flaggedCount = fairCount + poorCount;

  // Top health reason tags from flagged sessions
  const topReasons = useMemo(() => {
    if (!health?.sessions) return [];
    return getTopReasons(health.sessions);
  }, [health?.sessions]);

  // Segment widths as percentages (guard division by zero)
  const goodPct = total > 0 ? Math.round((goodCount / total) * 100) : 0;
  const fairPct = total > 0 ? Math.round((fairCount / total) * 100) : 0;
  const poorPct = total > 0 ? Math.round((poorCount / total) * 100) : 0;

  // Navigate to sessions tab with health filter
  const handleClick = () => {
    setLocation("/analytics?tab=sessions&health=flagged");
  };

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div
        className={`rounded-lg border p-3 bg-card text-card-foreground border-muted cursor-pointer`}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Session Vitals</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted animate-pulse" />
        <p className="text-xs text-muted-foreground mt-2">Loading...</p>
      </div>
    );
  }

  // ---- No data / unavailable fallback ----
  if (!health || total === 0) {
    return (
      <div
        className="rounded-lg border p-3 bg-card text-card-foreground border-muted cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
      >
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Session Vitals</span>
        </div>
        <p className="text-xs text-muted-foreground">No session data available</p>
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div
      className={`rounded-lg border-2 p-3 bg-card text-card-foreground cursor-pointer
        transition-colors hover:bg-accent/50 ${stateColorClass(organState)}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-label={`Session Vitals: ${goodCount} good, ${fairCount} fair, ${poorCount} poor sessions`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Session Vitals</span>
      </div>

      {/* Segmented health bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted mb-2" aria-label="Health distribution bar">
        {goodPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${goodPct}%` }}
            title={`Good: ${goodCount} (${goodPct}%)`}
          />
        )}
        {fairPct > 0 && (
          <div
            className="bg-amber-500 transition-all duration-300"
            style={{ width: `${fairPct}%` }}
            title={`Fair: ${fairCount} (${fairPct}%)`}
          />
        )}
        {poorPct > 0 && (
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${poorPct}%` }}
            title={`Poor: ${poorCount} (${poorPct}%)`}
          />
        )}
      </div>

      {/* Counts summary */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
        <span className="text-emerald-500 font-medium">{goodCount}</span>
        <span>/</span>
        <span className="text-amber-500 font-medium">{fairCount}</span>
        <span>/</span>
        <span className="text-red-500 font-medium">{poorCount}</span>
      </div>

      {/* Flagged count */}
      {flaggedCount > 0 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-xs text-muted-foreground">
            {flaggedCount} flagged
          </span>
        </div>
      )}

      {/* Top reason tags */}
      {topReasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topReasons.map(({ reason, count }) => (
            <span
              key={reason}
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {reason}
              <span className="font-medium">({count})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
