import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

/** Health filter values. Exported for testing. */
export const HEALTH_FILTERS = ["good", "fair", "poor"] as const;
export type HealthFilter = typeof HEALTH_FILTERS[number];

/** Status filter values. Exported for testing. */
export const STATUS_FILTERS = ["active", "inactive", "stale", "empty"] as const;
export type StatusFilter = typeof STATUS_FILTERS[number];

export interface SessionFilterState {
  search?: string;
  sort?: SortOption;
  health?: HealthFilter[];
  status?: StatusFilter[];
  project?: string;
  model?: string;
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
    filters.health?.length ? 1 : 0,
    filters.status?.length ? 1 : 0,
    filters.project ? 1 : 0,
    filters.model ? 1 : 0,
    filters.hasErrors ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const toggleHealth = (h: HealthFilter) => {
    const current = filters.health ?? [];
    const next = current.includes(h) ? current.filter(x => x !== h) : [...current, h];
    onChange({ ...filters, health: next.length ? next : undefined });
  };

  const toggleStatus = (s: StatusFilter) => {
    const current = filters.status ?? [];
    const next = current.includes(s) ? current.filter(x => x !== s) : [...current, s];
    onChange({ ...filters, status: next.length ? next : undefined });
  };

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

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">{sessionCount} sessions</span>

        {HEALTH_FILTERS.map(h => (
          <Badge
            key={h}
            variant={filters.health?.includes(h) ? "default" : "outline"}
            className="text-[10px] px-1.5 py-0 cursor-pointer select-none"
            onClick={() => toggleHealth(h)}
          >
            {h}
          </Badge>
        ))}

        {STATUS_FILTERS.map(s => (
          <Badge
            key={s}
            variant={filters.status?.includes(s) ? "default" : "outline"}
            className="text-[10px] px-1.5 py-0 cursor-pointer select-none"
            onClick={() => toggleStatus(s)}
          >
            {s}
          </Badge>
        ))}

        {filters.hasErrors && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 cursor-pointer select-none"
            onClick={() => onChange({ ...filters, hasErrors: undefined })}>
            errors
          </Badge>
        )}

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
