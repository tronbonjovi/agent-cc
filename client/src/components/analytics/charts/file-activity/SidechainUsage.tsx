// client/src/components/analytics/charts/file-activity/SidechainUsage.tsx
//
// Sidechain usage over time. Backed by /api/charts/activity (the
// `sidechains` array). The endpoint already emits both the absolute count
// and the percentage of sidechain assistant turns relative to total
// assistant turns per day, so the dual-axis line chart can plot both
// without any client-side derivation.
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
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { formatDate } from "@/lib/format";

interface SidechainRow {
  date: string;
  count: number;
  percentage: number;
}

interface ActivityResponse {
  timeline: Array<{ date: string; sessions: number; tokens: number; files: number }>;
  projects: Array<{ project: string; sessions: number; tokens: number; files: number }>;
  sidechains: SidechainRow[];
}

const COLOR_COUNT = "#a78bfa"; // violet-400 — left axis
const COLOR_PCT = "#22d3ee"; // cyan-400 — right axis

function rangeToDays(range: string): string {
  if (range === "7d") return "7";
  if (range === "30d") return "30";
  if (range === "90d") return "90";
  if (range === "all") return "all";
  return "30";
}


function SidechainTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: SidechainRow }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="text-muted-foreground mb-1">{label ? formatDate(label) : ""}</div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Sidechain msgs</span>
          <span className="font-mono" style={{ color: COLOR_COUNT }}>{d.count}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">% of total</span>
          <span className="font-mono" style={{ color: COLOR_PCT }}>{d.percentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export function SidechainUsage() {
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

  const rows = data?.sidechains || [];
  const hasAny = rows.some(r => r.count > 0);

  if (isLoading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        Loading sidechain data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-destructive">
        Failed to load sidechain data
      </div>
    );
  }

  if (rows.length === 0 || !hasAny) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="h-[280px]">
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
            yAxisId="left"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<SidechainTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconType="square"
            formatter={(v: string) => <span className="text-muted-foreground">{v}</span>}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="count"
            name="Sidechain count"
            stroke={COLOR_COUNT}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="percentage"
            name="% of total"
            stroke={COLOR_PCT}
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SidechainUsage;
