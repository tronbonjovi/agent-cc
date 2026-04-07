// client/src/components/board/board-side-panel.tsx

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Bot, ExternalLink, DollarSign } from "lucide-react";
import { BOARD_COLUMNS } from "@/lib/board-columns";
import { useMoveTask } from "@/hooks/use-board";
import type { BoardTask, BoardColumn } from "@shared/board-types";

interface BoardSidePanelProps {
  task: BoardTask | null;
  open: boolean;
  onClose: () => void;
}

export function BoardSidePanel({ task, open, onClose }: BoardSidePanelProps) {
  const moveTask = useMoveTask();

  if (!task) return null;

  function handleMove(column: BoardColumn) {
    moveTask.mutate({ taskId: task!.id, column });
  }

  function handleForceUnflag() {
    moveTask.mutate({ taskId: task!.id, column: task!.column, force: true });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
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
                    onClick={handleForceUnflag}
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
