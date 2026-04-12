// client/src/components/analytics/charts/tool-usage/ToolFrequency.tsx
//
// Horizontal bar chart of tool invocation counts. Bars sorted by count
// descending (the backend already sorts the response). Each bar is
// colored by the shared toolColors palette so the same tool gets the
// same color across the Tool Usage section.
//
// Note: tool counts come from flat `parsed.toolTimeline`, so subagent
// tool invocations are NOT counted yet. This is a known limitation
// from task002 and will be addressed in a follow-up phase.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { buildToolsUrl, type ToolsChartData } from "./use-tool-chart-data";
import { getToolColor } from "./tool-colors";

interface ToolFrequencyProps {
  /** Tree breakdown mode (`all` = parent + subagents). Defaults to `all`. */
  breakdown?: "all" | "parent";
}

interface TooltipPayloadEntry {
  payload: { tool: string; count: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: getToolColor(d.tool) }}
        />
        <span className="font-medium">{d.tool}</span>
      </div>
      <div className="text-muted-foreground font-mono mt-0.5">
        {d.count.toLocaleString()} calls
      </div>
    </div>
  );
}

export function ToolFrequency({ breakdown = "all" }: ToolFrequencyProps) {
  const filters = useChartFilters();
  // Hits /api/charts/tools with the global filters + breakdown=… param.
  const url = buildToolsUrl(filters, breakdown);
  const { data, isLoading, error } = useQuery<ToolsChartData>({
    queryKey: [url],
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => {
    if (!data?.frequency) return [];
    // Backend already sorts by count desc; defensive sort here in case that changes.
    return data.frequency.slice().sort((a, b) => b.count - a.count);
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-[260px] w-full animate-pulse rounded bg-muted/30" />
    );
  }
  if (error) {
    return (
      <div className="flex h-[260px] items-center justify-center text-xs text-destructive">
        Failed to load tool frequency
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 5, right: 16, left: 8, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" tick={{ fontSize: 10 }} />
        <YAxis
          type="category"
          dataKey="tool"
          tick={{ fontSize: 10 }}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {rows.map((row) => (
            <Cell key={row.tool} fill={getToolColor(row.tool)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ToolFrequency;
