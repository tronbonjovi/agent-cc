// client/src/components/analytics/charts/session-patterns/SessionPatternsSection.tsx
//
// Top-level wrapper that renders all five Session Patterns charts in the
// responsive grid the ChartsTab uses for every section. ChartsTab.tsx will
// import this in a later wiring pass (after sibling tasks 003/005/006/007
// land their own sections), at which point the placeholder cards in
// ChartsTab's "Session Patterns" section get swapped out for this component.
import { SessionFrequency } from "./SessionFrequency";
import { SessionDepthDistribution } from "./SessionDepthDistribution";
import { SessionDurationDistribution } from "./SessionDurationDistribution";
import { SessionHealthOverTime } from "./SessionHealthOverTime";
import { StopReasonDistribution } from "./StopReasonDistribution";

export function SessionPatternsSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SessionFrequency />
      <SessionDepthDistribution />
      <SessionDurationDistribution />
      <SessionHealthOverTime />
      <StopReasonDistribution />
    </div>
  );
}

export default SessionPatternsSection;
