import { Badge } from "@/components/ui/badge";
import { shortModel } from "@/lib/utils";
import type { ParsedSession } from "@shared/session-types";

/** Format metric values for display. Exported for testing. */
export function formatMetric(
  value: number | null | undefined,
  type: "tokens" | "cost" | "percent" | "duration" | "count",
): string {
  if (value == null) return "-";
  switch (type) {
    case "tokens":
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return String(value);
    case "cost":
      if (value >= 1) return `$${value.toFixed(2)}`;
      if (value >= 0.01) return `$${value.toFixed(3)}`;
      return `$${value.toFixed(4)}`;
    case "percent":
      return `${Math.round(value * 100)}%`;
    case "duration": {
      const h = Math.floor(value / 60);
      const m = value % 60;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }
    case "count":
      return String(value);
  }
}

interface MetricCellProps {
  label: string;
  value: string;
  subtitle?: string;
}

function MetricCell({ label, value, subtitle }: MetricCellProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium">{value}</span>
      {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

interface SessionOverviewProps {
  parsed: ParsedSession | null;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  healthScore?: "good" | "fair" | "poor" | null;
  healthReasons?: string[];
  durationMinutes?: number | null;
}

export function SessionOverview({
  parsed, costUsd, inputTokens, outputTokens,
  cacheReadTokens, cacheCreationTokens,
  healthScore, healthReasons, durationMinutes,
}: SessionOverviewProps) {
  if (!parsed) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading session data...
      </div>
    );
  }

  const { meta, counts, assistantMessages, systemEvents } = parsed;

  // Model breakdown
  const modelCounts = new Map<string, number>();
  for (const m of assistantMessages) {
    modelCounts.set(m.model, (modelCounts.get(m.model) ?? 0) + 1);
  }
  const models = Array.from(modelCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  // Stop reasons
  const stopReasons = new Map<string, number>();
  for (const m of assistantMessages) {
    stopReasons.set(m.stopReason, (stopReasons.get(m.stopReason) ?? 0) + 1);
  }

  // Cache hit rate
  const cacheRead = cacheReadTokens ?? 0;
  const cacheCreate = cacheCreationTokens ?? 0;
  const cacheTotal = cacheRead + cacheCreate;
  const cacheHitRate = cacheTotal > 0 ? cacheRead / cacheTotal : null;

  const totalInput = inputTokens ?? 0;
  const totalOutput = outputTokens ?? 0;

  return (
    <div className="space-y-4">
      {/* Metric grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-3 p-4">
        <MetricCell
          label="Messages"
          value={String(counts.assistantMessages + counts.userMessages)}
          subtitle={`${counts.userMessages}u / ${counts.assistantMessages}a`}
        />
        <MetricCell
          label="Turns"
          value={String(systemEvents.turnDurations.length)}
        />
        <MetricCell
          label="Duration"
          value={formatMetric(durationMinutes, "duration")}
        />
        <MetricCell
          label="Cost"
          value={formatMetric(costUsd, "cost")}
          subtitle={`${formatMetric(totalInput, "tokens")} in / ${formatMetric(totalOutput, "tokens")} out`}
        />
        <MetricCell
          label="Cache Hit"
          value={formatMetric(cacheHitRate, "percent")}
          subtitle={cacheTotal > 0 ? `${formatMetric(cacheRead, "tokens")} read` : undefined}
        />
        <MetricCell
          label="Tool Calls"
          value={String(counts.toolCalls)}
          subtitle={counts.toolErrors > 0 ? `${counts.toolErrors} errors` : undefined}
        />
        <MetricCell
          label="Sidechains"
          value={String(counts.sidechainMessages)}
        />
        <MetricCell
          label="Version"
          value={meta.version || "-"}
        />
      </div>

      {/* Models */}
      {models.length > 0 && (
        <div className="px-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Models</span>
          <div className="flex flex-wrap gap-1">
            {models.map(([model, count]) => (
              <Badge key={model} variant="outline" className="text-xs">
                {shortModel(model)} ({count})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Stop reasons */}
      {stopReasons.size > 0 && (
        <div className="px-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Stop Reasons</span>
          <div className="flex flex-wrap gap-1">
            {Array.from(stopReasons.entries()).map(([reason, count]) => (
              <Badge key={reason} variant="outline" className="text-xs">
                {reason} ({count})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Health */}
      {healthScore && (
        <div className="px-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Health</span>
          <div className="flex items-center gap-2">
            <Badge variant={healthScore === "good" ? "default" : healthScore === "fair" ? "secondary" : "destructive"}>
              {healthScore}
            </Badge>
            {healthReasons?.map((r, i) => (
              <Badge key={i} variant="outline" className="text-xs">{r}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Entry point */}
      <div className="px-4 pb-4">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Entry Point</span>
        <div className="text-sm">{meta.entrypoint || "-"}</div>
      </div>
    </div>
  );
}
