// client/src/components/analytics/charts/token-economics/TokenDestinationBreakdown.tsx
//
// Pie chart of where tokens go: system prompt, conversation, tool execution,
// thinking, and cache overhead. Sources from the costs-deepening anatomy
// endpoint, which already aggregates the per-category counts.
//
// This chart does NOT use the breakdown=parent|all toggle (the anatomy
// endpoint computes its categories at the parsed-message layer and is the
// same regardless of subagent inclusion).
//
// Backend: /api/analytics/costs/anatomy
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { formatTokens } from "@/lib/format";

interface AnatomyCategory {
  tokens: number;
  cost: number;
}

interface AnatomyData {
  systemPrompt: AnatomyCategory;
  conversation: AnatomyCategory;
  toolExecution: AnatomyCategory;
  thinking: AnatomyCategory;
  cacheOverhead: AnatomyCategory;
  total: AnatomyCategory;
}

// Solid colors only.
const CATEGORIES = [
  { key: "systemPrompt", label: "System Prompt", color: "#6366f1" },
  { key: "conversation", label: "Conversation", color: "#22d3ee" },
  { key: "toolExecution", label: "Tool Execution", color: "#f59e0b" },
  { key: "thinking", label: "Thinking", color: "#a78bfa" },
  { key: "cacheOverhead", label: "Cache Overhead", color: "#f43f5e" },
] as const;


function rangeToDays(range: string): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  // The anatomy endpoint takes a numeric days param; "all" maps to a wide
  // window. 365 is plenty for any sensible usage history.
  return 365;
}

interface PieEntry {
  name: string;
  tokens: number;
  cost: number;
  fill: string;
}

function CustomTooltip({
  active,
  payload,
  totalTokens,
}: {
  active?: boolean;
  payload?: Array<{ payload: PieEntry }>;
  totalTokens: number;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const pct = totalTokens > 0 ? ((d.tokens / totalTokens) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: d.fill }}
        />
        <span className="font-medium">{d.name}</span>
      </div>
      <div className="text-muted-foreground">
        {formatTokens(d.tokens)} tokens ({pct}%)
      </div>
    </div>
  );
}

export function TokenDestinationBreakdown() {
  const filters = useChartFilters();
  const days = rangeToDays(filters.range);

  const { data, isLoading, error } = useQuery<AnatomyData>({
    queryKey: [`/api/analytics/costs/anatomy?days=${days}`],
    staleTime: 5 * 60 * 1000,
  });

  const chartData: PieEntry[] = useMemo(() => {
    if (!data) return [];
    return CATEGORIES.map(c => ({
      name: c.label,
      tokens: data[c.key].tokens,
      cost: data[c.key].cost,
      fill: c.color,
    })).filter(d => d.tokens > 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-destructive">
        Failed to load token destination
      </div>
    );
  }
  if (!data || chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="tokens"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={85}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ""} ${percent ? (percent * 100).toFixed(0) : 0}%`
            }
            labelLine={false}
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            content={<CustomTooltip totalTokens={data.total.tokens} />}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TokenDestinationBreakdown;
