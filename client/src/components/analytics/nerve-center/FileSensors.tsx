import { type ReactElement, useEffect, useMemo } from "react";
import { useFileHeatmap } from "@/hooks/use-sessions";
import { Thermometer, Eye, PenLine, FileEdit } from "lucide-react";
import type { FileHeatmapEntry } from "@shared/types";

// ---- Types ----

export interface FileSensorsProps {
  /** Callback to report organ state to the parent topology layout. */
  onStateChange?: (state: "idle" | "active" | "alert") => void;
}

// ---- Warmth classification ----

/** Warmth level for a single file based on its touch count. */
type WarmthLevel = "cool" | "warm" | "hot";

/**
 * Classify a file's warmth based on touchCount.
 * - cool: low activity (< 10 touches)
 * - warm: moderate activity (10-30 touches)
 * - hot: high activity (> 30 touches)
 */
function getWarmth(touchCount: number): WarmthLevel {
  if (touchCount < 10) return "cool";
  if (touchCount <= 30) return "warm";
  return "hot";
}

/** Tailwind text color for each warmth level (solid colors, no gradients). */
const warmthTextColor: Record<WarmthLevel, string> = {
  cool: "text-blue-400",
  warm: "text-amber-400",
  hot: "text-red-400",
};

/** Tailwind background color for warmth bar indicators. */
const warmthBarColor: Record<WarmthLevel, string> = {
  cool: "bg-blue-500",
  warm: "bg-amber-500",
  hot: "bg-red-500",
};

// ---- Organ state from overall activity ----

/**
 * Compute the organ state color based on totalOperations.
 * - idle (green): calm, low total operations (< 100)
 * - active (amber): moderate churn (100-500)
 * - alert (red): heavy churn (> 500)
 */
function computeOrganState(totalOperations: number): "idle" | "active" | "alert" {
  if (totalOperations < 100) return "idle";
  if (totalOperations <= 500) return "active";
  return "alert";
}

/** Border color for the organ card based on state. */
const organBorderColor: Record<"idle" | "active" | "alert", string> = {
  idle: "border-green-600/50",
  active: "border-amber-600/50",
  alert: "border-red-600/50",
};

/** Small indicator dot color for the organ state. */
const organDotColor: Record<"idle" | "active" | "alert", string> = {
  idle: "bg-green-500",
  active: "bg-amber-500",
  alert: "bg-red-500",
};

// ---- Operation type icons ----

/** Small colored dot/icon for each operation type. */
function OperationDots({ operations }: { operations: FileHeatmapEntry["operations"] }): ReactElement {
  return (
    <div className="flex items-center gap-1">
      {operations.read > 0 && (
        <span title={`${operations.read} reads`} className="text-blue-400">
          <Eye className="w-3 h-3" />
        </span>
      )}
      {operations.write > 0 && (
        <span title={`${operations.write} writes`} className="text-emerald-400">
          <PenLine className="w-3 h-3" />
        </span>
      )}
      {operations.edit > 0 && (
        <span title={`${operations.edit} edits`} className="text-amber-400">
          <FileEdit className="w-3 h-3" />
        </span>
      )}
    </div>
  );
}

// ---- Main component ----

/**
 * FileSensors — a compact temperature-map visualization of file system activity.
 *
 * This organ module "senses warmth" from file activity across sessions.
 * Top files are shown with warmth indicators ranging from cool (blue, low
 * activity) through warm (amber, moderate) to hot (red, high churn).
 *
 * The overall organ state reflects total file operations:
 * - idle/green: calm file activity
 * - active/amber: moderate churn across files
 * - alert/red: heavy churn — many files being touched frequently
 */
export function FileSensors({ onStateChange }: FileSensorsProps): ReactElement {
  const { data, isLoading } = useFileHeatmap();

  const files = data?.files ?? [];
  const totalOperations = data?.totalOperations ?? 0;
  const topFiles = files.slice(0, 8);
  const organState = computeOrganState(totalOperations);

  // Report state to parent topology when it changes
  useEffect(() => {
    onStateChange?.(organState);
  }, [organState, onStateChange]);

  // Compute the max touch count for relative bar widths
  const maxTouch = useMemo(
    () => (topFiles.length > 0 ? Math.max(...topFiles.map((f) => f.touchCount)) : 1),
    [topFiles],
  );

  // ---- Loading state ----

  if (isLoading) {
    return (
      <div
        className={`rounded-lg border ${organBorderColor.idle} bg-zinc-900/80 p-3`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Thermometer className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">File Sensors</span>
        </div>
        <div className="text-xs text-zinc-500">Loading...</div>
      </div>
    );
  }

  // ---- Empty state ----

  if (files.length === 0) {
    return (
      <div
        className={`rounded-lg border ${organBorderColor.idle} bg-zinc-900/80 p-3`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Thermometer className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">File Sensors</span>
        </div>
        <div className="text-xs text-zinc-500">No file activity detected</div>
      </div>
    );
  }

  // ---- Normal render ----

  return (
    <div
      className={`rounded-lg border ${organBorderColor[organState]} bg-zinc-900/80 p-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">File Sensors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">
            {totalOperations} ops
          </span>
          <span
            className={`w-2 h-2 rounded-full ${organDotColor[organState]}`}
            title={
              organState === "idle"
                ? "Calm — low file activity"
                : organState === "active"
                  ? "Moderate — steady file churn"
                  : "Heavy — high file churn"
            }
          />
        </div>
      </div>

      {/* File list */}
      <div className="space-y-1.5">
        {topFiles.map((file) => {
          const warmth = getWarmth(file.touchCount);
          const barWidth = Math.max(8, (file.touchCount / maxTouch) * 100);

          return (
            <div key={file.filePath} className="group">
              <div className="flex items-center justify-between gap-2">
                {/* File name + ops */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[11px] truncate ${warmthTextColor[warmth]}`}
                    title={file.filePath}
                  >
                    {file.fileName}
                  </span>
                  <OperationDots operations={file.operations} />
                </div>

                {/* Touch count */}
                <span className={`text-[10px] tabular-nums shrink-0 ${warmthTextColor[warmth]}`}>
                  {file.touchCount}
                </span>
              </div>

              {/* Temperature bar */}
              <div className="h-1 rounded-full bg-zinc-800 mt-0.5">
                <div
                  className={`h-full rounded-full ${warmthBarColor[warmth]}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
