// Minimal client-side pipeline types (mirrors server types needed by UI)
export interface MilestoneRun {
  id: string;
  milestoneTaskId: string;
  projectId: string;
  status: string;
  totalCostUsd: number;
  pauseReason?: string;
}
