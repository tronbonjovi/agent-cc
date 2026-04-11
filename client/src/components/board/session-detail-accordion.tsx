import { useState } from "react";
import { ChevronRight, ChevronDown, Globe } from "lucide-react";
import { HealthReasonTag } from "./session-indicators";
import type { SessionEnrichment, LastSessionSnapshot } from "@shared/board-types";

interface SessionDetailAccordionProps {
  data: SessionEnrichment | LastSessionSnapshot;
  onExpand?: () => void;
  expanded?: boolean;
}

function formatCacheHit(rate: number | null): string {
  if (rate === null) return "\u2014";
  return `${Math.round(rate * 100)}%`;
}

function cacheHitColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate > 0.6) return "text-green-400";
  if (rate > 0.3) return "text-amber-400";
  return "text-red-400";
}

export function SessionDetailAccordion({ data, onExpand, expanded }: SessionDetailAccordionProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const hasHealthReasons = data.healthReasons && data.healthReasons.length > 0;
  const hasStats = data.totalToolCalls > 0 || data.turnCount > 0;

  // Guard: nothing worth showing
  if (!hasHealthReasons && !hasStats) return null;

  const isOpen = expanded ?? internalOpen;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (expanded === undefined) {
      setInternalOpen(!internalOpen);
    }
    onExpand?.();
  };

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Session details
      </button>

      {isOpen && (
        <div className="mt-1 pl-4 space-y-1.5">
          {/* Health reason tags */}
          {hasHealthReasons && (
            <div className="flex flex-wrap gap-1">
              {data.healthReasons.map((reason) => (
                <HealthReasonTag key={reason} reason={reason} />
              ))}
            </div>
          )}

          {/* 2-column stats grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
            <span className="text-muted-foreground">
              Tool calls <span className="text-foreground">{data.totalToolCalls}</span>
            </span>
            <span className="text-muted-foreground">
              Errors{" "}
              <span className={("toolErrors" in data && data.toolErrors > 0) ? "text-red-400" : "text-foreground"}>
                {"toolErrors" in data ? data.toolErrors : 0}
              </span>
            </span>

            <span className="text-muted-foreground">
              Retries <span className={data.retries > 0 ? "text-amber-400" : "text-foreground"}>{data.retries}</span>
            </span>
            <span className="text-muted-foreground">
              Cache hit{" "}
              <span className={cacheHitColor(data.cacheHitRate)}>{formatCacheHit(data.cacheHitRate)}</span>
            </span>

            <span className="text-muted-foreground">
              Max tokens{" "}
              <span className={data.maxTokensStops > 0 ? "text-amber-400" : "text-foreground"}>
                {data.maxTokensStops}
              </span>
            </span>
            <span className="text-muted-foreground">
              Web requests{" "}
              <span className="text-foreground inline-flex items-center gap-0.5">
                {data.webRequests > 0 && <Globe className="h-2.5 w-2.5 inline" />}
                {data.webRequests}
              </span>
            </span>

            <span className="text-muted-foreground">
              Sidechains <span className="text-foreground">{data.sidechainCount}</span>
            </span>
            <span className="text-muted-foreground">
              Turns <span className="text-foreground">{data.turnCount}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
