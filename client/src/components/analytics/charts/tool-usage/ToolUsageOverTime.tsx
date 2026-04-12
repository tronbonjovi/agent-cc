// client/src/components/analytics/charts/tool-usage/ToolUsageOverTime.tsx
//
// Stacked area chart showing daily tool-mix over time. Each tool gets
// its own colored band from the shared toolColors palette so users can
// see at a glance how their tool usage shifts day to day.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import {
  buildToolsUrl,
  type ToolOverTimeRow,
  type ToolsChartData,
} from "./use-tool-chart-data";
import { getToolColor } from "./tool-colors";

interface ToolUsageOverTimeProps {
  /** Tree breakdown mode. Defaults to `all`. */
  breakdown?: "all" | "parent";
}

/** Collect every distinct tool name across the over-time rows. */
function collectToolNames(rows: ToolOverTimeRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== "date") names.add(key);
    }
  }
  // Stable order so legend & stack ordering are deterministic.
  return Array.from(names).sort();
}

interface AreaTooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: AreaTooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Sort entries descending so the busiest tools render at the top of the tooltip.
  const sorted = payload.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md max-w-[200px]">
      <div className="font-medium mb-1">{label}</div>
      <div className="space-y-0.5">
        {sorted.map(entry => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground truncate flex-1">{entry.name}</span>
            <span className="font-mono">{(entry.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolUsageOverTime({ breakdown = "all" }: ToolUsageOverTimeProps) {
  const filters = useChartFilters();
  // Hits /api/charts/tools with the global filters + breakdown=… param.
  const url = buildToolsUrl(filters, breakdown);
  const { data, isLoading, error } = useQuery<ToolsChartData>({
    queryKey: [url],
    staleTime: 5 * 60 * 1000,
  });

  const { rows, toolNames } = useMemo(() => {
    if (!data?.overTime) return { rows: [], toolNames: [] };
    const sorted = data.overTime.slice().sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    return { rows: sorted, toolNames: collectToolNames(sorted) };
  }, [data]);

  if (isLoading) {
    return <div className="h-[260px] w-full animate-pulse rounded bg-muted/30" />;
  }
  if (error) {
    return (
      <div className="flex h-[260px] items-center justify-center text-xs text-destructive">
        Failed to load tool usage timeline
      </div>
    );
  }
  if (rows.length === 0 || toolNames.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {toolNames.map(name => {
          const color = getToolColor(name);
          return (
            <Area
              key={name}
              type="monotone"
              dataKey={name}
              stackId="tools"
              stroke={color}
              fill={color}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default ToolUsageOverTime;
