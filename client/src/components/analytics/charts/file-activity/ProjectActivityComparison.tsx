// client/src/components/analytics/charts/file-activity/ProjectActivityComparison.tsx
//
// Per-project comparison: sessions, cost (tree-inclusive), tokens. Backed by
// /api/analytics/costs/value (the `byProject` array). We deliberately use
// this tree-backed endpoint instead of the flat charts-activity projects
// block because costs/value walks SessionTree.totals — its numbers include
// subagent spend and therefore match the Costs tab and the kanban board
// exactly. The flat alternative would undercount any project whose
// sessions dispatched subagents.
//
// The /api/analytics/costs/value endpoint only honours ?days, so the
// global project / model filters are applied client-side after the fetch.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { formatTokens, formatUsd } from "@/lib/format";

interface ProjectRow {
  project: string;
  sessions: number;
  tokens: number;
  avgDepth: number;
  cost: number;
}

interface CostsValueResponse {
  byProject: ProjectRow[];
  // ... other fields not used here
}

const COLOR_SESSIONS = "#3b82f6"; // blue
const COLOR_COST = "#22c55e"; // green
const COLOR_TOKENS = "#a78bfa"; // violet

function rangeToDays(range: string): string {
  // /api/analytics/costs/value only accepts 7|30|90 — clamp accordingly.
  if (range === "7d") return "7";
  if (range === "30d") return "30";
  if (range === "90d") return "90";
  // 90 is the longest available; use it for "all" / "custom".
  return "90";
}


function shortenProject(name: string, max = 22): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

function ProjectTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: ProjectRow & { label: string } }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover p-2 text-xs shadow-md">
      <div className="font-mono text-foreground mb-1 break-all">{d.project}</div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Sessions</span>
          <span className="font-mono" style={{ color: COLOR_SESSIONS }}>{d.sessions}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Cost</span>
          <span className="font-mono" style={{ color: COLOR_COST }}>{formatUsd(d.cost)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Tokens</span>
          <span className="font-mono" style={{ color: COLOR_TOKENS }}>{formatTokens(d.tokens)}</span>
        </div>
        {void label}
      </div>
    </div>
  );
}

export function ProjectActivityComparison() {
  const filters = useChartFilters();

  const url = `/api/analytics/costs/value?days=${rangeToDays(filters.range)}`;
  const { data, isLoading, error } = useQuery<CostsValueResponse>({
    queryKey: [url],
  });

  const rows = useMemo(() => {
    const all = data?.byProject || [];
    // Apply global project filter client-side. Empty array means "all".
    const filtered = filters.projects.length > 0
      ? all.filter(p => filters.projects.includes(p.project))
      : all;
    // Sort by cost descending and cap to top 12 so the bars stay readable.
    return filtered
      .slice()
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 12)
      .map(r => ({
        ...r,
        // Normalize tokens & cost into the same visual range so all three
        // grouped bars are legible. We render cost in cents and tokens in
        // thousands; the tooltip shows the raw values.
        sessions: r.sessions,
        costCents: Math.round(r.cost * 100),
        tokensK: Math.round(r.tokens / 1000),
        label: shortenProject(r.project),
      }));
  }, [data, filters.projects]);

  if (isLoading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        Loading project comparison...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-destructive">
        Failed to load project comparison
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground text-right">
        cost shown in cents · tokens in thousands · hover for raw values
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 12, bottom: 36, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={48}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<ProjectTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="square"
              formatter={(v: string) => <span className="text-muted-foreground">{v}</span>}
            />
            <Bar dataKey="sessions" name="Sessions" fill={COLOR_SESSIONS} />
            <Bar dataKey="costCents" name="Cost (¢)" fill={COLOR_COST} />
            <Bar dataKey="tokensK" name="Tokens (K)" fill={COLOR_TOKENS} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ProjectActivityComparison;
