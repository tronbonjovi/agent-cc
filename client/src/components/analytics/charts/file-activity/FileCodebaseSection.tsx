// client/src/components/analytics/charts/file-activity/FileCodebaseSection.tsx
//
// File & Codebase section of the Charts tab — wraps FileHeatmapExtended
// and FileChurnRate in ChartCard containers laid out on the same
// responsive grid the other sections use.
import { ChartCard } from "../ChartCard";
import { FileHeatmapExtended } from "./FileHeatmapExtended";
import { FileChurnRate } from "./FileChurnRate";
import { FolderTree, Activity } from "lucide-react";

export function FileCodebaseSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <ChartCard
        title="File heatmap"
        icon={<FolderTree className="h-4 w-4" />}
        className="md:col-span-2 lg:col-span-2"
      >
        <FileHeatmapExtended />
      </ChartCard>
      <ChartCard
        title="File churn rate"
        icon={<Activity className="h-4 w-4" />}
      >
        <FileChurnRate />
      </ChartCard>
    </div>
  );
}

export default FileCodebaseSection;
