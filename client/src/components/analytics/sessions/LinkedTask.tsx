import { Badge } from "@/components/ui/badge";
import type { LinkSignal } from "@shared/board-types";

interface LinkedTaskProps {
  /** Task ID if linked */
  taskId?: string;
  /** Task title */
  taskTitle?: string;
  /** Milestone name */
  milestone?: string;
  /** Whether this is a manual link (sessionId in frontmatter) vs auto-linked */
  isManualLink?: boolean;
  /** Auto-link confidence score (0-1.55 range) */
  linkScore?: number;
  /** Signal breakdown from auto-linking */
  linkSignals?: LinkSignal[];
}

export function LinkedTask({
  taskId, taskTitle, milestone, isManualLink, linkScore, linkSignals,
}: LinkedTaskProps) {
  if (!taskId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No task linked to this session.
      </div>
    );
  }

  const confidencePercent = linkScore != null ? Math.min(Math.round((linkScore / 1.55) * 100), 100) : null;

  return (
    <div className="p-4 space-y-3">
      {/* Task info */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{taskTitle ?? taskId}</span>
            {isManualLink ? (
              <Badge variant="outline" className="text-[10px] px-1 py-0">manual link</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">auto-linked</Badge>
            )}
          </div>
          {milestone && (
            <span className="text-xs text-muted-foreground">{milestone}</span>
          )}
        </div>
        <a
          href={`/board?highlight=${taskId}`}
          className="text-xs text-primary hover:underline shrink-0"
        >
          View in Board
        </a>
      </div>

      {/* Score + signal breakdown (auto-linked only) */}
      {!isManualLink && linkSignals && linkSignals.length > 0 && (
        <div className="space-y-2">
          {confidencePercent != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                <div
                  className={`h-full rounded-full ${
                    confidencePercent >= 70 ? "bg-emerald-500" : confidencePercent >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
              <span className="text-xs font-mono">{confidencePercent}%</span>
            </div>
          )}

          <div className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Signals</span>
            {linkSignals.map((signal, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${signal.matched ? "bg-emerald-500" : "bg-muted-foreground/20"}`} />
                <span className={signal.matched ? "text-foreground" : "text-muted-foreground"}>
                  {signal.name}
                </span>
                <span className="text-muted-foreground ml-auto">{signal.weight}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
