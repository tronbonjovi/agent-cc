// client/src/components/analytics/charts/tool-usage/use-tool-chart-data.ts
//
// Shared types and URL builder for the three tool charts that all hit
// /api/charts/tools (frequency, errors, overTime). Each chart component
// constructs the URL itself via buildToolsUrl(...) so the URL string
// (and the breakdown=/ days=/ projects=/ models= params) appear in the
// component source — that's what the source-text tests assert against.
import type { ChartFilters, ChartTimeRange } from "../GlobalFilterBar";

export interface ToolFrequencyRow {
  tool: string;
  count: number;
}

export interface ToolErrorRow {
  tool: string;
  success: number;
  failure: number;
}

export interface ToolOverTimeRow {
  date: string;
  // dynamic per-tool counts (numeric); also includes the date string
  [toolName: string]: string | number;
}

export interface ToolsChartData {
  frequency: ToolFrequencyRow[];
  errors: ToolErrorRow[];
  overTime: ToolOverTimeRow[];
}

/**
 * Map the GlobalFilterBar `range` enum onto the backend `days=` param.
 * "custom" falls through to "30" — we don't yet plumb custom date ranges
 * through chart-analytics; that's a follow-up.
 */
export function rangeToDays(range: ChartTimeRange): string {
  if (range === "all") return "all";
  if (range === "7d") return "7";
  if (range === "90d") return "90";
  // "30d" + "custom" both default to 30
  return "30";
}

/**
 * Build a query-string URL for /api/charts/tools from the global chart
 * filters and a tree breakdown mode. Returned URL is suitable for use
 * as a React Query queryKey (the default query function joins the key
 * with `/` — a single-element string array passes through unchanged).
 */
export function buildToolsUrl(
  filters: Pick<ChartFilters, "range" | "projects" | "models">,
  breakdown: "all" | "parent",
): string {
  const params = new URLSearchParams();
  params.set("days", rangeToDays(filters.range));
  if (filters.projects.length > 0) {
    params.set("projects", filters.projects.join(","));
  }
  if (filters.models.length > 0) {
    params.set("models", filters.models.join(","));
  }
  params.set("breakdown", breakdown);
  return `/api/charts/tools?${params.toString()}`;
}
