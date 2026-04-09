// client/src/components/board/board-task-card.tsx

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, User } from "lucide-react";
import {
  StatusLight,
  ModelBadge,
  AgentRoleBadge,
  CostPill,
  AgentActivity,
  SessionStats,
} from "./session-indicators";
import type { BoardTask } from "@shared/board-types";

interface BoardTaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask, e: React.MouseEvent) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function BoardTaskCard({ task, onClick }: BoardTaskCardProps) {
  const hasSession = task.session !== null;

  return (
    <div
      onClick={(e) => onClick(task, e)}
      className="bg-card border rounded-md p-3 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group"
    >
      {/* Row 1: Status light + title */}
      <div className="flex items-start gap-2">
        {hasSession ? (
          <div className="mt-1.5 flex-shrink-0">
            <StatusLight session={task.session!} />
          </div>
        ) : (
          <div
            className="w-1 h-full min-h-[1.5rem] rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: task.milestoneColor || task.projectColor }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-tight truncate">{task.title}</div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
            <span>{task.projectName}</span>
            {task.milestone && (
              <>
                <span className="opacity-40">&middot;</span>
                {task.milestoneColor && (
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: task.milestoneColor }}
                  />
                )}
                <span>{task.milestone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Badges — model, priority, tags */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {hasSession && <ModelBadge model={task.session!.model} />}
        {hasSession && <AgentRoleBadge role={task.session!.agentRole} />}
        {task.priority !== "medium" && (
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${priorityColors[task.priority]}`}>
            {task.priority}
          </Badge>
        )}
        {task.tags.slice(0, 2).map(tag => (
          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Row 3: Agent activity (session) */}
      {hasSession ? (
        <div className="mt-2">
          <AgentActivity session={task.session!} />
        </div>
      ) : null}

      {/* Row 4: Session stats (only when session exists) */}
      {hasSession && (
        <div className="mt-2">
          <SessionStats session={task.session!} />
        </div>
      )}

      {/* Row 5: Assignee + cost + flag */}
      <div className="flex items-center gap-2 mt-2">
        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {task.assignee === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {task.assignee === "ai" ? "AI" : task.assignee}
          </span>
        )}
        {hasSession ? (
          <span className="ml-auto">
            <CostPill costUsd={task.session!.costUsd} />
          </span>
        ) : null}
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
