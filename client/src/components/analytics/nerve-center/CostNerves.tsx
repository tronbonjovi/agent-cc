import { type ReactElement, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, DollarSign, Flame } from "lucide-react";
import { useNerveCenter } from "@/hooks/use-sessions";
import type { PathwayState } from "./NervePathway";

// ---- Types ----

interface CostSummarySlice {
  weeklyComparison: {
    thisWeek: number;
    lastWeek: number;
    changePct: number;
  };
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    cost: number;
  }>;
}

interface CostNervesProps {
  /** Callback to report organ state back to the parent topology layout. */
  onStateChange?: (state: PathwayState) => void;
}

// ---- Helpers ----

/** Determine state color based on pacing percentage.
 *  - green: at or below average (pacingPct <= 100)
 *  - amber: above average up to 130%
 *  - red: significantly over average (> 130%)
 */
function getSpendState(pacingPct: number): "green" | "amber" | "red" {
  if (pacingPct <= 100) return "green";
  if (pacingPct <= 130) return "amber";
  return "red";
}

/** Map spend state to pathway state for the topology nerve line. */
function toPathwayState(state: "green" | "amber" | "red"): PathwayState {
  if (state === "green") return "idle";
  if (state === "amber") return "active";
  return "alert";
}

/** Card border/accent color classes by spend state. Solid colors only. */
const STATE_BORDER: Record<"green" | "amber" | "red", string> = {
  green: "border-emerald-500/60",
  amber: "border-amber-500/60",
  red: "border-red-500/60",
};

const STATE_DOT: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const STATE_TEXT: Record<"green" | "amber" | "red", string> = {
  green: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

// ---- Component ----

/**
 * CostNerves — compact cost summary organ for the nerve center topology.
 *
 * Displays this week's API-equivalent spend, a pacing indicator vs average,
 * trend direction text, and a flag for the highest-cost session if notable.
 * Clicking navigates to the Costs tab.
 */
export function CostNerves({ onStateChange }: CostNervesProps): ReactElement {
  const [, setLocation] = useLocation();

  // Nerve center data (weekly spend pacing from session analytics)
  const { data: ncData, isLoading: ncLoading } = useNerveCenter();

  // Cost summary from the cost-indexer (has weekly comparison + top sessions)
  const { data: costData, isLoading: costLoading } = useQuery<CostSummarySlice>({
    queryKey: ["/api/analytics/costs", 7],
    queryFn: async () => {
      const res = await fetch("/api/analytics/costs?days=7");
      if (!res.ok) throw new Error("Failed to fetch cost data");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Derive spend values — prefer cost-indexer weekly comparison, fallback to nerve center
  const thisWeek = costData?.weeklyComparison?.thisWeek ?? ncData?.costPacing?.thisWeek ?? 0;
  const lastWeek = costData?.weeklyComparison?.lastWeek ?? ncData?.costPacing?.avgWeek ?? 0;
  const changePct = costData?.weeklyComparison?.changePct ?? (
    ncData?.costPacing ? ncData.costPacing.pacingPct - 100 : 0
  );

  const pacingPct = lastWeek > 0 ? Math.round((thisWeek / lastWeek) * 100) : 100;
  const spendState = useMemo(() => getSpendState(pacingPct), [pacingPct]);

  // Report state to parent topology
  useEffect(() => {
    onStateChange?.(toPathwayState(spendState));
  }, [spendState, onStateChange]);

  // Highest-cost session from top sessions list
  const topSession = costData?.topSessions?.[0];
  const hasNotableCostSession = topSession && topSession.cost > thisWeek * 0.4;

  const isLoading = ncLoading && costLoading;

  // ---- Loading / no data fallback ----

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-20 mb-2" />
        <div className="h-6 bg-muted rounded w-16 mb-1" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    );
  }

  // ---- Trend indicator ----

  const absPct = Math.abs(changePct);
  const trendText = changePct > 0
    ? `${absPct}% above average`
    : changePct < 0
      ? `${absPct}% below average`
      : "On pace";

  const TrendIcon = changePct > 0 ? TrendingUp : changePct < 0 ? TrendingDown : Minus;

  // ---- Render ----

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rounded-lg border-2 ${STATE_BORDER[spendState]} bg-card p-3 cursor-pointer
        hover:bg-accent/50 transition-colors select-none`}
      onClick={() => setLocation("/analytics?tab=costs")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLocation("/analytics?tab=costs");
        }
      }}
      aria-label="Cost nerves — click to view costs tab"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Cost Nerves
        </span>
        <span className={`ml-auto h-2 w-2 rounded-full ${STATE_DOT[spendState]}`} />
      </div>

      {/* Weekly spend */}
      <div className="text-lg font-bold tabular-nums">
        ${thisWeek.toFixed(2)}
      </div>
      <div className="text-[10px] text-muted-foreground mb-1.5">This week</div>

      {/* Pacing indicator */}
      <div className={`flex items-center gap-1 text-xs ${STATE_TEXT[spendState]}`}>
        <TrendIcon className="h-3 w-3" />
        <span>{trendText}</span>
      </div>

      {/* Highest-cost session flag */}
      {hasNotableCostSession && topSession && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
          <Flame className="h-3 w-3 text-amber-500" />
          <span className="truncate">
            Top session: ${topSession.cost.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
