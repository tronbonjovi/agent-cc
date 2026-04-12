// client/src/components/analytics/charts/file-activity/ActivityWorkflowSection.tsx
//
// Activity & Workflow section of the Charts tab — wraps the activity
// timeline, project comparison, and sidechain usage charts in ChartCard
// containers on the standard responsive grid.
import { ChartCard } from "../ChartCard";
import { ActivityTimeline } from "./ActivityTimeline";
import { ProjectActivityComparison } from "./ProjectActivityComparison";
import { SidechainUsage } from "./SidechainUsage";
import { Activity, FolderTree, GitBranch } from "lucide-react";

export function ActivityWorkflowSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <ChartCard
        title="Activity timeline"
        icon={<Activity className="h-4 w-4" />}
      >
        <ActivityTimeline />
      </ChartCard>
      <ChartCard
        title="Project activity comparison"
        icon={<FolderTree className="h-4 w-4" />}
      >
        <ProjectActivityComparison />
      </ChartCard>
      <ChartCard
        title="Sidechain usage"
        icon={<GitBranch className="h-4 w-4" />}
      >
        <SidechainUsage />
      </ChartCard>
    </div>
  );
}

export default ActivityWorkflowSection;
