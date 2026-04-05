import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { TaskItem } from "@shared/task-types";

interface KanbanColumnProps {
  status: string;
  items: TaskItem[];
  onAddTask: (status: string) => void;
  renderCard: (item: TaskItem) => React.ReactNode;
  inlineCreate?: React.ReactNode;
}

export function KanbanColumn({ status, items, onAddTask, renderCard, inlineCreate }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 min-w-[18rem] rounded-lg bg-muted/30 border",
        isOver && "ring-2 ring-brand-1/30"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</span>
          <span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">{items.length}</span>
        </div>
      </div>

      <div className="flex-1 p-2 space-y-2 min-h-[100px] overflow-y-auto">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => renderCard(item))}
        </SortableContext>
      </div>

      {inlineCreate || (
        <button
          onClick={() => onAddTask(status)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors border-t"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add task</span>
        </button>
      )}
    </div>
  );
}
