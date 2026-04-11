import { type ReactNode } from "react";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import { useResizeHandle } from "@/hooks/use-resize-handle";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface ListDetailLayoutProps {
  /** The scrollable list panel */
  list: ReactNode;
  /** The detail panel (null = show empty state) */
  detail: ReactNode | null;
  /** What to show when nothing is selected */
  emptyDetail?: ReactNode;
  /** Callback for the back button on narrow viewports */
  onBack?: () => void;
}

/**
 * Determines which layout mode to use based on viewport and selection state.
 * Exported for testing — the component uses this internally.
 */
export function getLayoutMode(
  isMobileViewport: boolean,
  hasDetail: boolean,
): "split" | "list-only" | "detail-overlay" {
  if (!isMobileViewport) return "split";
  return hasDetail ? "detail-overlay" : "list-only";
}

/**
 * Email-client style list-detail split layout.
 * Wide viewport: side-by-side (~35/65). Narrow viewport: list full-width,
 * detail as full-screen overlay with back button.
 */
export function ListDetailLayout({ list, detail, emptyDetail, onBack }: ListDetailLayoutProps) {
  const bp = useBreakpoint();
  const mobile = isMobile(bp);
  const resize = useResizeHandle({ initialWidth: 350, minWidth: 280, maxWidth: 500, side: "right" });

  if (mobile) {
    // Mobile: show detail as overlay when selected, otherwise show list
    if (detail !== null) {
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 shrink-0">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {detail}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        {list}
      </div>
    );
  }

  // Desktop: side-by-side split with resizable divider
  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel — resizable width */}
      <div style={{ width: resize.width }} className="min-w-[280px] border-r border-border/40 overflow-y-auto shrink-0">
        {list}
      </div>

      {/* Resize handle */}
      <div data-testid="resize-handle" onMouseDown={resize.onMouseDown} className="w-1 cursor-col-resize hover:bg-accent/50 transition-colors shrink-0" />

      {/* Detail panel — fills remaining space */}
      <div className="flex-1 overflow-y-auto">
        {detail !== null ? detail : (
          emptyDetail ?? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a session to view details
            </div>
          )
        )}
      </div>
    </div>
  );
}
