// client/src/components/analytics/charts/session-patterns/SessionDurationDistribution.tsx
//
// Histogram of wall-clock session duration.
//
// - Horizontal BarChart from /api/charts/session-distributions (duration buckets)
// - Backend currently returns these buckets:
//     <5m, 5-30m, 30m-2h, 2-6h, >6h
//   The task contract requested finer granularity (<5m, 5-15m, 15-30m,
//   30-60m, 1-2h, 2h+) but rebucketing requires a backend change owned
//   by charts-enrichment-task007. We render whatever the backend gives us
//   so this chart stays accurate even if those bucket boundaries shift.
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Clock } from "lucide-react";
import { ChartCard } from "../ChartCard";
import { useChartFilters } from "../GlobalFilterBar";
import { filtersToQueryString } from "./filters-to-query";

interface DurationBucket {
  bucket: string;
  count: number;
}

interface SessionDistributionsResponse {
  depth: { bucket: string; count: number }[];
  duration: DurationBucket[];
}

const COLOR_BAR = "#0ea5e9"; // sky-500

interface TooltipPayloadItem {
  value: number;
  payload: DurationBucket;
}

function DurationTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md space-y-1">
      <div className="font-medium text-popover-foreground">{label}</div>
      <div className="text-muted-foreground">
        Sessions: <span className="font-mono text-foreground">{row.count}</span>
      </div>
    </div>
  );
}

export function SessionDurationDistribution() {
  const filters = useChartFilters();
  const qs = filtersToQueryString(filters);
  const url = `/api/charts/session-distributions${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useQuery<SessionDistributionsResponse>({ queryKey: [url] });

  const buckets = data?.duration ?? [];
  const isEmpty = buckets.length === 0 || buckets.every(b => b.count === 0);

  return (
    <ChartCard title="Session Duration Distribution" icon={<Clock className="h-4 w-4" />} loading={isLoading}>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No data in selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={buckets} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="bucket"
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              width={70}
            />
            <Tooltip content={<DurationTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
            <Bar dataKey="count" fill={COLOR_BAR} name="Sessions" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export default SessionDurationDistribution;
