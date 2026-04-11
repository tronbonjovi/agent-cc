// client/src/components/board/board-task-card.tsx
//
// Unified card layout — all cards share the same structure regardless of
// whether they have an active session, a cached lastSession snapshot, or
// no session data at all. Data priority: active session > lastSession > omit.

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, User, MessageSquare, Clock, Activity, DollarSign, Cpu } from "lucide-react";
import { SessionDetailAccordion } from "./session-detail-accordion";
import {
  StatusLight,
  ModelBadge,
  AgentRoleBadge,
  CostPill,
  AgentActivity,
  SessionStats,
  formatDuration,
  formatTokens,
  formatCost,
  shortenModel,
  formatAgentRole,
} from "./session-indicators";
import type { BoardTask, LastSessionSnapshot } from "@shared/board-types";

interface BoardTaskCardProps {
  task: BoardTask;
  onClick: (task: BoardTask, e: React.MouseEvent) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

/** Truncate task title to ~60 characters with ellipsis. */
export function truncateTitle(title: string, maxLen = 60): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen).trimEnd() + "\u2026";
}

export function BoardTaskCard({ task, onClick }: BoardTaskCardProps) {
  const hasSession = task.session !== null;
  const snap = task.lastSession;

  // Resolve display values: active session > lastSession snapshot > null
  const model = task.session?.model ?? snap?.model ?? null;
  const agentRole = task.session?.agentRole ?? snap?.agentRole ?? null;
  const messageCount = task.session?.messageCount ?? snap?.messageCount ?? null;
  const durationMinutes = task.session?.durationMinutes ?? snap?.durationMinutes ?? null;
  const inputTokens = task.session?.inputTokens ?? snap?.inputTokens ?? null;
  const outputTokens = task.session?.outputTokens ?? snap?.outputTokens ?? null;
  const costUsd = task.session?.costUsd ?? snap?.costUsd ?? null;
  const totalTokens = (inputTokens != null && outputTokens != null) ? inputTokens + outputTokens : null;

  const hasModelOrRole = model !== null || agentRole !== null;
  const hasStats = messageCount !== null || durationMinutes !== null || totalTokens !== null;

  return (
    <div
      onClick={(e) => onClick(task, e)}
      className="bg-card border rounded-md p-2.5 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all group"
    >
      {/* Row 1: Status light + title + project/milestone */}
      <div className="flex items-start gap-1.5">
        {hasSession ? (
          <div className="mt-1.5 flex-shrink-0">
            <StatusLight session={task.session!} />
          </div>
        ) : (
          <div
            className="w-1 self-stretch rounded-full flex-shrink-0"
            style={{ backgroundColor: task.milestoneColor || task.projectColor }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-[13px] font-medium leading-snug whitespace-nowrap overflow-hidden text-ellipsis"
            title={task.title}
          >
            {truncateTitle(task.title)}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            <span className="truncate">{task.projectName}</span>
            {task.milestone && (
              <>
                <span className="opacity-40">&middot;</span>
                {task.milestoneColor && (
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: task.milestoneColor }}
                  />
                )}
                <span className="truncate">{task.milestone}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Model + agent role (from session or snapshot) */}
      {(hasModelOrRole || task.priority !== "medium" || task.tags.length > 0) && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {model && <ModelBadge model={model} />}
          {agentRole && <AgentRoleBadge role={agentRole} />}
          {task.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="outline" className="text-[9px] leading-none px-1.5 py-0.5">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Row 3: Agent activity (only active sessions) */}
      {hasSession && (
        <div className="mt-1.5">
          <AgentActivity session={task.session!} />
        </div>
      )}

      {/* Row 4: Stats — messages, time, tokens, cost (from session or snapshot) */}
      {hasStats && (
        <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted-foreground">
          {messageCount !== null && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {messageCount}
            </span>
          )}
          {durationMinutes !== null && (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatDuration(durationMinutes)}
            </span>
          )}
          {totalTokens !== null && totalTokens > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Activity className="h-3 w-3" />
              {formatTokens(totalTokens)}
            </span>
          )}
          {costUsd !== null && costUsd > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title="Cost covers the entire session, not just this task"
            >
              <DollarSign className="h-3 w-3" />
              {formatCost(costUsd).replace("$", "")}
            </span>
          )}
        </div>
      )}

      {/* Row 5: Session detail accordion (from session or snapshot) */}
      {(task.session || snap) && (
        <SessionDetailAccordion data={(task.session ?? snap)!} />
      )}

      {/* Row 6: Assignee + flag */}
      {(task.assignee || task.flagged) && (
        <div className="flex items-center gap-2 mt-1.5 min-h-0">
          {task.assignee && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {task.assignee === "ai" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {task.assignee === "ai" ? "AI" : task.assignee}
            </span>
          )}
          <span className="flex-1" />
          {task.flagged && (
            <span className="flex items-center gap-1 text-[10px] text-amber-500" title={task.flagReason}>
              <AlertTriangle className="h-3 w-3" />
              Flagged
            </span>
          )}
        </div>
      )}
    </div>
  );
}
