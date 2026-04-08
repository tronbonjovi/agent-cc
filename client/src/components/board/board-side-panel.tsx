// client/src/components/board/board-side-panel.tsx

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Bot, ExternalLink, DollarSign, Link, Unlink } from "lucide-react";
import {
  StatusLight,
  formatCost,
  formatDuration,
  formatTokens,
  shortenModel,
  statusLightColor,
} from "./session-indicators";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useMoveTask, useUnflagTask, useLinkSession } from "@/hooks/use-board";
import { useSessions } from "@/hooks/use-sessions";
import { useState } from "react";
import type { BoardTask, BoardColumn } from "@shared/board-types";

interface BoardSidePanelProps {
  task: BoardTask | null;
  open: boolean;
  onClose: () => void;
}

export function BoardSidePanel({ task, open, onClose }: BoardSidePanelProps) {
  const moveTask = useMoveTask();
  const unflagTask = useUnflagTask();
  const linkSession = useLinkSession();
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const { data: sessionData } = useSessions({ sort: "lastTs", order: "desc", hideEmpty: true });

  if (!task) return null;

  function handleMove(column: BoardColumn) {
    moveTask.mutate({ taskId: task!.id, column });
  }

  function handleDismissFlag() {
    unflagTask.mutate(task!.id);
  }

  function handleLinkSession(sessionId: string) {
    linkSession.mutate({ taskId: task!.id, sessionId });
    setShowSessionPicker(false);
  }

  function handleUnlinkSession() {
    linkSession.mutate({ taskId: task!.id, sessionId: null });
  }

  const sessions = sessionData?.sessions ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); setShowSessionPicker(false); } }}>
      <SheetContent className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          {/* Project color + title */}
          <div className="flex items-start gap-3">
            <div
              className="w-1.5 rounded-full h-8 flex-shrink-0 mt-0.5"
              style={{ backgroundColor: task.projectColor }}
            />
            <div>
              <SheetTitle className="text-base leading-tight">{task.title}</SheetTitle>
              <div className="text-xs text-muted-foreground mt-1">
                {task.projectName}
                {task.milestone && <> &middot; {task.milestone}</>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* Flag warning */}
            {task.flagged && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-500">Flagged</div>
                  <div className="text-xs text-amber-400/80 mt-0.5">{task.flagReason}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs text-amber-500"
                    onClick={handleDismissFlag}
                  >
                    Dismiss flag
                  </Button>
                </div>
              </div>
            )}

            {/* Status + move controls */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Status</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {BOARD_COLUMNS.map((col) => (
                  <Button
                    key={col.id}
                    variant={col.id === task.column ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    disabled={col.id === task.column}
                    onClick={() => handleMove(col.id)}
                  >
                    {col.label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Priority</span>
                <div className="mt-0.5 font-medium capitalize">{task.priority}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Assignee</span>
                <div className="mt-0.5 font-medium flex items-center gap-1">
                  {task.assignee === "ai" ? <><Bot className="h-3 w-3" /> AI</> : task.assignee || "Unassigned"}
                </div>
              </div>
              {task.cost != null && task.cost > 0 && (
                <div>
                  <span className="text-muted-foreground">Cost</span>
                  <div className="mt-0.5 font-medium flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />${task.cost.toFixed(2)}
                  </div>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Updated</span>
                <div className="mt-0.5 font-medium">{task.updatedAt}</div>
              </div>
            </div>

            {/* Tags */}
            {task.tags.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Dependencies */}
            {task.dependsOn.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Depends On</div>
                  <div className="space-y-1">
                    {task.dependsOn.map(depId => (
                      <div key={depId} className="text-xs font-mono text-muted-foreground">
                        {depId}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Description</div>
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    {task.description}
                  </div>
                </div>
              </>
            )}

            {/* Activity */}
            {task.activity && (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Activity</div>
                  <div className="text-xs text-blue-400">{task.activity}</div>
                </div>
              </>
            )}

            {/* Session detail */}
            {task.session ? (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    Session
                    <StatusLight session={task.session} />
                    <span className="text-[10px] font-normal">
                      {task.session.isActive ? "Active" : "Inactive"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground ml-auto"
                      onClick={handleUnlinkSession}
                      title="Unlink session"
                    >
                      <Unlink className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Session stats grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Model</span>
                      <div className="mt-0.5 font-medium">{shortenModel(task.session.model) || "Unknown"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Health</span>
                      <div className="mt-0.5 font-medium flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${statusLightColor(true, task.session.healthScore)}`} />
                        {task.session.healthScore ?? "—"}
                        {task.session.toolErrors > 0 && (
                          <span className="text-red-400 text-[10px]">({task.session.toolErrors} errors)</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Messages</span>
                      <div className="mt-0.5 font-medium">{task.session.messageCount}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <div className="mt-0.5 font-medium">{formatDuration(task.session.durationMinutes) || "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tokens</span>
                      <div className="mt-0.5 font-medium">
                        {formatTokens(task.session.inputTokens)} in / {formatTokens(task.session.outputTokens)} out
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost</span>
                      <div className="mt-0.5 font-medium">{formatCost(task.session.costUsd)}</div>
                    </div>
                  </div>

                  {/* Link to full session */}
                  <Button variant="ghost" size="sm" className="mt-3 text-xs w-full justify-start" asChild>
                    <a href={`/sessions?highlight=${task.session.sessionId}`}>
                      <ExternalLink className="h-3 w-3 mr-2" />
                      View Full Session
                    </a>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Separator />
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Session</div>
                  {showSessionPicker ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md">
                      {sessions.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">No sessions found</div>
                      ) : (
                        sessions.slice(0, 20).map(s => (
                          <button
                            key={s.id}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                            onClick={() => handleLinkSession(s.id)}
                          >
                            <div className="font-medium truncate">{s.firstMessage || s.slug || s.id}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                              {s.isActive && <span className="text-green-500">Active</span>}
                              <span>{s.messageCount} msgs</span>
                              {s.lastTs && <span>{new Date(s.lastTs).toLocaleDateString()}</span>}
                            </div>
                          </button>
                        ))
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => setShowSessionPicker(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowSessionPicker(true)}
                    >
                      <Link className="h-3 w-3 mr-1.5" />
                      Link Session
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-5 py-3">
          <Button variant="ghost" size="sm" className="text-xs w-full justify-start" asChild>
            <a href={`/tasks/${task.project}`}>
              <ExternalLink className="h-3 w-3 mr-2" />
              Open Full Detail
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
