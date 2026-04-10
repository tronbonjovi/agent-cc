// client/src/components/board/project-popout.tsx

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Activity, DollarSign, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { type ProjectCardData, type ProjectMilestoneData, healthDotColor, formatProjectCost } from "./project-card";
import { useDeleteProject } from "@/hooks/use-projects";

// ── Layout constants ──────────────────────────────────────────────────────────

const POPOUT_WIDTH = 400;
const POPOUT_MAX_HEIGHT = 480;
const VIEWPORT_PADDING = 12;
const CARD_GAP = 8;

// ── Pure utility functions (exported for unit testing) ────────────────────────

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

/** Compute popout position anchored near the clicked card, staying within viewport.
 *  Mirrors the pattern from board-side-panel.tsx computePopoutPosition. */
export function computeProjectPopoutPosition(
  anchor: AnchorRect,
  viewport: ViewportSize,
): { top: number; left: number } {
  const anchorRight = anchor.left + anchor.width;

  // Decide left vs right placement
  const spaceRight = viewport.width - anchorRight - CARD_GAP - VIEWPORT_PADDING;
  const spaceLeft = anchor.left - CARD_GAP - VIEWPORT_PADDING;

  let left: number;
  if (spaceRight >= POPOUT_WIDTH) {
    left = anchorRight + CARD_GAP;
  } else if (spaceLeft >= POPOUT_WIDTH) {
    left = anchor.left - CARD_GAP - POPOUT_WIDTH;
  } else {
    // Not enough space on either side — center horizontally
    left = Math.max(VIEWPORT_PADDING, (viewport.width - POPOUT_WIDTH) / 2);
  }

  // Vertical: align top of popout with top of anchor, clamp to viewport
  let top = anchor.top;
  const maxTop = viewport.height - POPOUT_MAX_HEIGHT - VIEWPORT_PADDING;
  if (top > maxTop) {
    top = Math.max(VIEWPORT_PADDING, maxTop);
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { top, left };
}

const HEALTH_LABELS: Record<ProjectCardData["health"], string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

// ── Milestone classification ─────────────────────────────────────────────────

export interface ClassifiedMilestones {
  active: ProjectMilestoneData[];
  planned: ProjectMilestoneData[];
  completed: ProjectMilestoneData[];
}

/** Classify milestones into active, planned, and completed buckets. */
export function classifyMilestones(milestones: ProjectMilestoneData[]): ClassifiedMilestones {
  const active: ProjectMilestoneData[] = [];
  const planned: ProjectMilestoneData[] = [];
  const completed: ProjectMilestoneData[] = [];

  for (const m of milestones) {
    if (m.totalTasks > 0 && m.doneTasks === m.totalTasks) {
      completed.push(m);
    } else if (m.doneTasks > 0) {
      active.push(m);
    } else {
      planned.push(m);
    }
  }

  return { active, planned, completed };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  project: ProjectCardData;
  anchorRect: AnchorRect;
  onClose: () => void;
  onNavigate: (projectId: string) => void;
}

export function ProjectPopout({ project, anchorRect, onClose, onNavigate }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const deleteProject = useDeleteProject();

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const pos = computeProjectPopoutPosition(anchorRect, viewport);

  const progressPercent = project.taskCount > 0
    ? Math.round((project.doneTasks / project.taskCount) * 100)
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" />

      {/* Floating popout */}
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
        {/* Header: name + health + close */}
        <div className="px-4 pt-4 pb-3 border-b flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold leading-tight truncate">
                {project.name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1 flex-shrink-0">
                <span className={`inline-block w-2 h-2 rounded-full ${healthDotColor(project.health)}`} />
                {HEALTH_LABELS[project.health]}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-4 py-3 space-y-3">
            {/* Description */}
            {project.description && (
              <div className="text-sm text-muted-foreground">
                {project.description}
              </div>
            )}

            <Separator />

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Sessions
                </span>
                <div className="mt-0.5 font-medium">{project.sessionCount}</div>
              </div>
              <div>
                <span className="text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Total Cost
                </span>
                <div className="mt-0.5 font-medium">{formatProjectCost(project.totalCost)}</div>
              </div>
            </div>

            <Separator />

            {/* Roadmap checklist */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Roadmap</div>
              <div className="space-y-1.5">
                {(() => {
                  const classified = classifyMilestones(project.milestones);
                  const ordered = [...classified.active, ...classified.planned, ...classified.completed];
                  if (ordered.length === 0) {
                    return (
                      <div className="text-xs text-muted-foreground">No milestones</div>
                    );
                  }
                  return ordered.map(m => {
                    const isCompleted = m.totalTasks > 0 && m.doneTasks === m.totalTasks;
                    const isActive = !isCompleted && m.doneTasks > 0;
                    // Icon: ✓ completed, ○ active, — planned
                    const icon = isCompleted ? "\u2713" : isActive ? "\u25CB" : "\u2014";
                    const iconColor = isCompleted
                      ? "text-emerald-500"
                      : isActive
                        ? "text-amber-500"
                        : "text-muted-foreground/50";
                    return (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <span className={`w-4 text-center flex-shrink-0 ${iconColor}`}>{icon}</span>
                        <span
                          className={`truncate flex-1 ${isCompleted ? "line-through text-muted-foreground/60" : isActive ? "" : "text-muted-foreground/60"}`}
                        >
                          {m.title}
                        </span>
                        {isActive && (
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {m.doneTasks}/{m.totalTasks} done
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Total task summary */}
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{project.doneTasks} of {project.taskCount} tasks complete</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer: navigation + delete */}
        <div className="border-t px-4 py-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs flex-1 justify-start"
            onClick={() => onNavigate(project.id)}
          >
            <ArrowRight className="h-3 w-3 mr-2" />
            View Details
          </Button>
          {!project.isCurrent && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm("Remove this project from tracking? This does not delete files on disk.")) {
                  deleteProject.mutate(project.id, { onSuccess: onClose });
                }
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
