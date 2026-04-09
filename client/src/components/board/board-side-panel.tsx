// client/src/components/board/board-side-panel.tsx

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Bot, ExternalLink, Link, Trash2, Unlink, X } from "lucide-react";
import {
  StatusLight,
  formatCost,
  formatDuration,
  formatTokens,
  shortenModel,
  statusLightColor,
} from "./session-indicators";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useMoveTask, useUnflagTask, useLinkSession, useDeleteTask } from "@/hooks/use-board";
import { useSessions } from "@/hooks/use-sessions";
import { useState, useEffect, useRef, useCallback } from "react";
import type { BoardTask, BoardColumn } from "@shared/board-types";

const POPOUT_WIDTH = 440;
const POPOUT_MAX_HEIGHT = 520;
const VIEWPORT_PADDING = 12;
const CARD_GAP = 8;

interface CardRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

/** Compute popout position anchored near the clicked card, staying within viewport */
export function computePopoutPosition(
  cardRect: CardRect,
  viewport: ViewportSize,
): { top: number; left: number } {
  // Decide left vs right placement
  const spaceRight = viewport.width - cardRect.right - CARD_GAP - VIEWPORT_PADDING;
  const spaceLeft = cardRect.left - CARD_GAP - VIEWPORT_PADDING;

  let left: number;
  if (spaceRight >= POPOUT_WIDTH) {
    // Place to the right of the card
    left = cardRect.right + CARD_GAP;
  } else if (spaceLeft >= POPOUT_WIDTH) {
    // Place to the left of the card
    left = cardRect.left - CARD_GAP - POPOUT_WIDTH;
  } else {
    // Not enough space on either side — center horizontally
    left = Math.max(VIEWPORT_PADDING, (viewport.width - POPOUT_WIDTH) / 2);
  }

  // Vertical: align top of popout with top of card, clamp to viewport
  let top = cardRect.top;
  const maxTop = viewport.height - POPOUT_MAX_HEIGHT - VIEWPORT_PADDING;
  if (top > maxTop) {
    top = Math.max(VIEWPORT_PADDING, maxTop);
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { top, left };
}

interface BoardSidePanelProps {
  task: BoardTask | null;
  open: boolean;
  onClose: () => void;
  /** Bounding rect of the card that was clicked, for positioning */
  anchorRect: CardRect | null;
}

export function BoardSidePanel({ task, open, onClose, anchorRect }: BoardSidePanelProps) {
  const moveTask = useMoveTask();
  const unflagTask = useUnflagTask();
  const linkSession = useLinkSession();
  const deleteTask = useDeleteTask();
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const { data: sessionData } = useSessions({ sort: "lastTs", order: "desc", hideEmpty: true });
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use a timeout so the click that opened the panel doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  // Reset session picker when task changes
  useEffect(() => {
    setShowSessionPicker(false);
  }, [task?.id]);

  if (!task || !open) return null;

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

  // Compute position
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const pos = anchorRect
    ? computePopoutPosition(anchorRect, viewport)
    : { top: viewport.height / 2 - POPOUT_MAX_HEIGHT / 2, left: viewport.width / 2 - POPOUT_WIDTH / 2 };

  return (
    <>
      {/* Backdrop overlay — semi-transparent to indicate modal state */}
      <div className="fixed inset-0 z-40 bg-black/20" />

      {/* Floating popout panel */}
      <div
        ref={panelRef}
        className="fixed z-50 bg-card border rounded-lg shadow-lg flex flex-col animate-in fade-in-0 zoom-in-95 duration-150"
        style={{
          top: pos.top,
          left: pos.left,
          width: POPOUT_WIDTH,
          maxHeight: POPOUT_MAX_HEIGHT,
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-start gap-3">
          <div
            className="w-1.5 rounded-full h-8 flex-shrink-0 mt-0.5"
            style={{ backgroundColor: task.projectColor }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold leading-tight">{task.title}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {task.projectName}
              {task.milestone && <> &middot; {task.milestone}</>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-4 py-3 space-y-3">
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
        <div className="border-t px-4 py-2 flex items-center justify-end">
          {task.source === "db" && (
            <button
              className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
              onClick={() => {
                if (confirm("Delete this task? This cannot be undone.")) {
                  deleteTask.mutate(task.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}
