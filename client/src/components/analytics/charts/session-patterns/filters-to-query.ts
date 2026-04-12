// client/src/components/analytics/charts/session-patterns/filters-to-query.ts
//
// Translates a ChartFilters value (from useChartFilters) into the query
// string the /api/charts/* endpoints expect:
//   ?days=7|30|90|all & projects=a,b & models=x,y
//
// The backend currently supports days=7|30|90|all only — "custom" date ranges
// fall back to days=all so the chart still renders something rather than
// breaking. A future task can teach the backend to honor explicit date ranges.
//
// Lives inside session-patterns/ so this task004 owns the file outright;
// other tasks (003, 005, 006, 007) may inline equivalent helpers in their
// own subdirectories. A later refactor can hoist this to charts/ if every
// section ends up duplicating it.
import type { ChartFilters } from "../GlobalFilterBar";

export function filtersToQueryString(filters: ChartFilters): string {
  const params = new URLSearchParams();
  if (filters.range === "custom") {
    // Backend has no custom-range support yet — fall back to "all" so the
    // chart still renders. (TODO: charts-enrichment future task — add
    // ?start=&end= support to /api/charts/*.)
    params.set("days", "all");
  } else {
    params.set("days", filters.range);
  }
  if (filters.projects.length > 0) {
    params.set("projects", filters.projects.join(","));
  }
  if (filters.models.length > 0) {
    params.set("models", filters.models.join(","));
  }
  return params.toString();
}
