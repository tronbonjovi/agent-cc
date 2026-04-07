// client/src/components/board/board-filters.tsx

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, X } from "lucide-react";
import type { BoardFilter, ProjectMeta, MilestoneMeta } from "@shared/board-types";

interface BoardFiltersProps {
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  projects: ProjectMeta[];
  milestones: MilestoneMeta[];
}

export function BoardFilters({ filter, onFilterChange, projects, milestones }: BoardFiltersProps) {
  const hasFilters = !!(
    filter.projects?.length || filter.milestones?.length ||
    filter.priorities?.length || filter.columns?.length ||
    filter.assignee || filter.flagged !== undefined
  );

  function toggleProject(id: string) {
    const current = filter.projects || [];
    const next = current.includes(id)
      ? current.filter(p => p !== id)
      : [...current, id];
    onFilterChange({ ...filter, projects: next.length ? next : undefined });
  }

  function togglePriority(p: string) {
    const current = filter.priorities || [];
    const next = current.includes(p)
      ? current.filter(x => x !== p)
      : [...current, p];
    onFilterChange({ ...filter, priorities: next.length ? next : undefined });
  }

  function clearFilters() {
    onFilterChange({});
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />

      {/* Project filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Project {filter.projects?.length ? `(${filter.projects.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {projects.map(p => (
            <DropdownMenuCheckboxItem
              key={p.id}
              checked={filter.projects?.includes(p.id)}
              onCheckedChange={() => toggleProject(p.id)}
            >
              <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: p.color }} />
              {p.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Priority {filter.priorities?.length ? `(${filter.priorities.length})` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {["high", "medium", "low"].map(p => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={filter.priorities?.includes(p)}
              onCheckedChange={() => togglePriority(p)}
            >
              {p}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Flagged toggle */}
      <Button
        variant={filter.flagged ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onFilterChange({
          ...filter,
          flagged: filter.flagged === undefined ? true : undefined,
        })}
      >
        Flagged
      </Button>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
