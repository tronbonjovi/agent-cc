/**
 * Cache efficiency — analyzes prompt cache effectiveness across sessions.
 *
 * Computes overall hit rate, first-message vs steady-state token comparison,
 * cache ROI (creation cost vs read savings), and per-message-index cache curve.
 */

import type { ParsedSession } from "@shared/session-types";
import { getPricing } from "./pricing";

export interface CacheEfficiencyResult {
  hitRate: number;              // percentage
  firstMessageAvgInput: number; // tokens
  steadyStateAvgInput: number;  // tokens
  cacheCreationCost: number;    // USD
  cacheReadSavings: number;     // USD
  roi: number;                  // savings / creation cost ratio
  messageCurve: { index: number; cacheReadPct: number }[];
}

const MAX_CURVE_INDEX = 20;

/**
 * Compute cache efficiency metrics from parsed sessions.
 */
export function computeCacheEfficiency(sessions: ParsedSession[]): CacheEfficiencyResult {
  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let cacheCreationCost = 0;
  let cacheReadSavings = 0;

  let firstMessageCount = 0;
  let firstMessageInputSum = 0;
  let steadyStateCount = 0;
  let steadyStateInputSum = 0;

  // Per-index accumulators: index 0..19 → { sumPct, count }
  const curveAccum: { sumPct: number; count: number }[] = [];

  for (const session of sessions) {
    const msgs = session.assistantMessages;
    if (msgs.length === 0) continue;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const u = msg.usage;
      const model = msg.model || "unknown";
      const pricing = getPricing(model);

      // Aggregate totals for hit rate
      totalInputTokens += u.inputTokens;
      totalCacheReadTokens += u.cacheReadTokens;

      // Cache creation cost
      if (u.cacheCreationTokens > 0) {
        cacheCreationCost += (u.cacheCreationTokens * pricing.cacheCreation) / 1_000_000;
      }

      // Cache read savings: what reads would have cost at full input rate minus actual cache read cost
      if (u.cacheReadTokens > 0) {
        cacheReadSavings += (u.cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000;
      }

      // First message vs steady state
      if (i === 0) {
        firstMessageCount++;
        firstMessageInputSum += u.inputTokens;
      } else {
        steadyStateCount++;
        steadyStateInputSum += u.inputTokens;
      }

      // Message curve (capped at MAX_CURVE_INDEX)
      if (i < MAX_CURVE_INDEX) {
        if (!curveAccum[i]) {
          curveAccum[i] = { sumPct: 0, count: 0 };
        }
        const total = u.inputTokens + u.cacheReadTokens;
        const pct = total > 0 ? (u.cacheReadTokens / total) * 100 : 0;
        curveAccum[i].sumPct += pct;
        curveAccum[i].count++;
      }
    }
  }

  // Hit rate
  const totalReads = totalInputTokens + totalCacheReadTokens;
  const hitRate = totalReads > 0 ? (totalCacheReadTokens / totalReads) * 100 : 0;

  // First message vs steady state averages
  const firstMessageAvgInput = firstMessageCount > 0
    ? Math.round(firstMessageInputSum / firstMessageCount)
    : 0;
  const steadyStateAvgInput = steadyStateCount > 0
    ? Math.round(steadyStateInputSum / steadyStateCount)
    : 0;

  // ROI
  const roi = cacheCreationCost > 0 ? cacheReadSavings / cacheCreationCost : 0;

  // Build message curve
  const messageCurve: { index: number; cacheReadPct: number }[] = [];
  for (let i = 0; i < curveAccum.length; i++) {
    const acc = curveAccum[i];
    if (acc && acc.count > 0) {
      messageCurve.push({
        index: i + 1, // 1-based
        cacheReadPct: acc.sumPct / acc.count,
      });
    }
  }

  return {
    hitRate,
    firstMessageAvgInput,
    steadyStateAvgInput,
    cacheCreationCost,
    cacheReadSavings,
    roi,
    messageCurve,
  };
}
