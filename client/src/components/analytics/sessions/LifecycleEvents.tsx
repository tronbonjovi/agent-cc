import { Badge } from "@/components/ui/badge";
import type { LifecycleEvent } from "@shared/session-types";

const EVENT_COLORS: Record<string, string> = {
  "permission-change": "bg-blue-500/10 text-blue-500",
  "queue-enqueue": "bg-amber-500/10 text-amber-500",
  "queue-dequeue": "bg-emerald-500/10 text-emerald-500",
  "queue-remove": "bg-red-500/10 text-red-500",
  "tools-changed": "bg-purple-500/10 text-purple-500",
  "last-prompt": "bg-muted text-muted-foreground",
};

interface LifecycleEventsProps {
  events: LifecycleEvent[];
  sessionStartTs?: string | null;
}

export function LifecycleEvents({ events, sessionStartTs }: LifecycleEventsProps) {
  if (events.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No lifecycle events recorded</div>;
  }

  const startMs = sessionStartTs ? new Date(sessionStartTs).getTime() : null;

  return (
    <div className="p-4 space-y-1">
      {events.map((event, i) => {
        const relativeMs = startMs && event.timestamp
          ? new Date(event.timestamp).getTime() - startMs
          : null;
        const relativeStr = relativeMs != null ? `+${(relativeMs / 1000).toFixed(0)}s` : "";
        const colorClass = EVENT_COLORS[event.type] ?? "bg-muted text-muted-foreground";

        return (
          <div key={i} className="flex items-center gap-2 text-sm py-1">
            <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">{relativeStr}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass}`}>
              {event.type}
            </Badge>
            <span className="text-xs text-muted-foreground truncate">{event.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
