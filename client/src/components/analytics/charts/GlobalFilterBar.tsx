// client/src/components/analytics/charts/GlobalFilterBar.tsx
//
// Global filter bar for the Charts tab. Three controls:
//   - time range (7d / 30d / 90d / all / custom)
//   - project multi-select
//   - model multi-select
//
// Filter state lives in a React context so the ~20 charts under ChartsTab
// can subscribe via `useChartFilters()` without prop drilling. The provider
// is the source of truth and also mirrors state into URL search params
// (`?range=30d&projects=foo,bar&models=opus`) using history.replaceState
// so the filter selections survive reloads and share-link copies without
// triggering a wouter route change.
//
// NOTE: availableProjects / availableModels are accepted as props for now.
// A future task will wire real values from the analytics endpoints.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, Filter, X } from "lucide-react";

// ---- Types ----

export type ChartTimeRange = "7d" | "30d" | "90d" | "all" | "custom";

export interface ChartFilters {
  range: ChartTimeRange;
  /** Custom range start (ISO date YYYY-MM-DD). Only meaningful when range === "custom". */
  customStart: string | null;
  customEnd: string | null;
  /** Empty array means "all projects" / "all models". */
  projects: string[];
  models: string[];
}

export interface ChartFiltersContextValue extends ChartFilters {
  setRange: (r: ChartTimeRange) => void;
  setCustomRange: (start: string | null, end: string | null) => void;
  setProjects: (p: string[]) => void;
  toggleProject: (p: string) => void;
  setModels: (m: string[]) => void;
  toggleModel: (m: string) => void;
  clearAll: () => void;
}

// ---- Defaults & URL parsing ----

const DEFAULT_FILTERS: ChartFilters = {
  range: "30d",
  customStart: null,
  customEnd: null,
  projects: [],
  models: [],
};

const VALID_RANGES: ChartTimeRange[] = ["7d", "30d", "90d", "all", "custom"];

function readFiltersFromUrl(): ChartFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  const rangeParam = params.get("range") as ChartTimeRange | null;
  const range: ChartTimeRange =
    rangeParam && VALID_RANGES.includes(rangeParam) ? rangeParam : DEFAULT_FILTERS.range;
  const projectsParam = params.get("projects");
  const modelsParam = params.get("models");
  return {
    range,
    customStart: params.get("rangeStart"),
    customEnd: params.get("rangeEnd"),
    projects: projectsParam ? projectsParam.split(",").filter(Boolean) : [],
    models: modelsParam ? modelsParam.split(",").filter(Boolean) : [],
  };
}

function writeFiltersToUrl(f: ChartFilters): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (f.range === DEFAULT_FILTERS.range) params.delete("range");
  else params.set("range", f.range);

  if (f.range === "custom" && f.customStart) params.set("rangeStart", f.customStart);
  else params.delete("rangeStart");
  if (f.range === "custom" && f.customEnd) params.set("rangeEnd", f.customEnd);
  else params.delete("rangeEnd");

  if (f.projects.length > 0) params.set("projects", f.projects.join(","));
  else params.delete("projects");

  if (f.models.length > 0) params.set("models", f.models.join(","));
  else params.delete("models");

  const qs = params.toString();
  const newUrl = qs
    ? `${window.location.pathname}?${qs}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, "", newUrl);
}

// ---- Context ----

const ChartFiltersContext = createContext<ChartFiltersContextValue | null>(null);

export function ChartFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ChartFilters>(() => readFiltersFromUrl());

  // Mirror state into URL whenever it changes.
  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);

  const setRange = useCallback((range: ChartTimeRange) => {
    setFilters(prev => ({ ...prev, range }));
  }, []);

  const setCustomRange = useCallback((customStart: string | null, customEnd: string | null) => {
    setFilters(prev => ({ ...prev, range: "custom", customStart, customEnd }));
  }, []);

  const setProjects = useCallback((projects: string[]) => {
    setFilters(prev => ({ ...prev, projects }));
  }, []);

  const toggleProject = useCallback((p: string) => {
    setFilters(prev => ({
      ...prev,
      projects: prev.projects.includes(p)
        ? prev.projects.filter(x => x !== p)
        : [...prev.projects, p],
    }));
  }, []);

  const setModels = useCallback((models: string[]) => {
    setFilters(prev => ({ ...prev, models }));
  }, []);

  const toggleModel = useCallback((m: string) => {
    setFilters(prev => ({
      ...prev,
      models: prev.models.includes(m)
        ? prev.models.filter(x => x !== m)
        : [...prev.models, m],
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const value = useMemo<ChartFiltersContextValue>(
    () => ({
      ...filters,
      setRange,
      setCustomRange,
      setProjects,
      toggleProject,
      setModels,
      toggleModel,
      clearAll,
    }),
    [filters, setRange, setCustomRange, setProjects, toggleProject, setModels, toggleModel, clearAll],
  );

  return (
    <ChartFiltersContext.Provider value={value}>{children}</ChartFiltersContext.Provider>
  );
}

export function useChartFilters(): ChartFiltersContextValue {
  const ctx = useContext(ChartFiltersContext);
  if (!ctx) {
    throw new Error(
      "useChartFilters must be used inside <ChartFiltersProvider> (typically rendered by <ChartsTab>).",
    );
  }
  return ctx;
}

// ---- UI: GlobalFilterBar ----

interface GlobalFilterBarProps {
  /** Available project keys to populate the project filter dropdown. */
  availableProjects?: string[];
  /** Available model identifiers to populate the model filter dropdown. */
  availableModels?: string[];
}

const RANGE_BUTTONS: Array<{ value: ChartTimeRange; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

export function GlobalFilterBar({
  availableProjects = [],
  availableModels = [],
}: GlobalFilterBarProps) {
  const filters = useChartFilters();
  const [showCustom, setShowCustom] = useState(filters.range === "custom");

  const projectCount = filters.projects.length;
  const modelCount = filters.models.length;
  const hasActiveFilter =
    filters.range !== "30d" || projectCount > 0 || modelCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      {/* Time range */}
      <div className="flex items-center gap-1">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {RANGE_BUTTONS.map(r => (
          <Button
            key={r.value}
            variant={filters.range === r.value ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              filters.setRange(r.value);
              setShowCustom(false);
            }}
          >
            {r.label}
          </Button>
        ))}
        <Button
          variant={filters.range === "custom" ? "default" : "outline"}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => setShowCustom(s => !s)}
        >
          Custom
        </Button>
      </div>

      {/* Custom date pickers */}
      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            value={filters.customStart ?? ""}
            onChange={e =>
              filters.setCustomRange(e.target.value || null, filters.customEnd)
            }
            aria-label="Custom range start"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            value={filters.customEnd ?? ""}
            onChange={e =>
              filters.setCustomRange(filters.customStart, e.target.value || null)
            }
            aria-label="Custom range end"
          />
        </div>
      )}

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Project multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
            <Filter className="h-3 w-3" />
            Projects
            {projectCount > 0 && (
              <span className="rounded-sm bg-primary/15 px-1 text-[10px] font-mono">
                {projectCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Filter by project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableProjects.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects available</div>
          ) : (
            availableProjects.map(p => (
              <DropdownMenuCheckboxItem
                key={p}
                checked={filters.projects.includes(p)}
                onCheckedChange={() => filters.toggleProject(p)}
                onSelect={e => e.preventDefault()}
                className="text-xs"
              >
                {p}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Model multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
            <Filter className="h-3 w-3" />
            Models
            {modelCount > 0 && (
              <span className="rounded-sm bg-primary/15 px-1 text-[10px] font-mono">
                {modelCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Filter by model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableModels.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No models available</div>
          ) : (
            availableModels.map(m => (
              <DropdownMenuCheckboxItem
                key={m}
                checked={filters.models.includes(m)}
                onCheckedChange={() => filters.toggleModel(m)}
                onSelect={e => e.preventDefault()}
                className="text-xs"
              >
                {m}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear all */}
      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground gap-1"
          onClick={() => {
            filters.clearAll();
            setShowCustom(false);
          }}
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
