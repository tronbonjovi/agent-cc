import { Activity, Bot, Cpu, DollarSign, MessageSquare, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SessionEnrichment } from "@shared/board-types";

// ── Formatting functions (exported for unit testing) ──────────────────────────

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes === 0) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1_000)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function statusLightColor(
  isActive: boolean,
  healthScore: "good" | "fair" | "poor" | null
): string {
  if (!isActive) return "bg-slate-500";
  if (healthScore === "poor") return "bg-red-500";
  if (healthScore === "fair") return "bg-amber-500";
  return "bg-green-500";
}

export function shortenModel(model: string | null): string {
  if (!model) return "";
  const match = model.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (!match) return model;
  const [, family, major, minor] = match;
  return `${family.charAt(0).toUpperCase() + family.slice(1)} ${major}.${minor}`;
}

// ── React components ──────────────────────────────────────────────────────────

interface SessionProps {
  session: SessionEnrichment;
}

/** Small colored dot that pulses when the session is active. */
export function StatusLight({ session }: SessionProps) {
  const color = statusLightColor(session.isActive, session.healthScore);
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color} ${session.isActive ? "animate-pulse" : ""}`}
      aria-label={session.isActive ? "active" : "inactive"}
    />
  );
}

/** Small badge showing the shortened model name with a CPU icon. */
export function ModelBadge({ model }: { model: string | null }) {
  const label = shortenModel(model);
  if (!label) return null;
  return (
    <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs font-normal">
      <Cpu className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/** Dollar amount with icon. Returns null when cost is zero. */
export function CostPill({ costUsd }: { costUsd: number }) {
  if (costUsd === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <DollarSign className="h-3 w-3" />
      {formatCost(costUsd).replace("$", "")}
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
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
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
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
