// client/src/components/analytics/charts/tool-usage/tool-colors.ts
//
// Shared solid-color palette for the Tool Usage chart section.
// Reused across ToolFrequency, ToolErrorRate, and ToolUsageOverTime so
// the same tool always renders in the same color across charts.
//
// Solid hex values only — no fade fills (enforced by new-user-safety).
// Tool names match the normalization in server/routes/chart-analytics.ts
// (`normalizeToolName`), which capitalizes the first letter so both
// "Read" and "read" land on the same key.

export const toolColors: Record<string, string> = {
  Read: "#3b82f6",   // blue
  Edit: "#22d3ee",   // cyan
  Write: "#a855f7",  // purple
  Bash: "#f59e0b",   // amber
  Grep: "#10b981",   // emerald
  Glob: "#14b8a6",   // teal
  Agent: "#f43f5e",  // rose
  Task: "#ec4899",   // pink (the legacy "Task" tool name pre-Agent)
};

/** Fallback color for any tool not explicitly listed in toolColors. */
export const FALLBACK_TOOL_COLOR = "#94a3b8"; // slate

/**
 * Resolve a color for a tool by name. Falls back to FALLBACK_TOOL_COLOR
 * for unknown tools so charts never crash on novel tool names.
 */
export function getToolColor(name: string): string {
  if (!name) return FALLBACK_TOOL_COLOR;
  return toolColors[name] ?? FALLBACK_TOOL_COLOR;
}
