// client/src/components/analytics/charts/session-patterns/SessionDepthDistribution.tsx
//
// Histogram of session depth (= tree.totals.assistantTurns, which INCLUDES
// subagent turns — the depth metric is tree-inclusive by design so a
// 5-turn parent that dispatched a 50-turn subagent registers deep, not
// shallow).
//
// - Horizontal BarChart from /api/charts/session-distributions (depth buckets)
// - Median + mean reference lines computed from the bucket midpoints
// - X-axis labeled "Assistant turns (includes subagent turns)" to make the
//   tree-inclusive semantics explicit at the reader
// - Tooltip currently shows the bucket count only. Adding a "N with subagents"
//   subcount would require the backend to return that field per bucket;
//   deferred — not currently tracked against an open task.
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { Layers } from "lucide-react";
import { ChartCard } from "../ChartCard";
import { useChartFilters } from "../GlobalFilterBar";
import { filtersToQueryString } from "./filters-to-query";

interface DepthBucket {
  bucket: string;
  count: number;
}

interface SessionDistributionsResponse {
  depth: DepthBucket[];
  duration: { bucket: string; count: number }[];
}

const COLOR_BAR = "#6366f1"; // indigo-500

// Bucket midpoints used for the mean/median reference-line approximation.
// These mirror the backend's depth bucket boundaries in
// server/routes/chart-analytics.ts (1-5, 6-20, 21-50, 51-100, 100+).
const BUCKET_MIDPOINTS: Record<string, number> = {
  "1-5": 3,
  "6-20": 13,
  "21-50": 35,
  "51-100": 75,
  "100+": 150,
};

function computeStats(buckets: DepthBucket[]): { mean: number; medianBucket: string | null } {
  let totalCount = 0;
  let weightedSum = 0;
  for (const b of buckets) {
    totalCount += b.count;
    weightedSum += (BUCKET_MIDPOINTS[b.bucket] ?? 0) * b.count;
  }
  if (totalCount === 0) return { mean: 0, medianBucket: null };
  const mean = weightedSum / totalCount;

  // Median: walk buckets and find the one containing the (totalCount/2)th item.
  const half = totalCount / 2;
  let running = 0;
  let medianBucket: string | null = null;
  for (const b of buckets) {
    running += b.count;
    if (running >= half) {
      medianBucket = b.bucket;
      break;
    }
  }
  return { mean, medianBucket };
}

interface TooltipPayloadItem {
  value: number;
  payload: DepthBucket;
}

function DepthTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md space-y-1">
      <div className="font-medium text-popover-foreground">{label} turns</div>
      <div className="text-muted-foreground">
        Sessions: <span className="font-mono text-foreground">{row.count}</span>
      </div>
      {/* Future enhancement: /api/charts/session-distributions does not
          yet return a "with subagents" subcount per depth bucket. If the
          backend gains a `withSubagents` field, render it here as
          `N with subagents` so the reader can see how much of each bucket's
          depth came from delegation. */}
    </div>
  );
}

export function SessionDepthDistribution() {
  const filters = useChartFilters();
  const qs = filtersToQueryString(filters);
  const url = `/api/charts/session-distributions${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useQuery<SessionDistributionsResponse>({ queryKey: [url] });

  const buckets = data?.depth ?? [];
  const isEmpty = buckets.length === 0 || buckets.every(b => b.count === 0);
  const { mean, medianBucket } = computeStats(buckets);

  return (
    <ChartCard title="Session Depth Distribution" icon={<Layers className="h-4 w-4" />} loading={isLoading}>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No data in selected range
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={buckets} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                allowDecimals={false}
                label={{
                  value: "Sessions",
                  position: "insideBottom",
                  offset: -4,
                  style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <YAxis
                type="category"
                dataKey="bucket"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={60}
              />
              <Tooltip content={<DepthTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
              {medianBucket && (
                <ReferenceLine
                  y={medianBucket}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  label={{ value: "median", position: "right", fontSize: 10, fill: "#f59e0b" }}
                />
              )}
              <Bar dataKey="count" fill={COLOR_BAR} name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Assistant turns (includes subagent turns)</span>
            {mean > 0 && (
              <span className="font-mono">mean ~{mean.toFixed(1)}</span>
            )}
          </div>
        </>
      )}
    </ChartCard>
  );
}

export default SessionDepthDistribution;
