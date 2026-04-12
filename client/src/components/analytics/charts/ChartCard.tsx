// client/src/components/analytics/charts/ChartCard.tsx
//
// Consistent wrapper for every chart in the Charts tab. Provides:
//   - title bar with optional icon
//   - optional inline `controls` slot (per-chart toggles, e.g. stacked vs grouped)
//   - loading skeleton state
//   - expand-to-fullwidth button that promotes the card into a modal-style
//     dialog so dense charts can be inspected without leaving the tab
//
// Style notes (per CLAUDE.md / new-user-safety.test.ts enforcement):
//   - Solid colors only (no fade fills)
//   - No bounce / active:scale animations
import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, Minimize2 } from "lucide-react";

export interface ChartCardProps {
  title: string;
  /** Optional small icon rendered before the title (e.g. a lucide icon node). */
  icon?: ReactNode;
  /** Optional inline controls (toggles, segment buttons) rendered on the right of the title bar. */
  controls?: ReactNode;
  /** Show a skeleton placeholder instead of children when true. */
  loading?: boolean;
  /** Allow the card to be expanded into a modal-style fullwidth view. Default: true. */
  expandable?: boolean;
  /** Optional Tailwind class hooks (e.g. for col-span). */
  className?: string;
  children: ReactNode;
}

function ChartSkeleton() {
  // Solid muted blocks — pulse only via Tailwind animate-pulse, nothing fancier.
  return (
    <div className="space-y-3" aria-label="Loading chart">
      <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
      <div className="h-[220px] w-full rounded bg-muted/30 animate-pulse" />
      <div className="flex gap-2">
        <div className="h-3 w-12 rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  icon,
  controls,
  loading = false,
  expandable = true,
  className,
  children,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false);

  const header = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
        <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
      </div>
      <div className="flex items-center gap-1.5">
        {controls}
        {expandable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(true)}
            aria-label={`Expand ${title}`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  const body = loading ? <ChartSkeleton /> : children;

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">{header}</CardHeader>
        <CardContent>{body}</CardContent>
      </Card>

      {expandable && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="max-w-5xl w-[95vw]">
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
                <span className="text-base font-medium truncate">{title}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setExpanded(false)}
                aria-label="Collapse chart"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <div className="mt-3">{body}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default ChartCard;
