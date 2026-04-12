// client/src/components/analytics/charts/ChartsTab.tsx
//
// Top-level layout container for the Charts tab. Renders the
// GlobalFilterBar at the top followed by five thematic sections. Each
// section is a dedicated component (task003–task007) that owns its
// chart grid and any section-level controls (e.g. Token Economics'
// breakdown toggle).
//
// All children are wrapped in <ChartFiltersProvider> so any chart can
// call useChartFilters() without prop drilling.
import { ChartFiltersProvider, GlobalFilterBar } from "./GlobalFilterBar";
import { TokenEconomicsSection } from "./token-economics/TokenEconomicsSection";
import { SessionPatternsSection } from "./session-patterns/SessionPatternsSection";
import { ToolUsageSection } from "./tool-usage/ToolUsageSection";
import { FileCodebaseSection } from "./file-activity/FileCodebaseSection";
import { ActivityWorkflowSection } from "./file-activity/ActivityWorkflowSection";
import {
  Coins,
  LineChart as LineChartIcon,
  Wrench,
  FolderTree,
  Activity,
} from "lucide-react";

interface SectionShellProps {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

function SectionShell({ id, title, description, icon: Icon, children }: SectionShellProps) {
  return (
    <section aria-labelledby={`section-${id}`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3
          id={`section-${id}`}
          className="text-sm font-semibold tracking-wide uppercase text-muted-foreground"
        >
          {title}
        </h3>
        <span className="text-xs text-muted-foreground/60 truncate">
          — {description}
        </span>
      </div>
      {/* Responsive grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) lives
          inside each section component — ChartCard placement is section-owned. */}
      {children}
    </section>
  );
}

export function ChartsTab() {
  // NOTE: availableProjects / availableModels will be wired from real
  // data in a future task. Passing empty arrays keeps the dropdowns in
  // their "no projects available" empty state for now.
  return (
    <ChartFiltersProvider>
      <div className="space-y-6">
        <GlobalFilterBar availableProjects={[]} availableModels={[]} />

        <SectionShell
          id="token-economics"
          title="Token Economics"
          description="Spend, token mix, and cost trends across projects and models."
          icon={Coins}
        >
          <TokenEconomicsSection />
        </SectionShell>

        <SectionShell
          id="session-patterns"
          title="Session Patterns"
          description="Frequency, duration, and shape of your sessions over time."
          icon={LineChartIcon}
        >
          <SessionPatternsSection />
        </SectionShell>

        <SectionShell
          id="tool-usage"
          title="Tool Usage"
          description="Which tools fire most, success rates, and per-tool spend."
          icon={Wrench}
        >
          <ToolUsageSection />
        </SectionShell>

        <SectionShell
          id="file-codebase"
          title="File & Codebase"
          description="Files touched, hot paths, and repo coverage."
          icon={FolderTree}
        >
          <FileCodebaseSection />
        </SectionShell>

        <SectionShell
          id="activity-workflow"
          title="Activity & Workflow"
          description="Task throughput, milestone progress, and daily activity."
          icon={Activity}
        >
          <ActivityWorkflowSection />
        </SectionShell>
      </div>
    </ChartFiltersProvider>
  );
}

export default ChartsTab;
