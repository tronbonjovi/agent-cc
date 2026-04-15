/**
 * AI vs Deterministic dashboard card (scanner-ingester task006).
 *
 * Visualizes the ratio of cost-bearing AI calls vs free deterministic
 * sources (slash commands, hooks, workflow steps). Directly expresses
 * the user's "only send AI messages when needed" philosophy: the bigger
 * the deterministic share, the more was handled without burning tokens.
 *
 * Logic is factored into the pure `computeAiVsDeterministic` helper so
 * the savings math is unit-testable without rendering React (vitest
 * excludes `client/`, so source-text guardrails + pure-logic tests in
 * `tests/` are the only viable test surface — see
 * `reference_vitest_client_excluded.md`).
 */

import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { CostSummary, InteractionSource } from "@shared/types";

/** Sources whose events count as paid AI calls. `chat-ai` covers
 *  integrated chat AI turns; `scanner-jsonl` covers JSONL-imported
 *  Claude Code session events (every assistant turn has a cost). */
export const AI_SOURCES = ["chat-ai", "scanner-jsonl"] as const satisfies readonly InteractionSource[];

/** Sources that are free / deterministic — slash commands, hooks,
 *  and workflow steps don't go through the model. Counts are non-zero
 *  even though their `bySource` cost is always 0. */
export const DETERMINISTIC_SOURCES = [
  "chat-slash",
  "chat-hook",
  "chat-workflow",
] as const satisfies readonly InteractionSource[];

export interface AiVsDeterministicResult {
  aiCount: number;
  detCount: number;
  /** Total dollars across AI_SOURCES (from `bySource`). */
  aiCost: number;
  /** Average per-call cost, used to estimate what deterministic would
   *  have cost if the user had used AI for the same work. 0 when there
   *  are no AI calls (avoids divide-by-zero / NaN). */
  avgAiCost: number;
  /** Estimated dollars saved: `detCount * avgAiCost`. 0 when there
   *  are no AI calls. */
  estimatedSavings: number;
  /** Deterministic share as a percentage of total calls (AI + det).
   *  100 when only deterministic calls exist; 0 when no calls at all. */
  savingsPct: number;
}

/**
 * Pure savings computation extracted from the card. Takes a
 * `CostSummary` and returns the AI/deterministic counts, avg cost,
 * estimated savings, and savings percentage. Lives outside the
 * component so the unit tests in `tests/` can call it directly.
 */
export function computeAiVsDeterministic(
  summary: CostSummary,
): AiVsDeterministicResult {
  const cost = summary.bySource ?? ({} as CostSummary["bySource"]);
  const counts = summary.countBySource ?? ({} as CostSummary["countBySource"]);

  const aiCost = AI_SOURCES.reduce((s, k) => s + (cost[k] ?? 0), 0);
  const aiCount = AI_SOURCES.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const detCount = DETERMINISTIC_SOURCES.reduce(
    (s, k) => s + (counts[k] ?? 0),
    0,
  );

  const totalCount = aiCount + detCount;
  const savingsPct = totalCount > 0 ? (detCount / totalCount) * 100 : 0;
  const avgAiCost = aiCount > 0 ? aiCost / aiCount : 0;
  const estimatedSavings = detCount * avgAiCost;

  return { aiCount, detCount, aiCost, avgAiCost, estimatedSavings, savingsPct };
}

export function AiVsDeterministicCard() {
  const { data, isLoading, isError } = useQuery<CostSummary>({
    queryKey: ["cost-summary", 30],
    queryFn: async () => {
      const res = await fetch("/api/analytics/costs?days=30");
      if (!res.ok) throw new Error("failed to load cost summary");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card className="p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          AI vs Deterministic (30d)
        </h3>
        <p className="text-xs text-muted-foreground/60">Loading...</p>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          AI vs Deterministic (30d)
        </h3>
        <p className="text-xs text-muted-foreground/60">No cost data available</p>
      </Card>
    );
  }

  const { aiCount, detCount, aiCost, savingsPct, estimatedSavings } =
    computeAiVsDeterministic(data);

  return (
    <Card className="p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        AI vs Deterministic (30d)
      </h3>
      <div className="flex items-end gap-6 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            AI calls
          </span>
          <span className="text-2xl font-mono tabular-nums text-amber-400/90">
            {aiCount}
          </span>
          <span className="text-[11px] text-muted-foreground/70 font-mono tabular-nums">
            ${aiCost.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Deterministic
          </span>
          <span className="text-2xl font-mono tabular-nums text-emerald-400/90">
            {detCount}
          </span>
          <span className="text-[11px] text-muted-foreground/70 font-mono tabular-nums">
            $0.00
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Savings
          </span>
          <span className="text-2xl font-mono tabular-nums text-emerald-400/90">
            {savingsPct.toFixed(0)}%
          </span>
          <span className="text-[11px] text-muted-foreground/70 font-mono tabular-nums">
            ~${estimatedSavings.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
}
