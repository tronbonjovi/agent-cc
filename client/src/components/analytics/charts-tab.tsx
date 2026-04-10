import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, BarChart3, Activity } from "lucide-react";

// ---- Types ----

interface CostByDay {
  date: string;
  cost: number;
  computeCost: number;
  cacheCost: number;
}

interface CostSummaryData {
  byDay: CostByDay[];
  totalCost: number;
  totalTokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
}

interface SessionAnalyticsData {
  byDay: Array<{ date: string; cost: number; sessions: number; tokens: number }>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalSessions: number;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

// ---- Helpers ----

function filterByRange<T extends { date: string }>(data: T[], range: TimeRange): T[] {
  if (range === "all") return data;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return data.filter(d => d.date >= cutoffStr);
}

function formatDateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDollars(n: number): string {
  return "$" + n.toFixed(2);
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

// ---- Subcomponents ----

function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  const ranges: TimeRange[] = ["7d", "30d", "90d", "all"];
  const labels: Record<TimeRange, string> = { "7d": "7d", "30d": "30d", "90d": "90d", "all": "All" };
  return (
    <div className="flex gap-1">
      {ranges.map(r => (
        <Button
          key={r}
          variant={value === r ? "default" : "outline"}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(r)}
        >
          {labels[r]}
        </Button>
      ))}
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
      <p className="text-sm">No data for this time range</p>
    </div>
  );
}

// Custom tooltip styling to match the app theme
function ChartTooltipContent({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="text-muted-foreground text-xs mb-1">{String(label ?? "")}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-mono text-xs">
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ---- Chart panels ----

function CostOverTimeChart({ data, range }: { data: CostByDay[]; range: TimeRange }) {
  const filtered = useMemo(() => filterByRange(data, range), [data, range]);

  if (filtered.length === 0) return <EmptyChartState />;

  const chartData = filtered.map(d => ({
    date: formatDateLabel(d.date),
    rawDate: d.date,
    cost: Math.round(d.cost * 100) / 100,
    compute: Math.round(d.computeCost * 100) / 100,
    cache: Math.round(d.cacheCost * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload as any}
              label={label}
              formatter={formatDollars}
            />
          )}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="cost"
          name="Total"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={filtered.length <= 30}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="compute"
          name="Compute"
          stroke="#f59e0b"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="4 2"
        />
        <Line
          type="monotone"
          dataKey="cache"
          name="Cache"
          stroke="#10b981"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SessionFrequencyChart({ data, range }: { data: Array<{ date: string; sessions: number }>; range: TimeRange }) {
  const filtered = useMemo(() => filterByRange(data, range), [data, range]);

  if (filtered.length === 0) return <EmptyChartState />;

  const chartData = filtered.map(d => ({
    date: formatDateLabel(d.date),
    sessions: d.sessions,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          allowDecimals={false}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload as any}
              label={label}
              formatter={(v) => `${v} sessions`}
            />
          )}
        />
        <Bar
          dataKey="sessions"
          name="Sessions"
          fill="#8b5cf6"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TokenUsageTrendsChart({ data, range }: { data: Array<{ date: string; tokens: number }>; range: TimeRange }) {
  const filtered = useMemo(() => filterByRange(data, range), [data, range]);

  if (filtered.length === 0) return <EmptyChartState />;

  const chartData = filtered.map(d => ({
    date: formatDateLabel(d.date),
    tokens: d.tokens,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={formatTokensShort}
        />
        <Tooltip
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload as any}
              label={label}
              formatter={(v) => formatTokensShort(v)}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          name="Tokens"
          stroke="#06b6d4"
          fill="#06b6d4"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Main component ----

export default function ChartsTab() {
  const [costRange, setCostRange] = useState<TimeRange>("30d");
  const [sessionRange, setSessionRange] = useState<TimeRange>("30d");
  const [tokenRange, setTokenRange] = useState<TimeRange>("30d");

  // Cost data from cost-indexer (has compute/cache breakdown)
  const { data: costData, isLoading: costLoading } = useQuery<CostSummaryData>({
    queryKey: ["/api/analytics/costs", costRange],
    queryFn: async () => {
      const days = costRange === "all" ? 90 : costRange === "7d" ? 7 : costRange === "30d" ? 30 : 90;
      const res = await fetch(`/api/analytics/costs?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch cost data");
      return res.json();
    },
  });

  // Session analytics data (has sessions per day and tokens per day)
  const { data: sessionData, isLoading: sessionLoading } = useQuery<SessionAnalyticsData>({
    queryKey: ["/api/sessions/analytics/costs"],
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      {/* Cost over time */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Cost Over Time</CardTitle>
            </div>
            <TimeRangeSelector value={costRange} onChange={setCostRange} />
          </div>
        </CardHeader>
        <CardContent>
          {costLoading ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              Loading cost data...
            </div>
          ) : (
            <CostOverTimeChart data={costData?.byDay || []} range={costRange} />
          )}
        </CardContent>
      </Card>

      {/* Session frequency */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Session Frequency</CardTitle>
            </div>
            <TimeRangeSelector value={sessionRange} onChange={setSessionRange} />
          </div>
        </CardHeader>
        <CardContent>
          {sessionLoading ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              Loading session data...
            </div>
          ) : (
            <SessionFrequencyChart data={sessionData?.byDay || []} range={sessionRange} />
          )}
        </CardContent>
      </Card>

      {/* Token usage trends */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Token Usage Trends</CardTitle>
            </div>
            <TimeRangeSelector value={tokenRange} onChange={setTokenRange} />
          </div>
        </CardHeader>
        <CardContent>
          {sessionLoading ? (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              Loading token data...
            </div>
          ) : (
            <TokenUsageTrendsChart data={sessionData?.byDay || []} range={tokenRange} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
