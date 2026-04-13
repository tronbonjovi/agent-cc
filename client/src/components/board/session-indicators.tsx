import { Activity, Bot, Cpu, DollarSign, MessageSquare, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { SessionEnrichment } from "@shared/board-types";
import { formatCost, formatTokens } from "@/lib/format";
import { shortModel } from "@/lib/utils";
import { sessionHealthColor, sessionHealthLabel, type SessionHealthScore } from "@/lib/session-health";

// ── Formatting re-exports (canonical definitions live in @/lib/format) ────────
//
// `formatCost` and `formatTokens` are re-exported so existing
// `./session-indicators` imports keep working without per-caller changes.
export { formatCost, formatTokens };

/**
 * Format cost with a "(session)" qualifier to indicate the cost covers the
 * entire session, not just the individual task. Returns empty string for zero.
 *
 * Kept here (not in shared/format.ts) because it's specific to the board's
 * session-cost display pattern — not a general canonical formatter.
 */
export function formatCostLabel(usd: number): string {
  if (usd === 0) return "";
  return `${formatCost(usd)} (session)`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes === 0) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function statusLightColor(
  isActive: boolean,
  healthScore: SessionHealthScore
): string {
  if (!isActive) return "bg-slate-500";
  return sessionHealthColor(healthScore);
}

export function statusLightTooltip(
  isActive: boolean,
  healthScore: SessionHealthScore
): string {
  if (!isActive) return "Session ended";
  if (healthScore == null) return "Active";
  return `Active — ${sessionHealthLabel(healthScore).toLowerCase()}`;
}

/** Format an agent role string for display — capitalize words, replace hyphens with spaces. */
export function formatAgentRole(role: string | null): string {
  if (!role) return "";
  return role
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Health reason color mapping ──────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  "high error rate": "bg-red-500/10 text-red-400 border-red-500/20",
  "context overflow": "bg-red-500/10 text-red-400 border-red-500/20",
  "excessive retries": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "long idle gaps": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "high cost": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "short session": "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const MUTED_FALLBACK = "bg-slate-500/10 text-slate-400 border-slate-500/20";

export function HealthReasonTag({ reason }: { reason: string }) {
  const colors = REASON_COLORS[reason] ?? MUTED_FALLBACK;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-none border ${colors}`}>
      {reason}
    </span>
  );
}

// ── React components ──────────────────────────────────────────────────────────

interface SessionProps {
  session: SessionEnrichment;
}

/** Small colored dot that pulses when the session is active. Tooltip explains the color. */
export function StatusLight({ session }: SessionProps) {
  const color = statusLightColor(session.isActive, session.healthScore);
  const tooltip = statusLightTooltip(session.isActive, session.healthScore);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block h-2 w-2 rounded-full ${color} ${session.isActive ? "animate-pulse" : ""}`}
            aria-label={tooltip}
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Small badge showing the shortened model name with a CPU icon. */
export function ModelBadge({ model }: { model: string | null }) {
  if (!model) return null;
  const label = shortModel(model);
  return (
    <Badge variant="secondary" className="gap-0.5 px-1.5 py-0.5 text-[10px] leading-none font-normal">
      <Cpu className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

/** Small badge showing the agent role (e.g. "Explore", "Plan") with a Bot icon.
 *  Returns null when role is null or empty — graceful degradation. */
export function AgentRoleBadge({ role }: { role: string | null }) {
  const label = formatAgentRole(role);
  if (!label) return null;
  return (
    <Badge variant="secondary" className="gap-0.5 px-1.5 py-0.5 text-[10px] leading-none font-normal">
      <Bot className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

/**
 * Dollar amount with icon plus "(session)" qualifier.
 * Cost is session-level — see investigation comment in session-enricher.ts.
 * Returns null when cost is zero.
 */
export function CostPill({ costUsd }: { costUsd: number }) {
  if (costUsd === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
      title="Cost covers the entire session, not just this task"
    >
      <DollarSign className="h-3 w-3" />
      {formatCost(costUsd).replace("$", "")}
      <span className="text-[10px] opacity-60">session</span>
    </span>
  );
}

/**
 * Bot icon + last activity text. Shows "Working..." when active and no
 * activity text is available. Returns null when inactive with no activity.
 */
export function AgentActivity({ session }: SessionProps) {
  const { isActive, lastActivity } = session;
  if (!lastActivity && !isActive) return null;
  const label = lastActivity ?? (isActive ? "Working..." : "Idle");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate">
      <Bot className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Compact stat row: message count, duration, total tokens. */
export function SessionStats({ session }: SessionProps) {
  const { messageCount, durationMinutes, inputTokens, outputTokens } = session;
  const totalTokens = inputTokens + outputTokens;
  return (
    <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-0.5">
        <MessageSquare className="h-3 w-3" />
        {messageCount}
      </span>
      {durationMinutes !== null && (
        <span className="inline-flex items-center gap-0.5">
          <Clock className="h-3 w-3" />
          {formatDuration(durationMinutes)}
        </span>
      )}
      <span className="inline-flex items-center gap-0.5">
        <Activity className="h-3 w-3" />
        {formatTokens(totalTokens)}
      </span>
    </div>
  );
}
