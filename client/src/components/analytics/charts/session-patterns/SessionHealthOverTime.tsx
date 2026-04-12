// client/src/components/analytics/charts/session-patterns/SessionHealthOverTime.tsx
//
// Stacked area chart of session health over time.
// - Pulls /api/charts/sessions and renders healthGood/healthFair/healthPoor
//   as stacked solid-fill areas (green / amber / red).
// - Solid fills only (per CLAUDE.md / new-user-safety enforcement).
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { HeartPulse } from "lucide-react";
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

function HealthAreaTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
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

export function SessionHealthOverTime() {
  const filters = useChartFilters();
  const qs = filtersToQueryString(filters);
  const url = `/api/charts/sessions${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useQuery<SessionsRow[]>({ queryKey: [url] });

  const isEmpty = !data || data.length === 0;

  return (
    <ChartCard title="Session Health Over Time" icon={<HeartPulse className="h-4 w-4" />} loading={isLoading}>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No data in selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip content={<HealthAreaTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="healthGood"
              stackId="health"
              stroke={COLOR_GOOD}
              fill={COLOR_GOOD}
              fillOpacity={0.85}
              name="Good"
            />
            <Area
              type="monotone"
              dataKey="healthFair"
              stackId="health"
              stroke={COLOR_FAIR}
              fill={COLOR_FAIR}
              fillOpacity={0.85}
              name="Fair"
            />
            <Area
              type="monotone"
              dataKey="healthPoor"
              stackId="health"
              stroke={COLOR_POOR}
              fill={COLOR_POOR}
              fillOpacity={0.85}
              name="Poor"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export default SessionHealthOverTime;
