// client/src/components/analytics/charts/token-economics/APIEquivalentValue.tsx
//
// "What would this usage cost at full API rates?" — derives an API-equivalent
// dollar figure per week (or month for longer ranges) by combining the
// per-day per-model token totals from /api/charts/models with the canonical
// pricing table from shared/pricing.ts. The client uses only the input/output
// fields (it doesn't have a clean per-model cache split available at this
// endpoint) and a rough 70/30 input/output token ratio, which makes this a
// deliberately approximate view — the header label makes that explicit.
//
// Bars are stacked by model and rendered weekly for ranges <= 90 days,
// monthly for "all".
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartFilters } from "../GlobalFilterBar";
import { formatUsd } from "@/lib/format";
import { MODEL_PRICING } from "@shared/pricing";

export interface APIEquivalentValueProps {
  breakdown?: "all" | "parent";
}

interface ModelRow {
  date: string;
  [model: string]: string | number;
}

// Derived from the shared MODEL_PRICING record: the chart only needs the
// input/output rates, so we project those fields into a lookup array that
// preserves insertion order (version-specific keys before family keys so
// "opus-4-6" is matched before "opus").
interface ModelPrice {
  input: number;
  output: number;
}
const PRICING: Array<{ key: string; price: ModelPrice }> = Object.entries(
  MODEL_PRICING,
).map(([key, pricing]) => ({
  key,
  price: { input: pricing.input, output: pricing.output },
}));
const DEFAULT_PRICE: ModelPrice = {
  input: MODEL_PRICING.sonnet.input,
  output: MODEL_PRICING.sonnet.output,
};

function priceForModel(model: string): ModelPrice {
  const lower = model.toLowerCase();
  for (const entry of PRICING) {
    if (lower.includes(entry.key)) return entry.price;
  }
  return DEFAULT_PRICE;
}

// /api/charts/models gives us per-day [input + output] tokens summed per
// model. We don't have a clean input/output split per model from that
// endpoint, so we approximate the API value with a 70/30 input/output ratio
// — close enough for a "rough cost equivalent" view. The user-facing label
// makes the approximation explicit.
const INPUT_RATIO = 0.7;
const OUTPUT_RATIO = 0.3;

function estimateModelCost(model: string, totalTokens: number): number {
  const p = priceForModel(model);
  const input = totalTokens * INPUT_RATIO;
  const output = totalTokens * OUTPUT_RATIO;
  return (input * p.input + output * p.output) / 1_000_000;
}


// Builds the query string for /api/charts/models including the section
// breakdown toggle as `breakdown=parent|all`.
function buildQuery(
  range: string,
  projects: string[],
  models: string[],
  breakdown: "all" | "parent",
): string {
  const params = new URLSearchParams();
  if (range !== "all") params.set("days", range.replace("d", ""));
  else params.set("days", "all");
  if (projects.length > 0) params.set("projects", projects.join(","));
  if (models.length > 0) params.set("models", models.join(","));
  params.set("breakdown", breakdown);
  return params.toString();
}

// Same palette as ModelDistribution so models keep consistent colors.
const MODEL_PALETTE = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
];

function colorForModel(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) {
    hash = (hash + model.charCodeAt(i)) >>> 0;
  }
  return MODEL_PALETTE[hash % MODEL_PALETTE.length];
}

// ---- Bucketing helpers ----

function isoWeek(dateStr: string): string {
  // Returns "YYYY-Www" — Monday-anchored ISO week. Falls back to dateStr on
  // parse failure so we never crash the chart.
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // Mon=0
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((tmp.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function isoMonth(dateStr: string): string {
  // "YYYY-MM" — falls back to dateStr on parse failure.
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface TooltipPayloadEntry {
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
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);
  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground truncate max-w-[160px]">
              {p.name}
            </span>
          </div>
          <span className="font-mono">{formatUsd(p.value)}</span>
        </div>
      ))}
      <div className="mt-1 pt-1 border-t border-border flex justify-between gap-3">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono">{formatUsd(total)}</span>
      </div>
    </div>
  );
}

export function APIEquivalentValue({ breakdown = "all" }: APIEquivalentValueProps) {
  const filters = useChartFilters();

  const queryString = useMemo(
    () => buildQuery(filters.range, filters.projects, filters.models, breakdown),
    [filters.range, filters.projects, filters.models, breakdown],
  );

  const { data, isLoading, error } = useQuery<ModelRow[]>({
    queryKey: [`/api/charts/models?${queryString}`],
    staleTime: 60 * 1000,
  });

  // Bucket weekly for short ranges, monthly for "all".
  const useMonthly = filters.range === "all";

  const { rows, modelKeys } = useMemo(() => {
    if (!data) return { rows: [] as Array<Record<string, string | number>>, modelKeys: [] as string[] };
    const modelSet = new Set<string>();
    const buckets = new Map<string, Record<string, number>>();
    for (const row of data) {
      const date = String(row.date || "");
      if (!date) continue;
      const bucketKey = useMonthly ? isoMonth(date) : isoWeek(date);
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {};
        buckets.set(bucketKey, bucket);
      }
      for (const [k, v] of Object.entries(row)) {
        if (k === "date") continue;
        modelSet.add(k);
        const tokens = typeof v === "number" ? v : 0;
        bucket[k] = (bucket[k] || 0) + estimateModelCost(k, tokens);
      }
    }
    const sortedKeys = Array.from(buckets.keys()).sort();
    const out: Array<Record<string, string | number>> = sortedKeys.map(period => ({
      period,
      ...buckets.get(period)!,
    }));
    return { rows: out, modelKeys: Array.from(modelSet).sort() };
  }, [data, useMonthly]);

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
        Failed to load API-equivalent value
      </div>
    );
  }
  if (rows.length === 0 || modelKeys.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
        No data in selected range
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-muted-foreground/70 text-right">
        Approximate — assumes ~70/30 input/output split
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="#71717a" />
            <YAxis
              tick={{ fontSize: 10 }}
              stroke="#71717a"
              tickFormatter={formatUsd}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {modelKeys.map(model => (
              <Bar
                key={model}
                dataKey={model}
                name={model}
                stackId="value"
                fill={colorForModel(model)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default APIEquivalentValue;
