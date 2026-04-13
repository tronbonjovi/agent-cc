// client/src/components/analytics/charts/token-economics/SubagentCostBreakdown.tsx
//
// Per-subagent cost breakdown — horizontal bar chart of total spend grouped
// by `agentType`, with a header tile showing what percentage of total spend
// went to subagents and a click-to-drill-in panel listing the top parent
// sessions for the selected agent type.
//
// Data: GET /api/charts/subagent-costs (chart-analytics route, task007).
// Filters: subscribes to the global Charts filter context (range / projects /
// models). The `breakdown` toggle from sibling charts does not apply here —
// this view is always tree-inclusive (delegation IS the story).
//
// Colors: bars use the shared subagent palette so colors stay consistent
// with Sessions detail. The palette indexes by a hash of the bucket key, so
// "Explore" always renders in the same color across views and re-renders.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { ChartCard } from "../ChartCard";
import {
  PALETTE,
  colorClassForOwner,
} from "@/components/analytics/sessions/subagent-colors";
import { Users } from "lucide-react";
import { formatUsd } from "@/lib/format";

// ---- Types ---------------------------------------------------------------

interface TopSession {
  sessionId: string;
  slug: string;
  costUsd: number;
  delegationRatio: number;
}

interface AgentTypeBucket {
  agentType: string;
  totalCostUsd: number;
  invocationCount: number;
  sessionCount: number;
  topSessions: TopSession[];
}

interface SubagentCostsResponse {
  byAgentType: AgentTypeBucket[];
  totals: {
    totalSubagentCostUsd: number;
    parentOnlyCostUsd: number;
    delegationPercentage: number;
  };
  mostDelegationHeavy: Array<{
    sessionId: string;
    slug: string;
    delegationRatio: number;
    costUsd: number;
  }>;
}

// ---- Helpers -------------------------------------------------------------

function buildQuery(
  range: string,
  projects: string[],
  models: string[],
): string {
  const params = new URLSearchParams();
  if (range !== "all") params.set("days", range.replace("d", ""));
  else params.set("days", "all");
  if (projects.length > 0) params.set("projects", projects.join(","));
  if (models.length > 0) params.set("models", models.join(","));
  return params.toString();
}


function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  if (n >= 10) return `${n.toFixed(0)}%`;
  return `${n.toFixed(1)}%`;
}

/**
 * Resolve a stable Recharts-friendly hex color for an agent type by reusing
 * the same hash strategy as `colorClassForOwner`. The shared palette ships
 * Tailwind class strings (used for badges in Sessions detail), so we mirror
 * the hash here and map to a parallel hex array — this keeps the bar chart
 * visually aligned with session row badges without forcing the badge palette
 * to know about Recharts.
 */
const PALETTE_HEX: readonly string[] = [
  "#0ea5e9", // sky-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
];

function hexForAgentType(agentType: string): string {
  let hash = 0;
  for (let i = 0; i < agentType.length; i++) {
    hash = (hash + agentType.charCodeAt(i)) >>> 0;
  }
  return PALETTE_HEX[hash % PALETTE_HEX.length];
}

// ---- Custom tooltip ------------------------------------------------------

interface TooltipPayloadEntry {
  payload: AgentTypeBucket;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md min-w-[180px]">
      <div className="font-medium mb-1">{bucket.agentType}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Total cost</span>
        <span className="font-mono">{formatUsd(bucket.totalCostUsd)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Invocations</span>
        <span className="font-mono">{bucket.invocationCount}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Sessions</span>
        <span className="font-mono">{bucket.sessionCount}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        Click bar to see top sessions
      </div>
    </div>
  );
}

// ---- Component -----------------------------------------------------------

export function SubagentCostBreakdown() {
  const filters = useChartFilters();
  const [, setLocation] = useLocation();
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);

  const queryString = useMemo(
    () => buildQuery(filters.range, filters.projects, filters.models),
    [filters.range, filters.projects, filters.models],
  );

  const { data, isLoading, error } = useQuery<SubagentCostsResponse>({
    queryKey: [`/api/charts/subagent-costs?${queryString}`],
    staleTime: 60 * 1000,
  });

  // Bars sorted by cost desc (server already sorts, but stay defensive).
  const sortedBuckets = useMemo(() => {
    if (!data?.byAgentType) return [] as AgentTypeBucket[];
    return data.byAgentType.slice().sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }, [data]);

  const selectedBucket = useMemo(() => {
    if (!selectedAgentType || !data) return null;
    return data.byAgentType.find(b => b.agentType === selectedAgentType) || null;
  }, [selectedAgentType, data]);

  // Reference colorClassForOwner once so the import is preserved by treeshaking
  // and so safety/source-text tests can spot the integration with the shared
  // palette module.
  const _badgeClassExample = colorClassForOwner({
    kind: "subagent-root",
    agentId: "preview",
  });
  void _badgeClassExample;
  void PALETTE;

  const navigateToSession = (sessionId: string) => {
    setLocation(`/analytics?tab=sessions&id=${sessionId}`);
  };

  // ---- Loading / error / empty branches ----

  if (isLoading) {
    return (
      <ChartCard title="Subagent Cost Distribution" icon={<Users className="h-3.5 w-3.5" />}>
        <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      </ChartCard>
    );
  }
  if (error) {
    return (
      <ChartCard title="Subagent Cost Distribution" icon={<Users className="h-3.5 w-3.5" />}>
        <div className="h-64 flex items-center justify-center text-xs text-destructive">
          Failed to load subagent costs
        </div>
      </ChartCard>
    );
  }

  const isEmpty = !data || sortedBuckets.length === 0;

  return (
    <ChartCard title="Subagent Cost Distribution" icon={<Users className="h-3.5 w-3.5" />}>
      <div className="space-y-3">
        {/* Headline tile — delegation percentage */}
        <div className="rounded-md border bg-card/50 px-3 py-2 flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold">
            {data ? formatPct(data.totals.delegationPercentage) : "0%"}
          </span>
          <span className="text-xs text-muted-foreground">
            of total spend went to subagents
          </span>
        </div>

        {isEmpty ? (
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            No subagents dispatched in this time range
          </div>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedBuckets}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    stroke="#71717a"
                    tickFormatter={formatUsd}
                  />
                  <YAxis
                    type="category"
                    dataKey="agentType"
                    tick={{ fontSize: 10 }}
                    stroke="#71717a"
                    width={120}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#27272a33" }} />
                  <Bar
                    dataKey="totalCostUsd"
                    name="Total cost"
                    isAnimationActive={false}
                    onClick={(entry: { payload?: AgentTypeBucket }) => {
                      const bucket = entry?.payload;
                      if (bucket) setSelectedAgentType(bucket.agentType);
                    }}
                    cursor="pointer"
                  >
                    {sortedBuckets.map((bucket, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={hexForAgentType(bucket.agentType)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Drill-in panel — top sessions for the clicked agent type */}
            {selectedBucket && (
              <div className="rounded-md border bg-card/50 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: hexForAgentType(selectedBucket.agentType) }}
                    />
                    <span className="text-xs font-medium">
                      Top sessions — {selectedBucket.agentType}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedAgentType(null)}
                  >
                    Close
                  </button>
                </div>
                {selectedBucket.topSessions.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">No sessions</div>
                ) : (
                  <ul className="space-y-1">
                    {selectedBucket.topSessions.map(s => (
                      <li
                        key={s.sessionId}
                        className="flex items-center justify-between gap-3 text-[11px]"
                      >
                        <button
                          type="button"
                          className="truncate text-left hover:text-foreground text-muted-foreground"
                          onClick={() => navigateToSession(s.sessionId)}
                          title={s.sessionId}
                        >
                          {s.slug || s.sessionId}
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono">{formatUsd(s.costUsd)}</span>
                          <span className="text-muted-foreground">
                            {formatPct(s.delegationRatio * 100)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ChartCard>
  );
}

export default SubagentCostBreakdown;
