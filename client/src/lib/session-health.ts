// Canonical session-health mapping helpers.
//
// Session health is a three-level score ("good" | "fair" | "poor") computed
// server-side by scanner/session-analytics.ts from tool errors and retries.
// This module is the single source of truth for mapping that score to
// Tailwind color classes, human-readable labels, and shadcn Badge variants.
//
// Keep this scoped to session health specifically. Service-operational state
// ("ok" | "warning" | "error" | "unknown") and project-card aggregate health
// ("healthy" | "warning" | "critical" | "unknown") are distinct vocabularies
// with their own helpers — do not merge them here.

export type SessionHealthScore = "good" | "fair" | "poor" | null;

/** Tailwind background class for health indicator dots/bars. */
export function sessionHealthColor(score: SessionHealthScore): string {
  switch (score) {
    case "good": return "bg-emerald-500";
    case "fair": return "bg-amber-500";
    case "poor": return "bg-red-500";
    default: return "bg-muted-foreground/30";
  }
}

/** Short human-readable label. */
export function sessionHealthLabel(score: SessionHealthScore): string {
  switch (score) {
    case "good": return "Healthy";
    case "fair": return "Some issues";
    case "poor": return "High error rate";
    default: return "Unknown";
  }
}

/** shadcn Badge variant name. */
export function sessionHealthBadgeVariant(
  score: SessionHealthScore
): "default" | "secondary" | "destructive" | "outline" {
  switch (score) {
    case "good": return "default";
    case "fair": return "secondary";
    case "poor": return "destructive";
    default: return "outline";
  }
}
