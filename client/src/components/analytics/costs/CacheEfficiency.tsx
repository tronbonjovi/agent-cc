import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useCacheEfficiency } from "@/hooks/use-sessions";
import { formatTokens, formatUsd } from "@/lib/format";

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="h-5 w-40 bg-muted rounded animate-pulse" />
      <div className="h-16 w-32 mx-auto bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
      <div className="h-40 bg-muted rounded animate-pulse" />
    </div>
  );
}

// ---- Chart tooltip ----

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: number }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border bg-popover p-2 text-sm shadow-md">
      <div className="text-muted-foreground">Message {label}</div>
      <div className="font-mono text-green-400">{payload[0].value.toFixed(1)}% cache hit</div>
    </div>
  );
}

// ---- Main component ----

export function CacheEfficiency() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useCacheEfficiency(days);

  if (isLoading || !data) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-destructive">Failed to load cache efficiency</p>
      </div>
    );
  }

  const isEmpty = data.hitRate === 0 && data.cacheCreationCost === 0 && data.messageCurve.length === 0;

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div className="flex justify-end">
        <div className="flex gap-1">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No cache data for this period
        </div>
      ) : (
        <>
          {/* Big hit rate number */}
          <div className="text-center py-2">
            <span className="text-4xl font-bold font-mono text-green-400">
              {data.hitRate.toFixed(1)}%
            </span>
            <div className="text-xs text-muted-foreground mt-1">cache hit rate</div>
          </div>

          {/* First message vs steady state */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-lg font-bold font-mono">{formatTokens(data.firstMessageAvgInput)}</div>
              <div className="text-xs text-muted-foreground">first message avg</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-lg font-bold font-mono">{formatTokens(data.steadyStateAvgInput)}</div>
              <div className="text-xs text-muted-foreground">steady-state avg</div>
            </div>
          </div>

          {/* Cache ROI */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cache read savings</span>
              <span className="font-mono text-green-400">{formatUsd(data.cacheReadSavings)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cache creation cost</span>
              <span className="font-mono text-muted-foreground">{formatUsd(data.cacheCreationCost)}</span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-border pt-1.5">
              <span className="text-muted-foreground">ROI</span>
              <span className="font-mono font-medium text-green-400">
                {data.roi > 0 ? `${data.roi.toFixed(1)}x` : "---"}
              </span>
            </div>
          </div>

          {/* Cache curve sparkline */}
          {data.messageCurve.length > 1 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Cache read % by message index</div>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.messageCurve}>
                    <defs>
                      <linearGradient id="cacheGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="index"
                      tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cacheReadPct"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#cacheGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
