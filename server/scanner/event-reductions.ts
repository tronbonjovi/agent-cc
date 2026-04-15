/**
 * Pure reductions from `InteractionEvent[]` into analytics shapes — the
 * store-backed scanner backend uses these helpers to reproduce what the
 * legacy scanner computes from a full JSONL parse.
 *
 * Design notes:
 *   - Every function is a pure reduction: takes events in, returns a shape
 *     out. No I/O, no DB access. Makes the parity test a single
 *     "legacy vs store from the same fixture" comparison.
 *   - Token breakdown grouping key is always `cost.model || "unknown"`,
 *     matching the legacy `session-analytics.analyzeSession` convention.
 *     Deterministic events (cost === null) contribute nothing.
 *   - USD rounding matches the legacy rounding: session cost uses 4
 *     decimals (`Math.round(x * 10000) / 10000`), cost summary uses 3
 *     (`Math.round(x * 1000) / 1000`). Those two precisions are
 *     copy-of-legacy; they're not arbitrary.
 *
 * Scope: only what `backend-store.ts` needs for task004 parity. New
 * reductions land here when a later task needs them — avoid building a
 * general-purpose analytics library.
 */

import path from 'path';
import type {
  InteractionEvent,
  SessionCostData,
  CostTokenBreakdown,
  CostSummary,
  SessionCostDetail,
} from '../../shared/types';
import { getPricing } from './pricing';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

interface ModelAccumulator {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  cost: number;
}

function emptyModel(): ModelAccumulator {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
}

function emptyTokens(): CostTokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

/** Round USD to 4 decimals — matches `session-analytics.getSessionCost`. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Round USD to 3 decimals — matches `cost-indexer.getCostSummary`. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Round USD to 2 decimals — matches `cost-indexer` weekly comparison. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Derive the encoded projectKey from a session JSONL path. Mirrors
 *  `backend-store.rollupToSessionData` so list view and analytics stay
 *  consistent on whatever the store has recorded. */
function projectKeyFromPath(sessionPath: string | undefined | null): string {
  if (!sessionPath || typeof sessionPath !== 'string') return '';
  const normalized = sessionPath.replace(/\\/g, '/');
  return path.basename(path.dirname(normalized));
}

// ---------------------------------------------------------------------------
// Session cost — per-model token breakdown for a single session
// ---------------------------------------------------------------------------

/**
 * Reduce a set of events (typically parent + all sidechain events for a
 * session) into a `SessionCostData`. Matches what
 * `session-analytics.getSessionCost` returns on the tree path — iterates
 * every cost-bearing event, groups tokens by model, sums to totals, and
 * rounds USD to 4 decimals.
 *
 * Returns null when the input contains no cost-bearing events. The legacy
 * code path would still return a zero-filled record in that case, but the
 * backend contract is `SessionCostData | null` and null is the cleaner
 * signal for "no AI cost to report".
 */
export function reduceSessionCost(
  events: InteractionEvent[],
  sessionId: string
): SessionCostData | null {
  if (events.length === 0) return null;

  const modelBreakdown: Record<string, ModelAccumulator> = {};
  const modelsSet = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let totalCost = 0;
  let hadCost = false;

  for (const event of events) {
    const cost = event.cost;
    if (cost === null) continue;
    hadCost = true;

    const model = cost.model || 'unknown';
    modelsSet.add(model);
    if (!modelBreakdown[model]) modelBreakdown[model] = emptyModel();

    const input = cost.tokensIn || 0;
    const output = cost.tokensOut || 0;
    const cacheRead = cost.cacheReadTokens || 0;
    const cacheCreation = cost.cacheCreationTokens || 0;
    const usd = cost.usd || 0;

    modelBreakdown[model].input += input;
    modelBreakdown[model].output += output;
    modelBreakdown[model].cacheRead += cacheRead;
    modelBreakdown[model].cacheCreation += cacheCreation;
    modelBreakdown[model].cost += usd;

    totalInput += input;
    totalOutput += output;
    totalCacheRead += cacheRead;
    totalCacheCreation += cacheCreation;
    totalCost += usd;
  }

  if (!hadCost) return null;

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
// Session cost detail — per-subagent drill-down
// ---------------------------------------------------------------------------

const SUBAGENT_ID_SEPARATOR = ':sub:';

/**
 * Reduce a set of events (parent + sidechains) into a `SessionCostDetail`.
 * Matches `cost-indexer.getSessionCostDetail`: direct cost from parent-
 * session events, subagents grouped by the sidechain conversationId's
 * trailing agent id. `directModel` is the first model seen on a parent
 * event; `ratesApplied` comes from `getPricing` for that model.
 *
 * Returns null when the input is empty (matches legacy: `records.length === 0`).
 */
export function reduceSessionCostDetail(
  events: InteractionEvent[],
  sessionId: string,
  firstMessage: string
): SessionCostDetail | null {
  if (events.length === 0) return null;

  const directRecords: InteractionEvent[] = [];
  const subagentMap = new Map<string, InteractionEvent[]>();

  for (const event of events) {
    if (event.conversationId === sessionId) {
      directRecords.push(event);
    } else if (event.conversationId.startsWith(`${sessionId}${SUBAGENT_ID_SEPARATOR}`)) {
      const agentId = event.conversationId.slice(
        sessionId.length + SUBAGENT_ID_SEPARATOR.length
      );
      if (!subagentMap.has(agentId)) subagentMap.set(agentId, []);
      subagentMap.get(agentId)!.push(event);
    }
  }

  const sumCostBearing = (evs: InteractionEvent[]): { cost: number; tokens: CostTokenBreakdown } => {
    const tokens = emptyTokens();
    let cost = 0;
    for (const e of evs) {
      if (e.cost === null) continue;
      cost += e.cost.usd || 0;
      tokens.input += e.cost.tokensIn || 0;
      tokens.output += e.cost.tokensOut || 0;
      tokens.cacheRead += e.cost.cacheReadTokens || 0;
      tokens.cacheCreation += e.cost.cacheCreationTokens || 0;
    }
    return { cost, tokens };
  };

  const direct = sumCostBearing(directRecords);
  // Direct model is the first model seen on a cost-bearing parent event,
  // matching `cost-indexer.getSessionCostDetail`: `directRecords.find(r => r.model)?.model`.
  const directModel =
    directRecords.find((e) => e.cost?.model)?.cost?.model || 'unknown';
  const pricing = getPricing(directModel);

  const subagents = Array.from(subagentMap.entries()).map(([agentId, agentEvents]) => {
    const rolled = sumCostBearing(agentEvents);
    const agentModel =
      agentEvents.find((e) => e.cost?.model)?.cost?.model || 'unknown';
    return {
      sessionId: agentId,
      model: agentModel,
      cost: round3(rolled.cost),
      tokens: rolled.tokens,
    };
  });

  const totalCost = direct.cost + subagents.reduce((s, a) => s + a.cost, 0);

  return {
    sessionId,
    firstMessage: (firstMessage || '').slice(0, 200),
    totalCost: round3(totalCost),
    directCost: round3(direct.cost),
    directTokens: direct.tokens,
    directModel,
    subagents,
    ratesApplied: {
      model: directModel,
      input: pricing.input,
      output: pricing.output,
      cacheRead: pricing.cacheRead,
      cacheCreation: pricing.cacheCreation,
    },
  };
}

// ---------------------------------------------------------------------------
// Cost summary — day-bucketed rollup over the last N days
// ---------------------------------------------------------------------------

/** Canonical UTC date key for an ISO-8601 timestamp. */
function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Reduce events into a `CostSummary` that matches `cost-indexer.getCostSummary`.
 *
 * Inputs:
 *   - `windowEvents`: events inside the `days` window (feeds totalCost,
 *      totalTokens, byModel, byProject, byDay, topSessions).
 *   - `allEvents`: every event in the store (feeds weeklyComparison and
 *      monthlyTotalCost, which legacy computes across full history).
 *
 * The split mirrors legacy's shape — don't collapse them into one call,
 * because the week-over-week number is always full-history even when the
 * user asks for a 7-day summary.
 */
export function reduceCostSummary(
  windowEvents: InteractionEvent[],
  allEvents: InteractionEvent[]
): CostSummary {
  // ---- Totals over the window ----
  let totalCost = 0;
  const totalTokens = emptyTokens();
  for (const e of windowEvents) {
    if (e.cost === null) continue;
    totalCost += e.cost.usd || 0;
    totalTokens.input += e.cost.tokensIn || 0;
    totalTokens.output += e.cost.tokensOut || 0;
    totalTokens.cacheRead += e.cost.cacheReadTokens || 0;
    totalTokens.cacheCreation += e.cost.cacheCreationTokens || 0;
  }

  // ---- Weekly comparison (full history) ----
  const now = new Date();
  const sevenAgo = new Date(now);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const fourteenAgo = new Date(now);
  fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const sevenStr = sevenAgo.toISOString().slice(0, 10);
  const fourteenStr = fourteenAgo.toISOString().slice(0, 10);
  let thisWeekCost = 0;
  let lastWeekCost = 0;
  for (const e of allEvents) {
    if (e.cost === null) continue;
    const d = utcDay(e.timestamp);
    if (d >= sevenStr && d < tomorrowStr) thisWeekCost += e.cost.usd || 0;
    if (d >= fourteenStr && d < sevenStr) lastWeekCost += e.cost.usd || 0;
  }
  const changePct =
    lastWeekCost > 0 ? Math.round((thisWeekCost / lastWeekCost - 1) * 100) : 0;

  // ---- Monthly total (30d, full history) ----
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toISOString();
  let monthlyTotalCost = 0;
  for (const e of allEvents) {
    if (e.cost === null) continue;
    if (e.timestamp >= thirtyStr) monthlyTotalCost += e.cost.usd || 0;
  }

  // ---- By model ----
  const byModel: CostSummary['byModel'] = {};
  const modelSessions: Record<string, Set<string>> = {};
  for (const e of windowEvents) {
    if (e.cost === null) continue;
    const key = e.cost.model || 'unknown';
    if (!byModel[key]) {
      byModel[key] = { cost: 0, tokens: emptyTokens(), sessions: 0 };
      modelSessions[key] = new Set();
    }
    byModel[key].cost += e.cost.usd || 0;
    byModel[key].tokens.input += e.cost.tokensIn || 0;
    byModel[key].tokens.output += e.cost.tokensOut || 0;
    byModel[key].tokens.cacheRead += e.cost.cacheReadTokens || 0;
    byModel[key].tokens.cacheCreation += e.cost.cacheCreationTokens || 0;
    // Legacy's cost-indexer groups sessions by the stored `r.sessionId`
    // which for subagents is the agent id, not the parent. Mirror that by
    // using the raw conversationId (parents keep their id; sidechains
    // carry `<parent>:sub:<agent>`). The key question for parity is
    // "do legacy and store count the same number of distinct sessions
    // per model" — as long as both use the same grouping, yes.
    modelSessions[key].add(rootConversationId(e.conversationId));
  }
  for (const key of Object.keys(byModel)) {
    byModel[key].sessions = modelSessions[key].size;
    byModel[key].cost = round3(byModel[key].cost);
  }

  // ---- By project ----
  // Derive projectKey from event metadata.sessionPath. Legacy's byProject
  // uses `storage.getEntities("project")` to resolve a human name; absent
  // that lookup (e.g. in tests with no storage entities), legacy falls
  // back to the raw encoded key for `projectName`. We match that exactly.
  const projCost: Record<string, { cost: number; sessions: Set<string> }> = {};
  for (const e of windowEvents) {
    if (e.cost === null) continue;
    const projectKey = projectKeyFromPath(
      (e.metadata?.sessionPath as string | undefined) || null
    );
    if (!projectKey) continue;
    if (!projCost[projectKey])
      projCost[projectKey] = { cost: 0, sessions: new Set() };
    projCost[projectKey].cost += e.cost.usd || 0;
    projCost[projectKey].sessions.add(rootConversationId(e.conversationId));
  }
  const byProject = Object.entries(projCost)
    .map(([key, data]) => ({
      projectKey: key,
      projectName: key, // no storage lookup available here — see comment above
      cost: round3(data.cost),
      sessions: data.sessions.size,
    }))
    .sort((a, b) => b.cost - a.cost);

  // ---- By day ----
  const dayCost: Record<
    string,
    { cost: number; compute: number; cache: number }
  > = {};
  for (const e of windowEvents) {
    if (e.cost === null) continue;
    const d = utcDay(e.timestamp);
    if (!dayCost[d]) dayCost[d] = { cost: 0, compute: 0, cache: 0 };
    const pricing = getPricing(e.cost.model || '');
    const input = e.cost.tokensIn || 0;
    const output = e.cost.tokensOut || 0;
    const cacheRead = e.cost.cacheReadTokens || 0;
    const cacheCreation = e.cost.cacheCreationTokens || 0;
    const computePart =
      (input * pricing.input + output * pricing.output) / 1_000_000;
    const cachePart =
      (cacheRead * pricing.cacheRead + cacheCreation * pricing.cacheCreation) /
      1_000_000;
    dayCost[d].cost += e.cost.usd || 0;
    dayCost[d].compute += computePart;
    dayCost[d].cache += cachePart;
  }
  const byDay = Object.entries(dayCost)
    .map(([date, data]) => ({
      date,
      cost: round3(data.cost),
      computeCost: round3(data.compute),
      cacheCost: round3(data.cache),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- Top sessions ----
  // Mirror legacy: aggregate by root id (parents + their sidechains roll
  // up into the parent slot). `subagentCost` is the cost attributable to
  // sidechain conversations under that root. `subagentCount` is the
  // number of distinct sidechain conversation ids.
  interface TopSessionAccum {
    cost: number;
    tokens: CostTokenBreakdown;
    model: string;
    subagentCost: number;
  }
  const sessionCosts = new Map<string, TopSessionAccum>();
  const subagentSessions = new Map<string, Set<string>>();
  for (const e of windowEvents) {
    if (e.cost === null) continue;
    const rootId = rootConversationId(e.conversationId);
    const isSub = e.conversationId !== rootId;
    let accum = sessionCosts.get(rootId);
    if (!accum) {
      accum = { cost: 0, tokens: emptyTokens(), model: '', subagentCost: 0 };
      sessionCosts.set(rootId, accum);
    }
    accum.cost += e.cost.usd || 0;
    accum.tokens.input += e.cost.tokensIn || 0;
    accum.tokens.output += e.cost.tokensOut || 0;
    accum.tokens.cacheRead += e.cost.cacheReadTokens || 0;
    accum.tokens.cacheCreation += e.cost.cacheCreationTokens || 0;
    if (isSub) {
      accum.subagentCost += e.cost.usd || 0;
      if (!subagentSessions.has(rootId)) subagentSessions.set(rootId, new Set());
      subagentSessions.get(rootId)!.add(e.conversationId);
    } else if (!accum.model && e.cost.model) {
      accum.model = e.cost.model;
    }
  }
  const topSessions = Array.from(sessionCosts.entries())
    .map(([sid, data]) => ({
      sessionId: sid,
      firstMessage: '', // store doesn't persist firstMessage — see rollupToSessionData
      model: data.model || 'unknown',
      cost: round3(data.cost),
      subagentCount: subagentSessions.get(sid)?.size || 0,
      subagentCost: round3(data.subagentCost),
      tokens: data.tokens,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  return {
    totalCost: round3(totalCost),
    totalTokens,
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
}

/**
 * Strip the `:sub:<agentId>` suffix to get the parent (root) conversation
 * id. Non-sidechain ids pass through unchanged.
 */
function rootConversationId(conversationId: string): string {
  const idx = conversationId.indexOf(SUBAGENT_ID_SEPARATOR);
  return idx === -1 ? conversationId : conversationId.slice(0, idx);
}
