/**
 * Cache efficiency — analyzes prompt cache effectiveness across sessions.
 *
 * Computes overall hit rate, first-message vs steady-state token comparison,
 * cache ROI (creation cost vs read savings), and per-message-index cache curve.
 *
 * Tree path (flat-to-tree wave3): each input session expands into one parent
 * sub-session plus one per subagent. All hit-rate / ROI / first-vs-steady /
 * curve math runs per sub-session so subagent cache activity is attributed
 * correctly. Flat fallback preserves legacy parent-only behavior with a
 * one-shot warning per session.
 */

import type { ParsedSession } from "@shared/session-types";
import { getPricing } from "./pricing";
import { sessionParseCache } from "./session-cache";
import { turnSubSessions, type TurnSlim } from "./tree-turn-walker";

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

interface Accumulator {
  totalInputTokens: number;
  totalCacheReadTokens: number;
  cacheCreationCost: number;
  cacheReadSavings: number;
  firstMessageCount: number;
  firstMessageInputSum: number;
  steadyStateCount: number;
  steadyStateInputSum: number;
  curveAccum: { sumPct: number; count: number }[];
}

/**
 * Fold one ordered sub-session (parent or a single subagent) into the
 * running accumulator. Turn index 0 is the sub-session's "first message",
 * and the per-index cache curve is shared across sub-sessions so a subagent's
 * first turn contributes to the index-1 bucket just like the parent's first.
 */
function accumulateSubSession(turns: TurnSlim[], acc: Accumulator): void {
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const u = turn.usage;
    const pricing = getPricing(turn.model || "unknown");

    acc.totalInputTokens += u.inputTokens;
    acc.totalCacheReadTokens += u.cacheReadTokens;

    if (u.cacheCreationTokens > 0) {
      acc.cacheCreationCost += (u.cacheCreationTokens * pricing.cacheCreation) / 1_000_000;
    }
    if (u.cacheReadTokens > 0) {
      acc.cacheReadSavings += (u.cacheReadTokens * (pricing.input - pricing.cacheRead)) / 1_000_000;
    }

    if (i === 0) {
      acc.firstMessageCount++;
      acc.firstMessageInputSum += u.inputTokens;
    } else {
      acc.steadyStateCount++;
      acc.steadyStateInputSum += u.inputTokens;
    }

    if (i < MAX_CURVE_INDEX) {
      if (!acc.curveAccum[i]) acc.curveAccum[i] = { sumPct: 0, count: 0 };
      const total = u.inputTokens + u.cacheReadTokens;
      const pct = total > 0 ? (u.cacheReadTokens / total) * 100 : 0;
      acc.curveAccum[i].sumPct += pct;
      acc.curveAccum[i].count++;
    }
  }
}

/**
 * Compute cache efficiency metrics from parsed sessions.
 */
export function computeCacheEfficiency(sessions: ParsedSession[]): CacheEfficiencyResult {
  const acc: Accumulator = {
    totalInputTokens: 0,
    totalCacheReadTokens: 0,
    cacheCreationCost: 0,
    cacheReadSavings: 0,
    firstMessageCount: 0,
    firstMessageInputSum: 0,
    steadyStateCount: 0,
    steadyStateInputSum: 0,
    curveAccum: [],
  };

  for (const session of sessions) {
    const tree = sessionParseCache.getTreeById(session.meta.sessionId);
    if (!tree) {
      console.warn(
        "cache-efficiency: tree missing, falling back to flat arrays",
        session.meta.sessionId,
      );
    }

    const subSessions = turnSubSessions(session, tree);
    for (const sub of subSessions) {
      if (sub.length === 0) continue;
      accumulateSubSession(sub, acc);
    }
  }

  const totalReads = acc.totalInputTokens + acc.totalCacheReadTokens;
  const hitRate = totalReads > 0 ? (acc.totalCacheReadTokens / totalReads) * 100 : 0;

  const firstMessageAvgInput = acc.firstMessageCount > 0
    ? Math.round(acc.firstMessageInputSum / acc.firstMessageCount)
    : 0;
  const steadyStateAvgInput = acc.steadyStateCount > 0
    ? Math.round(acc.steadyStateInputSum / acc.steadyStateCount)
    : 0;

  const roi = acc.cacheCreationCost > 0 ? acc.cacheReadSavings / acc.cacheCreationCost : 0;

  const messageCurve: { index: number; cacheReadPct: number }[] = [];
  for (let i = 0; i < acc.curveAccum.length; i++) {
    const c = acc.curveAccum[i];
    if (c && c.count > 0) {
      messageCurve.push({ index: i + 1, cacheReadPct: c.sumPct / c.count });
    }
  }

  return {
    hitRate,
    firstMessageAvgInput,
    steadyStateAvgInput,
    cacheCreationCost: acc.cacheCreationCost,
    cacheReadSavings: acc.cacheReadSavings,
    roi,
    messageCurve,
  };
}
