// client/src/lib/milestone-colors.ts

/**
 * Curated palette of 10 colors that are visually distinct on dark backgrounds.
 * Used for milestone color grouping on the board.
 */
export const MILESTONE_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
];

/**
 * Simple string hash that produces a stable, positive integer.
 * Used to deterministically map milestone IDs to palette indices.
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a deterministic color for a given milestone ID.
 * Same ID always returns the same color across reloads.
 * Falls back to first palette color for null/undefined/empty inputs.
 */
export function getMilestoneColor(
  milestoneId: string | null | undefined,
  palette: string[] = MILESTONE_PALETTE,
): string {
  if (!milestoneId || palette.length === 0) {
    return palette.length > 0 ? palette[0] : "#6b7280";
  }
  return palette[stableHash(milestoneId) % palette.length];
}
