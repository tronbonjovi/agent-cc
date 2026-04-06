import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import type { TaskItem } from "@shared/task-types";
import { PipelineCardOverlay } from "./pipeline-card-overlay";

const priorityColors: Record<string, string> = {
  high: "border-l-red-400/70",
  medium: "border-l-amber-400/70",
  low: "border-l-blue-400/70",
};

const priorityBadge: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-blue-500/15 text-blue-400",
};

interface TaskCardProps {
  task: TaskItem;
  onClick: () => void;
  parentTitle?: string;
}

export function TaskCard({ task, onClick, parentTitle }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const preview = task.body?.trim().split("\n")[0]?.slice(0, 80);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 cursor-pointer transition-all",
        "hover:shadow-md hover:border-border/80",
        "border-l-[3px]",
        priorityColors[task.priority || ""] || "border-l-border",
        isDragging && "opacity-40 shadow-lg"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight">{task.title}</div>
          {(parentTitle || task.parent) && (
            <div className="text-[11px] text-muted-foreground/40 mt-0.5 truncate">{parentTitle || task.parent}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {task.priority && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", priorityBadge[task.priority] || "bg-muted text-muted-foreground")}>
              {task.priority}
            </span>
          )}
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
      </div>

      {preview && (
        <div className="text-xs text-muted-foreground/50 mt-1.5 line-clamp-2 leading-relaxed">{preview}</div>
      )}

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {task.labels?.map((label) => (
          <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{label}</Badge>
        ))}
        {task.created && (
          <span className="text-[10px] text-muted-foreground/30 ml-auto">{task.created}</span>
        )}
      </div>

      {task.pipelineStage && <PipelineCardOverlay task={task} />}
    </div>
  );
}

export function TaskCardDragOverlay({ task }: { task: TaskItem }) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-3 shadow-xl border-l-[3px] w-72 rotate-2",
      priorityColors[task.priority || ""] || "border-l-border"
    )}>
      <div className="text-sm font-medium">{task.title}</div>
      {task.priority && (
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium mt-1 inline-block", priorityBadge[task.priority] || "bg-muted")}>
          {task.priority}
        </span>
      )}
    </div>
  );
}
