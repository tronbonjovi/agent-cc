// client/src/components/analytics/charts/session-patterns/StopReasonDistribution.tsx
//
// Horizontal bar chart of assistant stop reasons (end_turn, max_tokens,
// tool_use, ...). Backend returns rows pre-sorted by count desc, but we
// re-sort defensively in case that contract changes.
//
// `max_tokens` gets a small note callout because it indicates the assistant
// hit the context window — that's a real signal worth surfacing.
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { AlertTriangle, StopCircle } from "lucide-react";
import { ChartCard } from "../ChartCard";
import { useChartFilters } from "../GlobalFilterBar";
import { filtersToQueryString } from "./filters-to-query";

interface StopReasonRow {
  reason: string;
  count: number;
}

const COLOR_NORMAL = "#6366f1"; // indigo-500
const COLOR_MAX_TOKENS = "#ef4444"; // red-500 — context pressure

interface TooltipPayloadItem {
  value: number;
  payload: StopReasonRow;
}

function StopReasonTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md space-y-1">
      <div className="font-medium text-popover-foreground">{row.reason}</div>
      <div className="text-muted-foreground">
        Count: <span className="font-mono text-foreground">{row.count}</span>
      </div>
      {row.reason === "max_tokens" && (
        <div className="text-[10px] text-red-400 mt-1">
          Context window limit hit
        </div>
      )}
    </div>
  );
}

export function StopReasonDistribution() {
  const filters = useChartFilters();
  const qs = filtersToQueryString(filters);
  const url = `/api/charts/stop-reasons${qs ? `?${qs}` : ""}`;
  const { data, isLoading } = useQuery<StopReasonRow[]>({ queryKey: [url] });

  const rows = (data ?? []).slice().sort((a, b) => b.count - a.count);
  const isEmpty = rows.length === 0;
  const hasMaxTokens = rows.some(r => r.reason === "max_tokens" && r.count > 0);

  return (
    <ChartCard title="Stop Reason Distribution" icon={<StopCircle className="h-4 w-4" />} loading={isLoading}>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No data in selected range
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="reason"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={90}
              />
              <Tooltip content={<StopReasonTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
              <Bar dataKey="count" name="Count">
                {rows.map((row, idx) => (
                  <Cell
                    key={`stop-${idx}`}
                    fill={row.reason === "max_tokens" ? COLOR_MAX_TOKENS : COLOR_NORMAL}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {hasMaxTokens && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3 w-3 mt-0.5 text-red-400 flex-shrink-0" />
              <span>
                <span className="text-red-400">max_tokens</span> means the
                assistant hit the context window — a sign of context pressure.
              </span>
            </div>
          )}
        </>
      )}
    </ChartCard>
  );
}

export default StopReasonDistribution;
