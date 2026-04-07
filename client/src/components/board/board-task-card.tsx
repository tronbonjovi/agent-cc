// client/src/components/board/board-task-card.tsx

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, User, DollarSign } from "lucide-react";
import type { BoardTask } from "@shared/board-types";

interface BoardTaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function BoardTaskCard({ task, onClick }: BoardTaskCardProps) {
  return (
    <div
      onClick={() => onClick(task)}
      className="bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group"
    >
      {/* Project color indicator + title */}
      <div className="flex items-start gap-2">
        <div
          className="w-1 h-full min-h-[1.5rem] rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: task.projectColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight truncate">{task.title}</div>

          {/* Project name + milestone */}
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>{task.projectName}</span>
            {task.milestone && (
              <>
                <span className="opacity-40">&middot;</span>
                <span>{task.milestone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tags row */}
      {(task.tags.length > 0 || task.priority !== "medium") && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {task.priority !== "medium" && (
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
              {task.priority}
            </Badge>
          )}
          {task.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Activity line */}
      {task.activity && (
        <div className="mt-2 text-[10px] text-blue-400 truncate">
          {task.activity}
        </div>
      )}

      {/* Bottom row: assignee, cost, flag */}
      <div className="flex items-center gap-2 mt-2">
        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {task.assignee === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {task.assignee === "ai" ? "AI" : task.assignee}
          </span>
        )}
        {task.cost != null && task.cost > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <DollarSign className="h-3 w-3" />
            {task.cost.toFixed(2)}
          </span>
        )}
        {task.flagged && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 ml-auto" title={task.flagReason}>
            <AlertTriangle className="h-3 w-3" />
            Flagged
          </span>
        )}
      </div>
    </div>
  );
}
