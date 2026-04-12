// client/src/components/analytics/charts/token-economics/CacheEfficiencyOverTime.tsx
//
// Cache efficiency over time — pairs a hit-rate line with a stacked area
// of cached vs uncached input tokens. Subscribes to global filters and
// the section breakdown toggle (parent-only vs tree-inclusive).
//
// Backend: /api/charts/cache-over-time (chart-analytics route).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";

interface CacheRow {
  date: string;
  hitRate: number;
  cachedTokens: number;
  uncachedTokens: number;
}

export interface CacheEfficiencyOverTimeProps {
  breakdown?: "all" | "parent";
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

// Builds the query string for /api/charts/cache-over-time including the
// section breakdown toggle as `breakdown=parent|all`.
function buildQuery(
  range: string,
  projects: string[],
  models: string[],
  breakdown: "all" | "parent",
): string {
  const params = new URLSearchParams();
  if (range !== "all") params.set("days", range.replace("d", ""));
  else params.set("days", "all");
  if (projects.length > 0) params.set("projects", projects.join(","));
  if (models.length > 0) params.set("models", models.join(","));
  params.set("breakdown", breakdown);
  return params.toString();
}

// Solid colors only.
const COLORS = {
  cached: "#34d399",
  uncached: "#f43f5e",
  hitRate: "#fbbf24",
};

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => {
        const isPct = p.dataKey === "hitRate";
        const value = isPct ? `${p.value.toFixed(1)}%` : formatTokens(p.value);
        return (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-muted-foreground">{p.name}</span>
            </div>
            <span className="font-mono">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CacheEfficiencyOverTime({
  breakdown = "all",
}: CacheEfficiencyOverTimeProps) {
  const filters = useChartFilters();

  const queryString = useMemo(
    () => buildQuery(filters.range, filters.projects, filters.models, breakdown),
    [filters.range, filters.projects, filters.models, breakdown],
  );

  const { data, isLoading, error } = useQuery<CacheRow[]>({
    queryKey: [`/api/charts/cache-over-time?${queryString}`],
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-destructive">
        Failed to load cache efficiency
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#71717a" />
          <YAxis
            yAxisId="tokens"
            tick={{ fontSize: 10 }}
            stroke="#71717a"
            tickFormatter={formatTokens}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={{ fontSize: 10 }}
            stroke="#71717a"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area
            yAxisId="tokens"
            type="monotone"
            dataKey="cachedTokens"
            name="Cached"
            stackId="1"
            stroke={COLORS.cached}
            fill={COLORS.cached}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Area
            yAxisId="tokens"
            type="monotone"
            dataKey="uncachedTokens"
            name="Uncached"
            stackId="1"
            stroke={COLORS.uncached}
            fill={COLORS.uncached}
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="hitRate"
            name="Hit rate"
            stroke={COLORS.hitRate}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default CacheEfficiencyOverTime;
