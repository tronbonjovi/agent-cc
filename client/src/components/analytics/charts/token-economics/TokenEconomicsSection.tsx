// client/src/components/analytics/charts/token-economics/TokenEconomicsSection.tsx
//
// Top-level container for the Token Economics section of the Charts tab.
// Renders all 5 token-economics charts in a 3-column responsive grid and
// owns the section-level "Parent only / Include subagents" toggle that
// flips the breakdown query param on the four tree-aware charts.
//
// Note: TokenDestinationBreakdown does NOT consume the breakdown toggle —
// the anatomy endpoint is computed at a different layer and stays the same
// regardless of subagent inclusion.
import { useState } from "react";
import { ChartCard } from "../ChartCard";
import { Button } from "@/components/ui/button";
import { Coins, LineChart, PieChart, BarChart3, DollarSign } from "lucide-react";
import { TokenUsageOverTime } from "./TokenUsageOverTime";
import { CacheEfficiencyOverTime } from "./CacheEfficiencyOverTime";
import { TokenDestinationBreakdown } from "./TokenDestinationBreakdown";
import { ModelDistribution } from "./ModelDistribution";
import { APIEquivalentValue } from "./APIEquivalentValue";

export function TokenEconomicsSection() {
  // Default = include subagents ("all") so totals match the rest of the app.
  const [breakdown, setBreakdown] = useState<"all" | "parent">("all");

  return (
    <div className="space-y-3">
      {/* Section-level breakdown toggle */}
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-muted-foreground mr-1">View:</span>
        <Button
          variant={breakdown === "all" ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setBreakdown("all")}
        >
          Include subagents
        </Button>
        <Button
          variant={breakdown === "parent" ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setBreakdown("parent")}
        >
          Parent only
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ChartCard title="Token Usage Over Time" icon={<Coins className="h-4 w-4" />}>
          <TokenUsageOverTime breakdown={breakdown} />
        </ChartCard>

        <ChartCard
          title="Cache Efficiency Over Time"
          icon={<LineChart className="h-4 w-4" />}
        >
          <CacheEfficiencyOverTime breakdown={breakdown} />
        </ChartCard>

        <ChartCard
          title="Token Destination Breakdown"
          icon={<PieChart className="h-4 w-4" />}
        >
          <TokenDestinationBreakdown />
        </ChartCard>

        <ChartCard
          title="Model Distribution"
          icon={<BarChart3 className="h-4 w-4" />}
        >
          <ModelDistribution breakdown={breakdown} />
        </ChartCard>

        <ChartCard
          title="API-Equivalent Value"
          icon={<DollarSign className="h-4 w-4" />}
        >
          <APIEquivalentValue breakdown={breakdown} />
        </ChartCard>
      </div>
    </div>
  );
}

export default TokenEconomicsSection;
