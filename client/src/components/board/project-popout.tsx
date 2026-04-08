// client/src/components/board/project-popout.tsx

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Activity, DollarSign, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ProjectCardData } from "./project-card";

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

export function getHealthColor(health: ProjectCardData["health"]): string {
  switch (health) {
    case "healthy":
      return "bg-green-500";
    case "warning":
      return "bg-yellow-500";
    case "critical":
      return "bg-red-500";
    case "unknown":
      return "bg-gray-500";
  }
}

function getHealthLabel(health: ProjectCardData["health"]): string {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
    case "unknown":
      return "Unknown";
  }
}

export function formatProjectCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
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
                <span className={`inline-block w-2 h-2 rounded-full ${getHealthColor(project.health)}`} />
                {getHealthLabel(project.health)}
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

            {/* Progress overview */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Progress</div>
              <div className="space-y-2">
                {/* Overall progress bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      {project.doneTasks} of {project.taskCount} tasks complete
                    </span>
                    <span className="font-medium">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Milestone / task summary */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 rounded-md bg-muted/50">
                    <div className="font-semibold">{project.milestoneCount}</div>
                    <div className="text-muted-foreground text-[10px]">Milestones</div>
                  </div>
                  <div className="text-center p-2 rounded-md bg-muted/50">
                    <div className="font-semibold">{project.inProgressTasks}</div>
                    <div className="text-muted-foreground text-[10px]">In Progress</div>
                  </div>
                  <div className="text-center p-2 rounded-md bg-muted/50">
                    <div className="font-semibold">{project.doneTasks}</div>
                    <div className="text-muted-foreground text-[10px]">Done</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer: navigation link */}
        <div className="border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs w-full justify-start"
            onClick={() => onNavigate(project.id)}
          >
            <ArrowRight className="h-3 w-3 mr-2" />
            View Details
          </Button>
        </div>
      </div>
    </>
  );
}
