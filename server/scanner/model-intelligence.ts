/**
 * Model intelligence — per-model token and cost breakdown.
 * Aggregates parsed sessions by model name, computing API-equivalent
 * cost and cache savings for each model.
 */

import { getPricing, computeCost } from "./pricing";
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

    for (const msg of session.assistantMessages) {
      const model = msg.model || "unknown";
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
      acc.inputTokens += msg.usage.inputTokens;
      acc.cacheReadTokens += msg.usage.cacheReadTokens;
      acc.cacheCreationTokens += msg.usage.cacheCreationTokens;
      acc.outputTokens += msg.usage.outputTokens;
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

    // Cache savings: difference between what cache reads would have cost
    // at the full input rate vs what they actually cost at the cache read rate
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

  // Sort by cost descending
  rows.sort((a, b) => b.apiEquivCost - a.apiEquivCost);

  return rows;
}
