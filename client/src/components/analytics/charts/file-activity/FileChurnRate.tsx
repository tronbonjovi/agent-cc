// client/src/components/analytics/charts/file-activity/FileChurnRate.tsx
//
// Daily file churn — unique files touched per day. Backed by
// /api/charts/files (the `churn` array).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";

interface ChurnRow {
  date: string;
  uniqueFiles: number;
}

interface FilesResponse {
  heatmap: Array<{ file: string; reads: number; writes: number; edits: number; sessions: number }>;
  churn: ChurnRow[];
}

const COLOR_LINE = "#22d3ee"; // cyan-400

function rangeToDays(range: string): string {
  if (range === "7d") return "7";
  if (range === "30d") return "30";
  if (range === "90d") return "90";
  if (range === "all") return "all";
  return "30";
}

function formatDate(d: string): string {
  // YYYY-MM-DD → MMM DD
  const date = new Date(d + "T00:00:00");
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChurnTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="text-muted-foreground">{label ? formatDate(label) : ""}</div>
      <div className="font-mono" style={{ color: COLOR_LINE }}>
        {payload[0].value} files
      </div>
    </div>
  );
}

export function FileChurnRate() {
  const filters = useChartFilters();

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("days", rangeToDays(filters.range));
    if (filters.projects.length > 0) p.set("projects", filters.projects.join(","));
    if (filters.models.length > 0) p.set("models", filters.models.join(","));
    return p.toString();
  }, [filters.range, filters.projects, filters.models]);

  const url = `/api/charts/files?${params}`;
  const { data, isLoading, error } = useQuery<FilesResponse>({
    queryKey: [url],
  });

  const rows = data?.churn || [];

  if (isLoading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        Loading churn data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-destructive">
        Failed to load churn data
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

  // Average files/day for context line
  const avg = Math.round(rows.reduce((sum, r) => sum + r.uniqueFiles, 0) / rows.length);

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground text-right">
        avg <span className="font-mono text-foreground">{avg}</span> files/day
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              tickFormatter={formatDate}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<ChurnTooltip />} />
            <Line
              type="monotone"
              dataKey="uniqueFiles"
              stroke={COLOR_LINE}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default FileChurnRate;
