// client/src/components/analytics/charts/token-economics/TokenUsageOverTime.tsx
//
// Token usage over time — line or stacked-area view across input, output,
// cache read, and cache creation tokens. Subscribes to the global Charts
// filter context (range / projects / models) and the section-level
// breakdown toggle (parent-only vs tree-inclusive).
//
// Backend: /api/charts/tokens-over-time (chart-analytics route).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { Button } from "@/components/ui/button";

// ---- Types ----

interface TokensOverTimeRow {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  total: number;
}

export interface TokenUsageOverTimeProps {
  /** Section-level breakdown toggle: "all" = parent + subagents, "parent" = parent only. */
  breakdown?: "all" | "parent";
}

// ---- Helpers ----

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

// Builds the query string for /api/charts/tokens-over-time including the
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

// Solid hex fills only (CLAUDE.md / safety test enforced).
const SERIES_COLORS = {
  total: "#94a3b8",
  inputTokens: "#22d3ee",
  outputTokens: "#34d399",
  cacheReadTokens: "#a78bfa",
  cacheCreationTokens: "#f59e0b",
};

const SERIES: Array<{ key: keyof typeof SERIES_COLORS; label: string }> = [
  { key: "total", label: "Total" },
  { key: "inputTokens", label: "Input" },
  { key: "outputTokens", label: "Output" },
  { key: "cacheReadTokens", label: "Cache Read" },
  { key: "cacheCreationTokens", label: "Cache Creation" },
];

// ---- Custom tooltip ----

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
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-mono">{formatTokens(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Component ----

export function TokenUsageOverTime({ breakdown = "all" }: TokenUsageOverTimeProps) {
  const filters = useChartFilters();
  const [view, setView] = useState<"line" | "area">("line");

  const queryString = useMemo(
    () => buildQuery(filters.range, filters.projects, filters.models, breakdown),
    [filters.range, filters.projects, filters.models, breakdown],
  );

  const { data, isLoading, error } = useQuery<TokensOverTimeRow[]>({
    queryKey: [`/api/charts/tokens-over-time?${queryString}`],
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
        Failed to load token usage
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
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <Button
          variant={view === "line" ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setView("line")}
        >
          Line
        </Button>
        <Button
          variant={view === "area" ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setView("area")}
        >
          Stacked area
        </Button>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#71717a" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="#71717a"
                tickFormatter={formatTokens}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {SERIES.map(s => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={SERIES_COLORS[s.key]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#71717a" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="#71717a"
                tickFormatter={formatTokens}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {SERIES.filter(s => s.key !== "total").map(s => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stackId="1"
                  stroke={SERIES_COLORS[s.key]}
                  fill={SERIES_COLORS[s.key]}
                  fillOpacity={0.6}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default TokenUsageOverTime;
