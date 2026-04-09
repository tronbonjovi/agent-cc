// client/src/components/board/board-filters.tsx

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, X } from "lucide-react";
import type { BoardFilter, MilestoneMeta } from "@shared/board-types";

interface BoardFiltersProps {
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  milestones: MilestoneMeta[];
}

export function BoardFilters({ filter, onFilterChange, milestones }: BoardFiltersProps) {
  const hasFilters = !!(
    filter.milestones?.length ||
    filter.priorities?.length || filter.columns?.length ||
    filter.assignee || filter.flagged !== undefined
  );

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
