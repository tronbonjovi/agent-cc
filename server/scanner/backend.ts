/**
 * Scanner backend interface + JSONL implementation.
 *
 * Agent CC's data-read layer for Sessions / Messages / Costs. Reads directly
 * from JSONL parsers and the session parse cache — no SQLite dependency.
 *
 * M8 (chat-scanner-unification) task001 replaced the SQLite-backed
 * `backend-store.ts` with this inline JSONL implementation. The store
 * backend file is still present (deleted by task004) but no longer imported.
 */

import type {
  SessionData,
  SessionStats,
  CostSummary,
  CostBySource,
  CostTokenBreakdown,
  SessionCostDetail,
  SessionCostData,
} from '../../shared/types';
import { ALL_INTERACTION_SOURCES } from '../../shared/types';
import type {
  TimelineMessage,
  TimelineMessageType,
} from '../../shared/session-types';
import {
  getCachedSessions,
  getCachedStats,
} from './session-scanner';
import { parseSessionMessages } from './session-parser';
import {
  getSessionCost as analyticsGetSessionCost,
} from './session-analytics';
import { getPricing, computeCost } from './pricing';
import { sessionParseCache } from './session-cache';

/** Result shape of `getSessionMessages` — mirrors `parseSessionMessages`. */
export interface SessionMessagesResult {
  messages: TimelineMessage[];
  totalMessages: number;
}

/**
 * The read surface routes call into for scanner-sourced data. Analytics
 * helpers that purely transform a `SessionData[]` list (heatmaps, health,
 * weekly digest, bash knowledge, etc.) stay outside the interface and keep
 * taking whatever `listSessions` returns.
 */
export interface IScannerBackend {
  /** Backend identity — convenient for diagnostics, tests, and logs. */
  readonly name: 'jsonl' | 'store';

  /**
   * Return the cached session list that powers Sessions list, Costs, and
   * most analytics pages.
   */
  listSessions(): SessionData[];

  /** Session-list aggregate stats (counts + size totals). */
  getStats(): SessionStats;

  /**
   * Single-session lookup by session id. Returns `undefined` when the id
   * is unknown — same contract as `Array.prototype.find`.
   */
  getSessionById(id: string): SessionData | undefined;

  /**
   * Typed, paginated message timeline for a session. `filePath` is the
   * session JSONL path. `types` filters the seven timeline variants —
   * empty means all.
   */
  getSessionMessages(
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>
  ): SessionMessagesResult;

  /**
   * Per-session cost breakdown (rolled up across every record) used by
   * `GET /api/sessions/:id/costs`. `sessions` is passed for call-site
   * convenience; the JSONL backend uses it to drive the analytics cache.
   */
  getSessionCost(sessions: SessionData[], sessionId: string): SessionCostData | null;

  /**
   * Cost summary over the last `days` days — drives the Costs tab overview.
   */
  getCostSummary(days: number): CostSummary;

  /**
   * Detailed cost breakdown for a single session — drives the per-session
   * drill-down on the Costs tab.
   */
  getSessionCostDetail(sessionId: string): SessionCostDetail | null;
}

/** Keys of `IScannerBackend` that must be present on every implementation.
 *  Exported for the runtime guard in `tests/scanner-backend.test.ts`. */
export const SCANNER_BACKEND_METHODS: ReadonlyArray<keyof IScannerBackend> = [
  'name',
  'listSessions',
  'getStats',
  'getSessionById',
  'getSessionMessages',
  'getSessionCost',
  'getCostSummary',
  'getSessionCostDetail',
];

// ---------------------------------------------------------------------------
// Helpers for cost summary / cost detail built from parsed sessions
// ---------------------------------------------------------------------------

function emptyTokens(): CostTokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function emptyBySource(): CostBySource {
  const out = {} as CostBySource;
  for (const s of ALL_INTERACTION_SOURCES) out[s] = 0;
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a `SessionCostData` from a `ParsedSession`'s assistant messages,
 * using the same logic as `session-analytics.analyzeSession` (tree path
 * preferred, flat fallback). Returns null if no cost-bearing data exists.
 */
function buildSessionCostFromParsed(sessionId: string): SessionCostData | null {
  const tree = sessionParseCache.getTreeById(sessionId);
  const parsed = sessionParseCache.getById(sessionId);
  if (!parsed && !tree) return null;

  const modelBreakdown: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }> = {};
  const modelsSet = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let totalCost = 0;

  if (tree) {
    // Tree path — walk assistant-turn nodes for full subagent inclusion
    for (const node of Array.from(tree.nodesById.values())) {
      if (node.kind !== 'assistant-turn') continue;
      const turn = node as import('../../shared/session-types').AssistantTurnNode;
      const model = turn.model || 'unknown';
      modelsSet.add(model);
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
      }
      modelBreakdown[model].input += turn.usage.inputTokens;
      modelBreakdown[model].output += turn.usage.outputTokens;
      modelBreakdown[model].cacheRead += turn.usage.cacheReadTokens;
      modelBreakdown[model].cacheCreation += turn.usage.cacheCreationTokens;
      modelBreakdown[model].cost += turn.selfCost.costUsd;
    }
    totalInput = tree.totals.inputTokens;
    totalOutput = tree.totals.outputTokens;
    totalCacheRead = tree.totals.cacheReadTokens;
    totalCacheCreation = tree.totals.cacheCreationTokens;
    totalCost = tree.totals.costUsd;
  } else if (parsed) {
    // Flat fallback — parent-only
    for (const msg of parsed.assistantMessages) {
      const model = msg.model || 'unknown';
      modelsSet.add(model);
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
      }
      modelBreakdown[model].input += msg.usage.inputTokens;
      modelBreakdown[model].output += msg.usage.outputTokens;
      modelBreakdown[model].cacheRead += msg.usage.cacheReadTokens;
      modelBreakdown[model].cacheCreation += msg.usage.cacheCreationTokens;

      totalInput += msg.usage.inputTokens;
      totalOutput += msg.usage.outputTokens;
      totalCacheRead += msg.usage.cacheReadTokens;
      totalCacheCreation += msg.usage.cacheCreationTokens;
    }
    // Compute cost per model from pricing tables
    for (const [model, data] of Object.entries(modelBreakdown)) {
      const pricing = getPricing(model);
      data.cost = computeCost(pricing, data.input, data.output, data.cacheRead, data.cacheCreation);
      totalCost += data.cost;
    }
  }

  if (modelsSet.size === 0) return null;

  return {
    sessionId,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    cacheCreationTokens: totalCacheCreation,
    estimatedCostUsd: round4(totalCost),
    models: Array.from(modelsSet),
    modelBreakdown,
  };
}

// ---------------------------------------------------------------------------
// JSONL scanner backend
// ---------------------------------------------------------------------------

const jsonlBackend: IScannerBackend = {
  name: 'jsonl',

  listSessions(): SessionData[] {
    return getCachedSessions();
  },

  getStats(): SessionStats {
    return getCachedStats();
  },

  getSessionById(id: string): SessionData | undefined {
    return getCachedSessions().find((s) => s.id === id);
  },

  getSessionMessages(
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>,
  ): SessionMessagesResult {
    try {
      return parseSessionMessages(filePath, offset, limit, types);
    } catch {
      return { messages: [], totalMessages: 0 };
    }
  },

  getSessionCost(
    sessions: SessionData[],
    sessionId: string,
  ): SessionCostData | null {
    // Use session-analytics which has a TTL cache and walks the tree/parsed data
    return analyticsGetSessionCost(sessions, sessionId);
  },

  getCostSummary(days: number): CostSummary {
    const sessions = getCachedSessions();
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    // Filter sessions in window
    const windowSessions = sessions.filter((s) => {
      const ts = s.lastTs || s.firstTs || '';
      return ts >= cutoffIso;
    });

    // Extended window for weekly comparison (14 days) and monthly total (30 days)
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyIso = thirtyAgo.toISOString();
    const extendedSessions = sessions.filter((s) => {
      const ts = s.lastTs || s.firstTs || '';
      return ts >= thirtyIso;
    });

    // Build cost data for all sessions in window
    const windowCosts: Array<{ session: SessionData; cost: SessionCostData }> = [];
    for (const session of windowSessions) {
      if (session.isEmpty || session.messageCount === 0) continue;
      const cost = buildSessionCostFromParsed(session.id);
      if (cost) windowCosts.push({ session, cost });
    }

    // Build cost data for extended sessions (for weekly comparison)
    const extendedCosts: Array<{ session: SessionData; cost: SessionCostData }> = [];
    for (const session of extendedSessions) {
      if (session.isEmpty || session.messageCount === 0) continue;
      const cost = buildSessionCostFromParsed(session.id);
      if (cost) extendedCosts.push({ session, cost });
    }

    // Totals
    let totalCost = 0;
    const totalTokens = emptyTokens();
    for (const { cost } of windowCosts) {
      totalCost += cost.estimatedCostUsd;
      totalTokens.input += cost.inputTokens;
      totalTokens.output += cost.outputTokens;
      totalTokens.cacheRead += cost.cacheReadTokens;
      totalTokens.cacheCreation += cost.cacheCreationTokens;
    }

    // bySource — all from scanner-jsonl since this is the JSONL backend
    const bySource = emptyBySource();
    bySource['scanner-jsonl'] = round3(totalCost);
    const countBySource = emptyBySource();
    countBySource['scanner-jsonl'] = windowCosts.length;

    // Weekly comparison
    const sevenAgo = new Date(now);
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const sevenIso = sevenAgo.toISOString();
    const fourteenAgo = new Date(now);
    fourteenAgo.setDate(fourteenAgo.getDate() - 14);
    const fourteenIso = fourteenAgo.toISOString();

    let thisWeekCost = 0;
    let lastWeekCost = 0;
    for (const { session, cost } of extendedCosts) {
      const ts = session.lastTs || session.firstTs || '';
      if (ts >= sevenIso) {
        thisWeekCost += cost.estimatedCostUsd;
      } else if (ts >= fourteenIso) {
        lastWeekCost += cost.estimatedCostUsd;
      }
    }
    const changePct =
      lastWeekCost > 0 ? Math.round((thisWeekCost / lastWeekCost - 1) * 100) : 0;

    // Monthly total
    let monthlyTotalCost = 0;
    for (const { cost } of extendedCosts) {
      monthlyTotalCost += cost.estimatedCostUsd;
    }

    // byModel
    const byModel: CostSummary['byModel'] = {};
    for (const { cost } of windowCosts) {
      for (const [model, data] of Object.entries(cost.modelBreakdown)) {
        if (!byModel[model]) {
          byModel[model] = { cost: 0, tokens: emptyTokens(), sessions: 0 };
        }
        byModel[model].cost += data.cost;
        byModel[model].tokens.input += data.input;
        byModel[model].tokens.output += data.output;
        byModel[model].tokens.cacheRead += data.cacheRead;
        byModel[model].tokens.cacheCreation += data.cacheCreation;
        byModel[model].sessions++;
      }
    }
    for (const key of Object.keys(byModel)) {
      byModel[key].cost = round3(byModel[key].cost);
    }

    // byProject
    const projMap: Record<string, { cost: number; sessions: number }> = {};
    for (const { session, cost } of windowCosts) {
      const pk = session.projectKey || 'unknown';
      if (!projMap[pk]) projMap[pk] = { cost: 0, sessions: 0 };
      projMap[pk].cost += cost.estimatedCostUsd;
      projMap[pk].sessions++;
    }
    const byProject = Object.entries(projMap)
      .map(([key, data]) => ({
        projectKey: key,
        projectName: key,
        cost: round3(data.cost),
        sessions: data.sessions,
      }))
      .sort((a, b) => b.cost - a.cost);

    // byDay
    const dayMap: Record<string, { cost: number; compute: number; cache: number }> = {};
    for (const { session, cost } of windowCosts) {
      const day = (session.firstTs || session.lastTs || '').slice(0, 10);
      if (!day) continue;
      if (!dayMap[day]) dayMap[day] = { cost: 0, compute: 0, cache: 0 };
      dayMap[day].cost += cost.estimatedCostUsd;
      // Approximate compute vs cache split from model breakdown
      for (const [model, data] of Object.entries(cost.modelBreakdown)) {
        const pricing = getPricing(model);
        const computePart = (data.input * pricing.input + data.output * pricing.output) / 1_000_000;
        const cachePart = (data.cacheRead * pricing.cacheRead + data.cacheCreation * pricing.cacheCreation) / 1_000_000;
        dayMap[day].compute += computePart;
        dayMap[day].cache += cachePart;
      }
    }
    const byDay = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        cost: round3(data.cost),
        computeCost: round3(data.compute),
        cacheCost: round3(data.cache),
        bySource: (() => { const s = emptyBySource(); s['scanner-jsonl'] = round3(data.cost); return s; })(),
        countBySource: (() => { const s = emptyBySource(); return s; })(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // topSessions
    const topSessions = windowCosts
      .filter(({ cost }) => cost.estimatedCostUsd > 0)
      .sort((a, b) => b.cost.estimatedCostUsd - a.cost.estimatedCostUsd)
      .slice(0, 20)
      .map(({ session, cost }) => ({
        sessionId: session.id,
        firstMessage: (session.firstMessage || '').slice(0, 100),
        model: cost.models[0] || 'unknown',
        cost: round3(cost.estimatedCostUsd),
        subagentCount: 0,
        subagentCost: 0,
        tokens: {
          input: cost.inputTokens,
          output: cost.outputTokens,
          cacheRead: cost.cacheReadTokens,
          cacheCreation: cost.cacheCreationTokens,
        },
      }));

    return {
      totalCost: round3(totalCost),
      totalTokens,
      bySource,
      countBySource,
      weeklyComparison: {
        thisWeek: round2(thisWeekCost),
        lastWeek: round2(lastWeekCost),
        changePct,
      },
      monthlyTotalCost: round3(monthlyTotalCost),
      byModel,
      byProject,
      byDay,
      topSessions,
      planLimits: {
        pro: { limit: 0, label: 'Pro (usage-based)' },
        max5x: { limit: 100, label: 'Max $100/mo' },
        max20x: { limit: 200, label: 'Max $200/mo' },
      },
    };
  },

  getSessionCostDetail(sessionId: string): SessionCostDetail | null {
    const parsed = sessionParseCache.getById(sessionId);
    if (!parsed) return null;

    const cost = buildSessionCostFromParsed(sessionId);
    if (!cost) return null;

    const primaryModel = cost.models[0] || 'unknown';
    const pricing = getPricing(primaryModel);

    return {
      sessionId,
      firstMessage: (parsed.meta.firstMessage || '').slice(0, 200),
      totalCost: round3(cost.estimatedCostUsd),
      directCost: round3(cost.estimatedCostUsd),
      directTokens: {
        input: cost.inputTokens,
        output: cost.outputTokens,
        cacheRead: cost.cacheReadTokens,
        cacheCreation: cost.cacheCreationTokens,
      },
      directModel: primaryModel,
      subagents: [],
      ratesApplied: {
        model: primaryModel,
        input: pricing.input,
        output: pricing.output,
        cacheRead: pricing.cacheRead,
        cacheCreation: pricing.cacheCreation,
      },
    };
  },
};

/** Resolve the active scanner backend. There is only one; the factory is
 *  kept so test doubles and future migrations can still intercept it. */
export function getScannerBackend(): IScannerBackend {
  return jsonlBackend;
}
