// client/src/components/analytics/charts/session-patterns/SessionFrequency.tsx
//
// Daily session count, color-segmented by health.
// - Stacked BarChart from /api/charts/sessions
// - Three series: healthGood (green), healthFair (amber), healthPoor (red)
// - Tooltip shows total count and the per-health breakdown
//
// Solid colors only. No bounce/scale animations.
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Activity } from "lucide-react";
import { ChartCard } from "../ChartCard";
import { useChartFilters } from "../GlobalFilterBar";
import { filtersToQueryString } from "./filters-to-query";

interface SessionsRow {
  date: string;
  count: number;
  healthGood: number;
  healthFair: number;
  healthPoor: number;
  avgMessages: number;
  avgDuration: number;
}

const COLOR_GOOD = "#22c55e"; // green-500
const COLOR_FAIR = "#f59e0b"; // amber-500
const COLOR_POOR = "#ef4444"; // red-500

interface TooltipPayloadItem {
  value: number;
  dataKey: string;
  payload: SessionsRow;
}

function HealthTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md space-y-1">
      <div className="font-medium text-popover-foreground">{label}</div>
      <div className="text-muted-foreground">Total: <span className="font-mono text-foreground">{row.count}</span></div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COLOR_GOOD }} />
        <span className="text-muted-foreground">Good:</span>
        <span className="font-mono text-foreground">{row.healthGood}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COLOR_FAIR }} />
        <span className="text-muted-foreground">Fair:</span>
        <span className="font-mono text-foreground">{row.healthFair}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COLOR_POOR }} />
        <span className="text-muted-foreground">Poor:</span>
        <span className="font-mono text-foreground">{row.healthPoor}</span>
      </div>
    </div>
  );
}

export function SessionFrequency() {
  const filters = useChartFilters();
  const qs = filtersToQueryString(filters);
  const url = `/api/charts/sessions${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useQuery<SessionsRow[]>({ queryKey: [url] });

  const isEmpty = !data || data.length === 0;

  return (
    <ChartCard title="Session Frequency" icon={<Activity className="h-4 w-4" />} loading={isLoading}>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No data in selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip content={<HealthTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="healthGood" stackId="health" fill={COLOR_GOOD} name="Good" />
            <Bar dataKey="healthFair" stackId="health" fill={COLOR_FAIR} name="Fair" />
            <Bar dataKey="healthPoor" stackId="health" fill={COLOR_POOR} name="Poor" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export default SessionFrequency;
