// client/src/components/analytics/charts/tool-usage/ToolDurationDistribution.tsx
//
// Placeholder for the per-tool duration distribution chart.
//
// TODO(charts-enrichment): The /api/charts/tools endpoint does not yet
// return per-tool duration data. Once the backend exposes a `durations`
// field (e.g. min/p50/p95/max ms per tool, or raw samples for a
// boxplot), wire this component up to render a BarChart or simplified
// boxplot using the same shared toolColors palette as the other tool
// charts. Until then, render an explicit empty state so the section
// layout stays consistent and users know data is pending.
//
// Backend edits this phase belong to task007 — do NOT modify
// chart-analytics.ts from this file's task (task005).
import { Clock } from "lucide-react";

interface ToolDurationDistributionProps {
  /** Tree breakdown mode. Defaults to `all`. Plumbed for future use. */
  breakdown?: "all" | "parent";
}

export function ToolDurationDistribution({
  breakdown = "all",
}: ToolDurationDistributionProps = {}) {
  // breakdown is intentionally ignored until the backend ships duration data.
  // Keeping the prop in the signature so the wiring task can drop in a
  // working implementation without changing the call site.
  void breakdown;
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
      <Clock className="h-6 w-6 text-muted-foreground/60" />
      <div className="text-xs text-muted-foreground max-w-[260px]">
        Duration data not yet available — backend enhancement pending.
      </div>
    </div>
  );
}

export default ToolDurationDistribution;
