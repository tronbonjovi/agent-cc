// client/src/components/analytics/charts/file-activity/ActivityTimeline.tsx
//
// Daily activity timeline. Backed by /api/charts/activity (the `timeline`
// array). Each day shows session count, token volume, and unique files
// touched. The contract suggests a ScatterChart or custom density layout —
// because the endpoint emits one row per day (not per hour) we use a
// composed bar+line view where bars are sessions and the line tracks
// unique files. Token volume drives the bar opacity so high-spend days
// pop visually without leaving the solid-color palette.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { formatDate, formatTokens } from "@/lib/format";

interface TimelineRow {
  date: string;
  sessions: number;
  tokens: number;
  files: number;
}

interface ActivityResponse {
  timeline: TimelineRow[];
  projects: Array<{ project: string; sessions: number; tokens: number; files: number }>;
  sidechains: Array<{ date: string; count: number; percentage: number }>;
}

const COLOR_BAR = "#6366f1"; // indigo-500
const COLOR_LINE = "#f59e0b"; // amber-500

function rangeToDays(range: string): string {
  if (range === "7d") return "7";
  if (range === "30d") return "30";
  if (range === "90d") return "90";
  if (range === "all") return "all";
  return "30";
}


function ActivityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: TimelineRow }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="text-muted-foreground mb-1">{label ? formatDate(label) : ""}</div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Sessions</span>
          <span className="font-mono" style={{ color: COLOR_BAR }}>{d.sessions}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Files</span>
          <span className="font-mono" style={{ color: COLOR_LINE }}>{d.files}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Tokens</span>
          <span className="font-mono">{formatTokens(d.tokens)}</span>
        </div>
      </div>
    </div>
  );
}

export function ActivityTimeline() {
  const filters = useChartFilters();

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("days", rangeToDays(filters.range));
    if (filters.projects.length > 0) p.set("projects", filters.projects.join(","));
    if (filters.models.length > 0) p.set("models", filters.models.join(","));
    return p.toString();
  }, [filters.range, filters.projects, filters.models]);

  const url = `/api/charts/activity?${params}`;
  const { data, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: [url],
  });

  const rows = data?.timeline || [];
  const maxTokens = useMemo(() => {
    let max = 0;
    for (const r of rows) if (r.tokens > max) max = r.tokens;
    return max;
  }, [rows]);

  if (isLoading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        Loading activity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-destructive">
        Failed to load activity
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            tickFormatter={formatDate}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<ActivityTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="square"
            formatter={(v: string) => <span className="text-muted-foreground">{v}</span>}
          />
          <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill={COLOR_BAR}>
            {rows.map((row, idx) => {
              // Density: opacity scales with tokens for the day
              const opacity = maxTokens > 0 ? 0.35 + 0.65 * (row.tokens / maxTokens) : 0.7;
              return <Cell key={`cell-${idx}`} fill={COLOR_BAR} fillOpacity={opacity} />;
            })}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="files"
            name="Unique files"
            stroke={COLOR_LINE}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ActivityTimeline;
