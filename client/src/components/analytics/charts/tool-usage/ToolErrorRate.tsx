// client/src/components/analytics/charts/tool-usage/ToolErrorRate.tsx
//
// Grouped bar chart of per-tool success vs failure counts. Sorted by
// failure count descending so the most error-prone tools surface first
// (the backend already sorts the response).
//
// Solid colors only — green for success, red for failure.
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
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { buildToolsUrl, type ToolsChartData } from "./use-tool-chart-data";

interface ToolErrorRateProps {
  /** Tree breakdown mode. Defaults to `all`. */
  breakdown?: "all" | "parent";
}

const SUCCESS_COLOR = "#22c55e"; // green-500
const FAILURE_COLOR = "#ef4444"; // red-500

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  payload: { tool: string; success: number; failure: number };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const total = row.success + row.failure;
  const failureRate = total > 0 ? ((row.failure / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="font-medium">{label}</div>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SUCCESS_COLOR }} />
          <span className="text-muted-foreground">Success:</span>
          <span className="font-mono">{row.success.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FAILURE_COLOR }} />
          <span className="text-muted-foreground">Failure:</span>
          <span className="font-mono">{row.failure.toLocaleString()}</span>
        </div>
        <div className="text-muted-foreground pt-0.5">
          Failure rate: <span className="font-mono">{failureRate}%</span>
        </div>
      </div>
    </div>
  );
}

export function ToolErrorRate({ breakdown = "all" }: ToolErrorRateProps) {
  const filters = useChartFilters();
  // Hits /api/charts/tools with the global filters + breakdown=… param.
  const url = buildToolsUrl(filters, breakdown);
  const { data, isLoading, error } = useQuery<ToolsChartData>({
    queryKey: [url],
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => {
    if (!data?.errors) return [];
    // Backend pre-sorts by failure desc; defensive resort.
    return data.errors.slice().sort((a, b) => b.failure - a.failure);
  }, [data]);

  if (isLoading) {
    return <div className="h-[260px] w-full animate-pulse rounded bg-muted/30" />;
  }
  if (error) {
    return (
      <div className="flex h-[260px] items-center justify-center text-xs text-destructive">
        Failed to load tool error rates
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
      <BarChart data={rows} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="tool" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="success" name="Success" fill={SUCCESS_COLOR} radius={[2, 2, 0, 0]} />
        <Bar dataKey="failure" name="Failure" fill={FAILURE_COLOR} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ToolErrorRate;
