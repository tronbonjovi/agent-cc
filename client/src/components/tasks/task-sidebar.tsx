import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ProjectEntity } from "@shared/types";
import type { TaskItem } from "@shared/task-types";

interface TaskSidebarProps {
  projects: ProjectEntity[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  items: TaskItem[];
  selectedParent: string | null;
  onSelectParent: (id: string | null) => void;
}

export function TaskSidebar({ projects, selectedProjectId, onSelectProject, items, selectedParent, onSelectParent }: TaskSidebarProps) {
  return (
    <aside className="w-56 border-r bg-sidebar flex flex-col">
      <div className="p-3 border-b">
        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Projects</div>
        <ScrollArea className="max-h-40">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelectProject(p.id); onSelectParent(null); }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                selectedProjectId === p.id
                  ? "bg-brand-1/15 text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </ScrollArea>
      </div>

      {selectedProjectId && items.length > 0 && (
        <div className="p-3 flex-1">
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-2">Hierarchy</div>
          <ScrollArea className="flex-1">
            <button
              onClick={() => onSelectParent(null)}
              className={cn(
                "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                selectedParent === null ? "bg-brand-1/10 font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50"
              )}
            >
              All Items
            </button>
            <HierarchyTree
              items={items}
              parentId={undefined}
              depth={0}
              selectedParent={selectedParent}
              onSelectParent={onSelectParent}
            />
          </ScrollArea>
        </div>
      )}
    </aside>
  );
}

function HierarchyTree({ items, parentId, depth, selectedParent, onSelectParent }: {
  items: TaskItem[];
  parentId: string | undefined;
  depth: number;
  selectedParent: string | null;
  onSelectParent: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const children = items.filter((i) => i.parent === parentId && i.type !== "task");

  if (children.length === 0) return null;

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {children.map((item) => {
        const hasChildren = items.some((i) => i.parent === item.id);
        const isExpanded = expanded.has(item.id);
        const isSelected = selectedParent === item.id;

        return (
          <div key={item.id}>
            <button
              onClick={() => {
                onSelectParent(item.id);
                if (hasChildren) {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }
              }}
              className={cn(
                "w-full flex items-center gap-1 px-2 py-1 rounded text-xs text-left transition-colors",
                isSelected ? "bg-brand-1/10 font-medium" : "text-muted-foreground hover:bg-sidebar-accent/50"
              )}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
              ) : (
                <span className="w-3" />
              )}
              <span className="truncate">{item.title}</span>
            </button>
            {hasChildren && isExpanded && (
              <HierarchyTree items={items} parentId={item.id} depth={depth + 1} selectedParent={selectedParent} onSelectParent={onSelectParent} />
            )}
          </div>
        );
      })}
    </div>
  );
}
