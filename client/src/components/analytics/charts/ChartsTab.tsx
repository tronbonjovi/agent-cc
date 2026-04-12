// client/src/components/analytics/charts/ChartsTab.tsx
//
// Top-level layout container for the Charts tab. Renders the
// GlobalFilterBar at the top followed by five thematic sections, each with
// a responsive grid of ChartCard placeholders. Tasks 003-007 will replace
// the placeholders with real chart implementations.
//
// All children are wrapped in <ChartFiltersProvider> so any chart can call
// useChartFilters() without prop drilling — there will be ~20 consumers.
import { ChartFiltersProvider, GlobalFilterBar } from "./GlobalFilterBar";
import { ChartCard } from "./ChartCard";
import {
  Coins,
  LineChart as LineChartIcon,
  Wrench,
  FolderTree,
  Activity,
} from "lucide-react";

interface ChartSection {
  id: string;
  title: string;
  description: string;
  /** Number of placeholder cards to render until tasks 003-007 fill them in. */
  placeholderCount: number;
  icon: React.ElementType;
}

const SECTIONS: ChartSection[] = [
  {
    id: "token-economics",
    title: "Token Economics",
    description: "Spend, token mix, and cost trends across projects and models.",
    placeholderCount: 4,
    icon: Coins,
  },
  {
    id: "session-patterns",
    title: "Session Patterns",
    description: "Frequency, duration, and shape of your sessions over time.",
    placeholderCount: 4,
    icon: LineChartIcon,
  },
  {
    id: "tool-usage",
    title: "Tool Usage",
    description: "Which tools fire most, success rates, and per-tool spend.",
    placeholderCount: 4,
    icon: Wrench,
  },
  {
    id: "file-codebase",
    title: "File & Codebase",
    description: "Files touched, hot paths, and repo coverage.",
    placeholderCount: 4,
    icon: FolderTree,
  },
  {
    id: "activity-workflow",
    title: "Activity & Workflow",
    description: "Task throughput, milestone progress, and daily activity.",
    placeholderCount: 4,
    icon: Activity,
  },
];

function PlaceholderChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
      Chart coming soon
    </div>
  );
}

export function ChartsTab() {
  // NOTE: availableProjects / availableModels will be wired from real data
  // in a future task. Passing empty arrays keeps the dropdowns in their
  // "no projects available" empty state for now.
  return (
    <ChartFiltersProvider>
      <div className="space-y-6">
        <GlobalFilterBar availableProjects={[]} availableModels={[]} />

        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <section key={section.id} aria-labelledby={`section-${section.id}`}>
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3
                  id={`section-${section.id}`}
                  className="text-sm font-semibold tracking-wide uppercase text-muted-foreground"
                >
                  {section.title}
                </h3>
                <span className="text-xs text-muted-foreground/60 truncate">
                  — {section.description}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: section.placeholderCount }).map((_, i) => (
                  <ChartCard
                    key={`${section.id}-placeholder-${i}`}
                    title={`${section.title} chart ${i + 1}`}
                    loading={false}
                  >
                    <PlaceholderChart />
                  </ChartCard>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ChartFiltersProvider>
  );
}

export default ChartsTab;
