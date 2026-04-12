// client/src/components/analytics/charts/file-activity/FileHeatmapExtended.tsx
//
// Top 25-50 most-touched files as a horizontal bar chart with operations
// stacked: read (blue), write (green), edit (amber). Backed by
// /api/charts/files (the `heatmap` array).
//
// Solid colors only (enforced by new-user-safety.test.ts).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";

interface HeatmapRow {
  file: string;
  reads: number;
  writes: number;
  edits: number;
  sessions: number;
}

interface FilesResponse {
  heatmap: HeatmapRow[];
  churn: Array<{ date: string; uniqueFiles: number }>;
}

const COLOR_READ = "#3b82f6"; // blue-500
const COLOR_WRITE = "#22c55e"; // green-500
const COLOR_EDIT = "#f59e0b"; // amber-500

function rangeToDays(range: string): string {
  if (range === "7d") return "7";
  if (range === "30d") return "30";
  if (range === "90d") return "90";
  if (range === "all") return "all";
  return "30";
}

function shortenPath(p: string, max = 36): string {
  if (p.length <= max) return p;
  // Keep filename + some leading context
  const parts = p.split(/[/\\]/);
  const file = parts[parts.length - 1];
  if (file.length >= max - 3) return "..." + file.slice(-max + 3);
  return "..." + p.slice(-max + 3);
}

function HeatmapTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HeatmapRow }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const total = d.reads + d.writes + d.edits;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md max-w-xs">
      <div className="font-mono text-foreground break-all mb-1">{d.file}</div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Reads</span>
          <span className="font-mono" style={{ color: COLOR_READ }}>{d.reads}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Writes</span>
          <span className="font-mono" style={{ color: COLOR_WRITE }}>{d.writes}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Edits</span>
          <span className="font-mono" style={{ color: COLOR_EDIT }}>{d.edits}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-1 mt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono">{total}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Sessions</span>
          <span className="font-mono">{d.sessions}</span>
        </div>
      </div>
    </div>
  );
}

export function FileHeatmapExtended() {
  const filters = useChartFilters();
  const [topN, setTopN] = useState<25 | 50>(25);

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

  const rows = useMemo(() => {
    const heatmap = data?.heatmap || [];
    return heatmap.slice(0, topN).map(r => ({
      ...r,
      label: shortenPath(r.file),
    }));
  }, [data, topN]);

  if (isLoading) {
    return (
      <div className="h-[420px] flex items-center justify-center text-xs text-muted-foreground">
        Loading file activity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[420px] flex items-center justify-center text-xs text-destructive">
        Failed to load file activity
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-[420px] flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  // Dynamic height — keep each row about 18px tall so the chart breathes
  const chartHeight = Math.max(320, rows.length * 18 + 60);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        {([25, 50] as const).map(n => (
          <button
            key={n}
            onClick={() => setTopN(n)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              topN === n
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Top {n}
          </button>
        ))}
      </div>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }}
              axisLine={false}
              tickLine={false}
              width={220}
              interval={0}
            />
            <Tooltip content={<HeatmapTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="square"
              formatter={(v: string) => (
                <span className="text-muted-foreground">{v}</span>
              )}
            />
            <Bar dataKey="reads" name="Read" stackId="ops" fill={COLOR_READ} />
            <Bar dataKey="writes" name="Write" stackId="ops" fill={COLOR_WRITE} />
            <Bar dataKey="edits" name="Edit" stackId="ops" fill={COLOR_EDIT} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default FileHeatmapExtended;
