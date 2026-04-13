import { Badge } from "@/components/ui/badge";
import { shortModel } from "@/lib/utils";
import { sessionHealthBadgeVariant, type SessionHealthScore } from "@/lib/session-health";
import type {
  AssistantRecord,
  ParsedSession,
  SerializedSessionTreeForClient,
} from "@shared/session-types";
import { colorClassForOwner, type ToolOwner } from "./subagent-colors";

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

/**
 * Compute model → turn-count map for the Models row.
 *
 * When `tree` is provided, walk every assistant-turn node in the tree so
 * subagent-only models surface in the Models row for the first time. When
 * `tree` is null/undefined, fall back to the flat assistantMessages array
 * (today's pre-tree behavior). Both branches return the same Map shape so
 * the render code can stay unchanged.
 *
 * Defensive: tree-branch nodes without a `model` string are skipped rather
 * than counted as an empty-key bucket.
 */
export function computeModelBreakdownFromTree(
  tree: SerializedSessionTreeForClient | null | undefined,
  fallbackAssistantMessages: AssistantRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!tree) {
    for (const m of fallbackAssistantMessages) {
      counts.set(m.model, (counts.get(m.model) ?? 0) + 1);
    }
    return counts;
  }
  for (const node of Object.values(tree.nodesById)) {
    if (node.kind !== "assistant-turn") continue;
    const model = (node as { model?: string }).model;
    if (!model) continue;
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  return counts;
}

/**
 * Total cost + token totals for the session. Prefers `tree.totals` (which
 * includes subagent rollup from the post-order pass) when the tree is
 * available; falls back to summing `parsed.assistantMessages[].usage` when
 * the tree is null. The flat fallback cannot compute cost (per-message cost
 * isn't stored on AssistantRecord), so it returns 0 for cost — same as
 * today's broken display, but at least the token totals are real.
 */
export function computeCostFromTree(
  tree: SerializedSessionTreeForClient | null | undefined,
  parsed: ParsedSession,
): {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} {
  if (tree && tree.totals) {
    return {
      costUsd: tree.totals.costUsd ?? 0,
      inputTokens: tree.totals.inputTokens ?? 0,
      outputTokens: tree.totals.outputTokens ?? 0,
      cacheReadTokens: tree.totals.cacheReadTokens ?? 0,
      cacheCreationTokens: tree.totals.cacheCreationTokens ?? 0,
    };
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  for (const m of parsed.assistantMessages) {
    inputTokens += m.usage?.inputTokens ?? 0;
    outputTokens += m.usage?.outputTokens ?? 0;
    cacheReadTokens += m.usage?.cacheReadTokens ?? 0;
    cacheCreationTokens += m.usage?.cacheCreationTokens ?? 0;
  }
  return { costUsd: 0, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

/**
 * Subagent count for the Sidechains metric. Prefers `tree.subagentsByAgentId`
 * size — same source the working Subagents chip strip already reads, so the
 * two displays will always agree. Falls back to `parsed.counts.sidechainMessages`
 * (which historically undercounts because sidechain JSONL records live in
 * separate files and the flat counter doesn't see them) when the tree isn't
 * available.
 */
export function computeSidechainCount(
  tree: SerializedSessionTreeForClient | null | undefined,
  parsed: ParsedSession,
): number {
  if (tree && tree.subagentsByAgentId) {
    return Object.keys(tree.subagentsByAgentId).length;
  }
  return parsed.counts?.sidechainMessages ?? 0;
}

/**
 * One row in the new Subagents chip strip below the Models row. Each chip
 * carries everything the renderer needs (label fields + palette color class)
 * so the JSX stays presentational. The color comes from the same
 * `colorClassForOwner` hash used by ToolTimeline, so the same agent gets the
 * same color across views.
 */
export interface SubagentChip {
  agentId: string;
  agentType: string;
  costUsd: number;
  totalTokens: number;
  colorClass: string;
}

/**
 * Build the chip list for the Subagents row. Returns `[]` whenever the tree
 * is absent or has no subagents, so the renderer can branch on `length > 0`
 * and avoid drawing an empty row. Chips are sorted by `costUsd` descending
 * so the most expensive subagent leads the strip.
 */
export function computeSubagentChips(
  tree: SerializedSessionTreeForClient | null | undefined,
): SubagentChip[] {
  if (!tree || !tree.subagentsByAgentId) return [];
  const entries = Object.entries(tree.subagentsByAgentId);
  if (entries.length === 0) return [];
  const chips: SubagentChip[] = [];
  for (const [agentId, node] of entries) {
    const sub = node as {
      agentType?: string;
      rollupCost?: {
        inputTokens?: number;
        outputTokens?: number;
        costUsd?: number;
      };
    };
    const owner: ToolOwner = { kind: "subagent-root", agentId };
    chips.push({
      agentId,
      agentType: sub.agentType ?? "subagent",
      costUsd: sub.rollupCost?.costUsd ?? 0,
      totalTokens:
        (sub.rollupCost?.inputTokens ?? 0) +
        (sub.rollupCost?.outputTokens ?? 0),
      colorClass: colorClassForOwner(owner),
    });
  }
  chips.sort((a, b) => b.costUsd - a.costUsd);
  return chips;
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
  healthScore?: SessionHealthScore;
  healthReasons?: string[];
  durationMinutes?: number | null;
  /**
   * Optional session tree. When provided, the Models row walks tree
   * assistant-turn nodes (so subagent-only models surface) and a Subagents
   * chip strip renders below Models. When undefined/null, render is
   * byte-identical to the pre-tree look — task005 forwards the prop later.
   */
  tree?: SerializedSessionTreeForClient | null;
}

export function SessionOverview({
  parsed, costUsd, inputTokens, outputTokens,
  cacheReadTokens, cacheCreationTokens,
  healthScore, healthReasons, durationMinutes,
  tree,
}: SessionOverviewProps) {
  if (!parsed) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading session data...
      </div>
    );
  }

  const { meta, counts, assistantMessages, systemEvents } = parsed;

  // Model breakdown — when `tree` is provided, walks tree assistant-turn
  // nodes so subagent-only models surface; otherwise uses the flat
  // assistantMessages array (today's behavior).
  const modelCounts = computeModelBreakdownFromTree(tree, assistantMessages);
  const models = Array.from(modelCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  // Subagent chip strip — empty array when there's no tree or no subagents,
  // in which case the strip renders nothing (no empty row, byte-identical to
  // the pre-tree look).
  const subagentChips = computeSubagentChips(tree);

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

      {/* Subagents chip strip — only when tree present and subagents exist.
          Renders nothing otherwise so the pre-tree look stays byte-identical. */}
      {subagentChips.length > 0 && (
        <div className="px-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Subagents</span>
          <div className="flex flex-wrap gap-1">
            {subagentChips.map((chip) => (
              <Badge
                key={chip.agentId}
                variant="outline"
                className={`text-xs ${chip.colorClass}`}
              >
                {chip.agentType} · {formatMetric(chip.costUsd, "cost")} · {formatMetric(chip.totalTokens, "tokens")}
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
            <Badge variant={sessionHealthBadgeVariant(healthScore)}>
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
