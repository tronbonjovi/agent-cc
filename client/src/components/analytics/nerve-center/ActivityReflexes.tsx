import { type ReactElement, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FilePlus,
  Edit3,
  Trash2,
  FolderPlus,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { PathwayState } from "./NervePathway";

// ---- Types ----

export interface ActivityReflexesProps {
  /** Callback to report organ state (pathway color) back to parent topology. */
  onStateChange?: (state: PathwayState) => void;
}

interface ParsedEvent {
  timestamp: string;
  event: string;
  path: string;
}

// ---- Constants ----

/** Max events to show in the compact feed. */
const MAX_EVENTS = 8;

/** Thresholds for organ state computation (in minutes). */
const RECENT_THRESHOLD_MIN = 10; // green: activity within last 10 min
const STALE_THRESHOLD_MIN = 60;  // amber: no activity for 1+ hour
const SPIKE_THRESHOLD = 6;       // red: 6+ events in the recent window = unusual spike

// ---- Event type mappings (solid colors, no gradients) ----

const EVENT_ICONS: Record<string, LucideIcon> = {
  add: FilePlus,
  change: Edit3,
  unlink: Trash2,
  addDir: FolderPlus,
};

const EVENT_COLORS: Record<string, string> = {
  add: "text-green-400",
  change: "text-amber-400",
  unlink: "text-red-400",
  addDir: "text-blue-400",
};

// ---- Helpers ----

/** Parse a watcher changelog entry: "ISO_TIMESTAMP [event_type] relative_path" */
function parseEntry(entry: string): ParsedEvent {
  const match = entry.match(/^(.+?) \[(.+?)\] (.+)$/);
  if (!match) return { timestamp: "", event: "unknown", path: entry };
  return { timestamp: match[1], event: match[2], path: match[3] };
}

/** Format an ISO timestamp as a human-friendly relative time label. */
function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return "";
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

/** Shorten a file path for compact display (last 2-3 segments). */
function shortenPath(filePath: string): string {
  const parts = filePath.replace(/^~\//, "").split("/");
  if (parts.length <= 3) return filePath;
  return ".../" + parts.slice(-2).join("/");
}

/**
 * Compute organ state from parsed events.
 * - green (active): recent activity within threshold
 * - amber (idle): no recent activity (quiet/stale)
 * - red (alert): unusual spike — many events in recent window
 */
function computeOrganState(events: ParsedEvent[]): PathwayState {
  if (events.length === 0) return "idle";

  const now = new Date();
  const recentCutoff = new Date(now.getTime() - RECENT_THRESHOLD_MIN * 60000);
  const staleCutoff = new Date(now.getTime() - STALE_THRESHOLD_MIN * 60000);

  const recentEvents = events.filter((e) => {
    if (!e.timestamp) return false;
    return new Date(e.timestamp) > recentCutoff;
  });

  // Red: unusual activity spike — too many events in recent window
  if (recentEvents.length >= SPIKE_THRESHOLD) return "alert";

  // Green: some recent activity — alive
  if (recentEvents.length > 0) return "active";

  // Check if any events exist within the stale window
  const staleEvents = events.filter((e) => {
    if (!e.timestamp) return false;
    return new Date(e.timestamp) > staleCutoff;
  });

  if (staleEvents.length > 0) return "active";

  // Amber: all activity is old — quiet/stale
  return "idle";
}

// ---- Component ----

/**
 * ActivityReflexes — compact changelog feed organ module.
 *
 * Displays the last few file-system change events detected by the watcher,
 * color-coded by event type. Reports its organ state (green/amber/red) to
 * the parent topology via onStateChange callback.
 *
 * This organ represents "reflexes" — immediate reactions to environmental changes.
 */
export function ActivityReflexes({
  onStateChange,
}: ActivityReflexesProps): ReactElement {
  const { data: changes, isLoading } = useQuery<string[]>({
    queryKey: ["/api/watcher/changes"],
    refetchInterval: 5000,
  });

  // Parse and reverse (most recent first), limit to compact feed size
  const parsed = useMemo(() => {
    return (changes ?? [])
      .map(parseEntry)
      .reverse()
      .slice(0, MAX_EVENTS);
  }, [changes]);

  // Compute organ state and notify parent
  const organState = useMemo(() => computeOrganState(parsed), [parsed]);

  useEffect(() => {
    onStateChange?.(organState);
  }, [organState, onStateChange]);

  // State indicator colors (solid, no gradients)
  const stateColorMap: Record<PathwayState, string> = {
    active: "border-green-500",  // green: recent activity, alive
    idle: "border-amber-500",    // amber: quiet, stale
    alert: "border-red-500",     // red: unusual activity spike
  };

  const stateLabelMap: Record<PathwayState, string> = {
    active: "Active",
    idle: "Quiet",
    alert: "Spike",
  };

  const stateDotMap: Record<PathwayState, string> = {
    active: "bg-green-500",
    idle: "bg-amber-500",
    alert: "bg-red-500",
  };

  return (
    <div
      className={`rounded-lg border ${stateColorMap[organState]} bg-card p-3 space-y-2`}
      role="region"
      aria-label="Activity Reflexes"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Reflexes</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${stateDotMap[organState]}`} />
          <span className="text-xs text-muted-foreground">
            {stateLabelMap[organState]}
          </span>
        </div>
      </div>

      {/* Event feed */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading...</div>
      ) : parsed.length === 0 ? (
        <div className="text-xs text-muted-foreground">No recent activity</div>
      ) : (
        <div className="space-y-1">
          {parsed.map((entry, idx) => {
            const Icon = EVENT_ICONS[entry.event] ?? Activity;
            const colorClass = EVENT_COLORS[entry.event] ?? "text-muted-foreground";
            return (
              <div
                key={`${entry.timestamp}-${idx}`}
                className="flex items-center gap-1.5 text-xs"
              >
                <Icon className={`h-3 w-3 flex-shrink-0 ${colorClass}`} />
                <span className="truncate text-muted-foreground font-mono min-w-0">
                  {shortenPath(entry.path)}
                </span>
                <span className="flex-shrink-0 text-muted-foreground/60 ml-auto text-xs">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
