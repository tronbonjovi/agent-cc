import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useTokenAnatomy, type TokenAnatomyCategory } from "@/hooks/use-sessions";
import { Layers } from "lucide-react";

// ---- Utilities ----

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

// ---- Category config ----

const CATEGORIES = [
  { key: "systemPrompt", label: "System Prompt", color: "#6366f1" },
  { key: "conversation", label: "Conversation", color: "#22d3ee" },
  { key: "toolExecution", label: "Tool Execution", color: "#f59e0b" },
  { key: "thinking", label: "Thinking", color: "#a78bfa" },
  { key: "cacheOverhead", label: "Cache Overhead", color: "#f43f5e" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

// ---- Loading skeleton ----

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="h-5 w-40 bg-muted rounded animate-pulse" />
      <div className="flex items-center justify-center h-64">
        <div className="h-48 w-48 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---- Custom tooltip ----

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; tokens: number; cost: number; fill: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.fill }} />
        <span className="font-medium">{d.name}</span>
      </div>
      <div className="text-muted-foreground">{formatTokens(d.tokens)} tokens</div>
      <div className="text-green-400 font-mono">{formatUsd(d.cost)}</div>
    </div>
  );
}

// ---- Main component ----

export function TokenAnatomy() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useTokenAnatomy(days);

  const chartData = useMemo(() => {
    if (!data) return [];
    return CATEGORIES.map(cat => ({
      name: cat.label,
      tokens: data[cat.key].tokens,
      cost: data[cat.key].cost,
      fill: cat.color,
    })).filter(d => d.tokens > 0);
  }, [data]);

  if (isLoading || !data) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-destructive">Failed to load token anatomy</p>
      </div>
    );
  }

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

      {/* Summary header */}
      <div className="flex items-baseline gap-4">
        <div>
          <span className="text-2xl font-bold font-mono">{formatTokens(data.total.tokens)}</span>
          <span className="text-xs text-muted-foreground ml-1">tokens</span>
        </div>
        <div>
          <span className="text-lg font-bold font-mono text-green-400">{formatUsd(data.total.cost)}</span>
          <span className="text-xs text-muted-foreground ml-1">est. cost</span>
        </div>
      </div>

      {/* Pie chart */}
      {chartData.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="tokens"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
              >
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No token data for this period
        </div>
      )}

      {/* Category breakdown */}
      <div className="space-y-1.5">
        {CATEGORIES.map(cat => {
          const d = data[cat.key] as TokenAnatomyCategory;
          if (d.tokens === 0 && data.total.tokens === 0) return null;
          const pct = data.total.tokens > 0 ? ((d.tokens / data.total.tokens) * 100).toFixed(1) : "0.0";
          return (
            <div key={cat.key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-muted-foreground">{cat.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground/60">{pct}%</span>
                <span className="text-muted-foreground/60 w-14 text-right">{formatTokens(d.tokens)}</span>
                <span className="font-mono text-green-400 w-16 text-right">{formatUsd(d.cost)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

