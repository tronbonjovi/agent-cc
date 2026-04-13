/**
 * Model intelligence — per-model token and cost breakdown.
 * Aggregates parsed sessions by model name, computing API-equivalent
 * cost and cache savings for each model.
 *
 * Tree path (flat-to-tree wave3): walks every assistant turn in the tree
 * (parent + subagents) so per-model rows capture subagent spend. Subagent
 * turns attribute to the parent's sessionId for the distinct-session count —
 * subagents are not first-class sessions from a user perspective. Flat
 * fallback preserves the legacy parent-only aggregation with a one-shot
 * warning per session.
 */

import { getPricing, computeCost } from "./pricing";
import { sessionParseCache } from "./session-cache";
import { walkAllTurns } from "./tree-turn-walker";
import type { ParsedSession } from "@shared/session-types";

export interface ModelIntelligenceRow {
  model: string;
  sessions: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  apiEquivCost: number;
  cacheSavings: number;
}

interface Accumulator {
  sessionIds: Set<string>;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

/** Compute per-model breakdown from parsed sessions. */
export function computeModelIntelligence(sessions: ParsedSession[]): ModelIntelligenceRow[] {
  const byModel = new Map<string, Accumulator>();

  for (const session of sessions) {
    const sessionId = session.meta.sessionId;
    const tree = sessionParseCache.getTreeById(sessionId);
    if (!tree) {
      console.warn(
        "model-intelligence: tree missing, falling back to flat arrays",
        sessionId,
      );
    }

    for (const turn of walkAllTurns(session, tree)) {
      const rawModel = turn.model || "unknown";
      const model = rawModel === "<synthetic>" ? "unknown" : rawModel;
      let acc = byModel.get(model);
      if (!acc) {
        acc = {
          sessionIds: new Set(),
          inputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 0,
        };
        byModel.set(model, acc);
      }

      acc.sessionIds.add(sessionId);
      acc.inputTokens += turn.usage.inputTokens;
      acc.cacheReadTokens += turn.usage.cacheReadTokens;
      acc.cacheCreationTokens += turn.usage.cacheCreationTokens;
      acc.outputTokens += turn.usage.outputTokens;
    }
  }

  const rows: ModelIntelligenceRow[] = [];

  for (const [model, acc] of Array.from(byModel)) {
    const pricing = getPricing(model);
    const apiEquivCost = computeCost(
      pricing,
      acc.inputTokens,
      acc.outputTokens,
      acc.cacheReadTokens,
      acc.cacheCreationTokens,
    );

    const cacheSavings = acc.cacheReadTokens > 0
      ? (acc.cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000
      : 0;

    rows.push({
      model,
      sessions: acc.sessionIds.size,
      inputTokens: acc.inputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens,
      outputTokens: acc.outputTokens,
      apiEquivCost,
      cacheSavings,
    });
  }

  rows.sort((a, b) => b.apiEquivCost - a.apiEquivCost);

  return rows;
}
