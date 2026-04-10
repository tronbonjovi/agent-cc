// client/src/components/library/entity-card.tsx

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// --- Types ---

export type EntityCardStatus = "installed" | "saved" | "available";
export type EntityCardHealth = "healthy" | "degraded" | "error";

export interface EntityCardAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
}

export interface EntityCardProps {
  icon?: React.ReactNode;
  name: string;
  description?: string;
  status?: EntityCardStatus;
  health?: EntityCardHealth;
  tags?: string[];
  actions?: EntityCardAction[];
  onClick?: () => void;
}

// --- Exported utility functions (tested independently) ---

/** Map status to Tailwind badge color classes */
export function statusBadgeClass(status: EntityCardStatus): string {
  switch (status) {
    case "installed":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "saved":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "available":
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}

/** Map status to human-readable label */
export function statusBadgeLabel(status: EntityCardStatus): string {
  switch (status) {
    case "installed":
      return "Installed";
    case "saved":
      return "Saved";
    case "available":
      return "Available";
  }
}

/** Map health to Tailwind dot color class, or null when health is not provided */
export function healthDotClass(health: EntityCardHealth | undefined): string | null {
  if (!health) return null;
  switch (health) {
    case "healthy":
      return "bg-emerald-500";
    case "degraded":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
  }
}

// --- Component ---

export function EntityCard({
  icon,
  name,
  description,
  status,
  health,
  tags,
  actions,
  onClick,
}: EntityCardProps) {
  const isClickable = !!onClick;
  const dotClass = healthDotClass(health);

  return (
    <div
      onClick={onClick}
      className={`bg-card border rounded-md p-3 transition-all ${
        isClickable ? "cursor-pointer hover:border-foreground/20 hover:shadow-sm" : ""
      }`}
    >
      {/* Row 1: Icon + name + status badge + health dot */}
      <div className="flex items-center gap-2">
        {icon && <span className="flex-shrink-0 text-muted-foreground">{icon}</span>}
        <span className="text-sm font-medium truncate flex-1">{name}</span>
        {dotClass && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`}
            title={health}
          />
        )}
        {status && (
          <Badge
            variant="outline"
            className={`text-[9px] leading-none px-1.5 py-0.5 ${statusBadgeClass(status)}`}
          >
            {statusBadgeLabel(status)}
          </Badge>
        )}
      </div>

      {/* Row 2: Description */}
      {description && (
        <div className="mt-1.5 text-[12px] text-muted-foreground line-clamp-2">
          {description}
        </div>
      )}

      {/* Row 3: Tags */}
      {tags && tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[9px] leading-none px-1.5 py-0.5 text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Row 4: Actions */}
      {actions && actions.length > 0 && (
        <div className="flex items-center justify-end gap-1.5 mt-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
