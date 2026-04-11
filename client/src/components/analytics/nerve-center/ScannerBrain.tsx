import { type ReactElement } from "react";
import { Brain, Database, Clock, HardDrive } from "lucide-react";
import { useScannerStatus, type ScannerStatusData } from "@/hooks/use-scanner";

// ---- Types ----

/** Overall system state — derived from organ conditions. */
export type SystemState = "calm" | "busy" | "stressed";

export interface ScannerBrainProps {
  /** Override system state instead of using default "calm". */
  systemState?: SystemState;
}

// ---- State-based styling (solid colors, no gradients) ----

const STATE_BORDER: Record<SystemState, string> = {
  calm: "border-emerald-500/70",
  busy: "border-amber-500/70",
  stressed: "border-red-500/70",
};

const STATE_DOT: Record<SystemState, string> = {
  calm: "bg-emerald-500",
  busy: "bg-amber-500",
  stressed: "bg-red-500",
};

const STATE_LABEL: Record<SystemState, string> = {
  calm: "Calm",
  busy: "Busy",
  stressed: "Stressed",
};

const STATE_TEXT: Record<SystemState, string> = {
  calm: "text-emerald-400",
  busy: "text-amber-400",
  stressed: "text-red-400",
};

// ---- Helpers ----

/** Format a timestamp as relative time (e.g. "12s ago", "3m ago"). */
function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "---";
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---- Component ----

/**
 * ScannerBrain — central "brain" node in the nerve center topology.
 *
 * Shows scanner health at a glance: last scan time, sessions tracked,
 * parse cache size, and overall system state. Sits at the center of the
 * topology layout, slightly larger than organ modules.
 *
 * System state is passed in as a prop (derived from worst organ status
 * by the parent), defaulting to "calm" when not provided.
 */
export function ScannerBrain({ systemState }: ScannerBrainProps): ReactElement {
  const { data, isLoading, isError } = useScannerStatus();

  const state: SystemState = systemState ?? "calm";

  // ---- Loading skeleton ----

  if (isLoading) {
    return (
      <div className="rounded-xl border-2 border-border/50 bg-card p-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-28 mb-3" />
        <div className="h-8 bg-muted rounded w-20 mb-2" />
        <div className="h-3 bg-muted rounded w-32 mb-1" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    );
  }

  // ---- Extract values with fallbacks for missing data ----

  const sessionCount = data?.sessionCount ?? 0;
  const lastScanAt = data?.lastScanAt ?? null;
  const parseCacheSize = data?.parseCacheSize ?? 0;
  const scanVersion = data?.scanVersion ?? 0;
  const isCurrentlyScanning = data?.scanning ?? false;

  // ---- Render ----

  return (
    <div
      className={`rounded-xl border-2 ${STATE_BORDER[state]} bg-card p-4 shadow-sm`}
      role="region"
      aria-label="Scanner Brain — system overview"
    >
      {/* Header with brain icon and state indicator */}
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4.5 w-4.5 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground tracking-wide">
          Scanner Brain
        </span>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${STATE_DOT[state]}`} />
      </div>

      {/* System state label */}
      <div className={`text-xs font-medium ${STATE_TEXT[state]} mb-3`}>
        {STATE_LABEL[state]}
        {isCurrentlyScanning && (
          <span className="ml-1 text-muted-foreground">(scanning...)</span>
        )}
      </div>

      {/* Metric rows */}
      <div className="space-y-2">
        {/* Last scan time */}
        <div className="flex items-center gap-2 text-xs">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Last scan</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {isError ? "---" : formatRelativeTime(lastScanAt)}
          </span>
        </div>

        {/* Sessions tracked */}
        <div className="flex items-center gap-2 text-xs">
          <Database className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Sessions</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {isError ? "---" : sessionCount.toLocaleString()}
          </span>
        </div>

        {/* Parse cache health */}
        <div className="flex items-center gap-2 text-xs">
          <HardDrive className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Cache entries</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">
            {isError ? "---" : parseCacheSize.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Scan version footer */}
      <div className="mt-3 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
        Scan v{scanVersion}
      </div>
    </div>
  );
}
