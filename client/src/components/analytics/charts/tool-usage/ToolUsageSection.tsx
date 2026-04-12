// client/src/components/analytics/charts/tool-usage/ToolUsageSection.tsx
//
// Top-level wrapper for the Tool Usage section of the Charts tab.
// Renders all four tool charts inside ChartCards in the same responsive
// grid layout used by the rest of ChartsTab. A later wiring task will
// swap the placeholder cards in ChartsTab.tsx for this section.
import { Hammer, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { ChartCard } from "../ChartCard";
import { ToolFrequency } from "./ToolFrequency";
import { ToolErrorRate } from "./ToolErrorRate";
import { ToolDurationDistribution } from "./ToolDurationDistribution";
import { ToolUsageOverTime } from "./ToolUsageOverTime";

export function ToolUsageSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <ChartCard title="Tool Frequency" icon={<Hammer className="h-4 w-4" />}>
        <ToolFrequency />
      </ChartCard>
      <ChartCard title="Tool Error Rate" icon={<AlertTriangle className="h-4 w-4" />}>
        <ToolErrorRate />
      </ChartCard>
      <ChartCard title="Tool Duration" icon={<Clock className="h-4 w-4" />}>
        <ToolDurationDistribution />
      </ChartCard>
      <ChartCard
        title="Tool Usage Over Time"
        icon={<TrendingUp className="h-4 w-4" />}
        className="md:col-span-2 lg:col-span-3"
      >
        <ToolUsageOverTime />
      </ChartCard>
    </div>
  );
}

export default ToolUsageSection;
