import { Badge } from "@/components/ui/badge";
import { relativeTime, shortModel } from "@/lib/utils";
import type { SessionData } from "@shared/types";

interface SessionRowProps {
  session: SessionData;
  isSelected: boolean;
  onClick: () => void;
  healthScore?: "good" | "fair" | "poor" | null;
  model?: string | null;
  costUsd?: number;
  durationMinutes?: number | null;
  displayName?: string;
}

/** Health dot color class. Exported for testing. */
export function healthColor(score: "good" | "fair" | "poor" | null): string {
  switch (score) {
    case "good": return "bg-emerald-500";
    case "fair": return "bg-amber-500";
    case "poor": return "bg-red-500";
    default: return "bg-muted-foreground/30";
  }
}

/** Format duration in minutes to human-readable. Exported for testing. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "-";
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatCost(n: number | undefined): string {
  if (n == null || n === 0) return "-";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

export function SessionRow({
  session, isSelected, onClick, healthScore, model, costUsd, durationMinutes, displayName,
}: SessionRowProps) {
  const title = displayName || session.firstMessage || session.slug || session.id.slice(0, 8);

  return (
    <div
      data-session-id={session.id}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/50 ${
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
      }`}
    >
      {/* Health dot */}
      <div className="shrink-0">
        <div className={`w-2 h-2 rounded-full ${healthColor(healthScore ?? null)}`} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{title}</span>
          {session.isActive && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {session.projectKey && (
            <span className="truncate max-w-[120px]">{session.projectKey.split("/").pop()}</span>
          )}
          {model && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {shortModel(model)}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span title="Messages">{session.messageCount}</span>
        <span title="Duration">{formatDuration(durationMinutes)}</span>
        <span title="Cost">{formatCost(costUsd)}</span>
        <span title="Last activity">{session.lastTs ? relativeTime(session.lastTs) : "-"}</span>
      </div>
    </div>
  );
}
