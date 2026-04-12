// client/src/components/analytics/charts/token-economics/ModelDistribution.tsx
//
// Stacked-bar chart of token usage per day broken down by model. Each model
// gets a stable color from the shared subagent palette so the same model
// always renders the same hue across views (matches Sessions detail).
//
// Backend: /api/charts/models — rows shaped as { date, [model]: tokens, ... }
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";

export interface ModelDistributionProps {
  breakdown?: "all" | "parent";
}

interface ModelRow {
  date: string;
  [model: string]: string | number;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

// Builds the query string for /api/charts/models including the section
// breakdown toggle as `breakdown=parent|all`.
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

// Solid hex palette derived from the shared subagent palette in
// client/src/components/analytics/sessions/subagent-colors.ts. Same hash
// strategy: stable per-model index based on model name.
const MODEL_PALETTE = [
  "#0ea5e9", // sky-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
];

function colorForModel(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) {
    hash = (hash + model.charCodeAt(i)) >>> 0;
  }
  return MODEL_PALETTE[hash % MODEL_PALETTE.length];
}

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
            <span className="text-muted-foreground truncate max-w-[160px]">
              {p.name}
            </span>
          </div>
          <span className="font-mono">{formatTokens(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ModelDistribution({ breakdown = "all" }: ModelDistributionProps) {
  const filters = useChartFilters();

  const queryString = useMemo(
    () => buildQuery(filters.range, filters.projects, filters.models, breakdown),
    [filters.range, filters.projects, filters.models, breakdown],
  );

  const { data, isLoading, error } = useQuery<ModelRow[]>({
    queryKey: [`/api/charts/models?${queryString}`],
    staleTime: 60 * 1000,
  });

  // Discover model keys (everything except "date")
  const modelKeys = useMemo(() => {
    if (!data) return [];
    const keys = new Set<string>();
    for (const row of data) {
      Object.keys(row).forEach(k => {
        if (k !== "date") keys.add(k);
      });
    }
    return Array.from(keys).sort();
  }, [data]);

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
        Failed to load model distribution
      </div>
    );
  }
  if (!data || data.length === 0 || modelKeys.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#71717a" />
          <YAxis
            tick={{ fontSize: 10 }}
            stroke="#71717a"
            tickFormatter={formatTokens}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {modelKeys.map(model => (
            <Bar
              key={model}
              dataKey={model}
              name={model}
              stackId="models"
              fill={colorForModel(model)}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ModelDistribution;
