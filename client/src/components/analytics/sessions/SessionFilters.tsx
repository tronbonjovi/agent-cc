import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

/** Sort options for the session list. Exported for testing. */
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most-messages", label: "Most Messages" },
  { value: "highest-cost", label: "Highest Cost" },
  { value: "worst-health", label: "Worst Health" },
  { value: "longest", label: "Longest Duration" },
  { value: "largest", label: "Largest Size" },
] as const;

export type SortOption = typeof SORT_OPTIONS[number]["value"];

/** Legacy health filter values — retained for type compatibility. */
export const HEALTH_FILTERS = ["good", "fair", "poor"] as const;
export type HealthFilter = typeof HEALTH_FILTERS[number];

/** Legacy status filter values — retained for type compatibility. */
export const STATUS_FILTERS = ["active", "inactive", "stale", "empty"] as const;
export type StatusFilter = typeof STATUS_FILTERS[number];

export interface SessionFilterState {
  search?: string;
  sort?: SortOption;
  /** @deprecated Left pane no longer filters on health — cleanup is a follow-up. */
  health?: HealthFilter[];
  /** @deprecated Left pane no longer filters on status — cleanup is a follow-up. */
  status?: StatusFilter[];
  project?: string;
  model?: string;
  /** @deprecated Errors Only lives in the right-pane filter bar now — cleanup is a follow-up. */
  hasErrors?: boolean;
}

interface SessionFiltersProps {
  filters: SessionFilterState;
  onChange: (filters: SessionFilterState) => void;
  sessionCount: number;
  projects?: string[];
  models?: string[];
}

export function SessionFilters({ filters, onChange, sessionCount, projects, models }: SessionFiltersProps) {
  const activeFilterCount = [
    filters.project ? 1 : 0,
    filters.model ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearAll = () => onChange({ search: filters.search, sort: filters.sort });

  return (
    <div className="space-y-2 px-3 py-2 border-b border-border/40">
      {/* Search + Sort row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={filters.search ?? ""}
            onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
            className="pl-7 h-8 text-sm"
          />
        </div>
        <select
          value={filters.sort ?? "newest"}
          onChange={e => onChange({ ...filters, sort: e.target.value as SortOption })}
          className="h-8 text-xs bg-background border border-border rounded-md px-2"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Project + Model row */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">{sessionCount} sessions</span>

        {projects && projects.length > 0 && (
          <select
            value={filters.project ?? ""}
            onChange={e => onChange({ ...filters, project: e.target.value || undefined })}
            className="h-5 text-[10px] bg-background border border-border rounded px-1"
          >
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p.split("/").pop()}</option>)}
          </select>
        )}

        {models && models.length > 0 && (
          <select
            value={filters.model ?? ""}
            onChange={e => onChange({ ...filters, model: e.target.value || undefined })}
            className="h-5 text-[10px] bg-background border border-border rounded px-1"
          >
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {activeFilterCount > 0 && (
          <button onClick={clearAll} className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground ml-1">
            <X className="h-3 w-3" /> clear
          </button>
        )}
      </div>
    </div>
  );
}
