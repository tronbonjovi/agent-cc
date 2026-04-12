/**
 * Session & project value analysis — per-project cost breakdown,
 * most expensive sessions, most efficient sessions, and per-session metrics.
 */

import { getPricing, computeCost } from "./pricing";
import { sessionParseCache } from "./session-cache";
import type { ParsedSession, SessionTree } from "@shared/session-types";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ProjectRow {
  project: string;
  sessions: number;
  tokens: number;
  avgDepth: number;
  cost: number;
}

export interface ExpensiveSession {
  sessionId: string;
  firstMessage: string;
  model: string;
  healthScore: "good" | "fair" | "poor";
  cost: number;
}

export interface EfficientSession {
  sessionId: string;
  firstMessage: string;
  messageCount: number;
  tokens: number;
  efficiency: number;
}

export interface SessionProjectValueResult {
  byProject: ProjectRow[];
  topExpensive: ExpensiveSession[];
  topEfficient: EfficientSession[];
  avgTokensPerTurn: number;
  avgOutputInputRatio: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, max = 100): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Compute a simple health score from tool error counts (matches session-analytics logic). */
function deriveHealthScore(toolErrors: number): "good" | "fair" | "poor" {
  if (toolErrors > 10) return "poor";
  if (toolErrors > 3) return "fair";
  return "good";
}

/** Sum all token fields for a session's assistant messages (flat fallback). */
function sessionTotalTokensFlat(session: ParsedSession): number {
  let total = 0;
  for (const msg of session.assistantMessages) {
    total += msg.usage.inputTokens + msg.usage.outputTokens
      + msg.usage.cacheReadTokens + msg.usage.cacheCreationTokens;
  }
  return total;
}

/** Compute API-equivalent cost for a whole session (flat fallback). */
function sessionCostFlat(session: ParsedSession): number {
  let cost = 0;
  for (const msg of session.assistantMessages) {
    const pricing = getPricing(msg.model || "unknown");
    cost += computeCost(
      pricing,
      msg.usage.inputTokens,
      msg.usage.outputTokens,
      msg.usage.cacheReadTokens,
      msg.usage.cacheCreationTokens,
    );
  }
  return cost;
}

/**
 * Per-session aggregate used by every downstream metric. Sourced from the
 * SessionTree when available so subagent spend and turns roll up; otherwise
 * falls back to the flat parent-only arrays with a warning. Output fields and
 * shapes are unchanged — only the inputs differ.
 */
interface SessionAggregate {
  cost: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  assistantTurns: number;
  userTurns: number;
  /** assistantTurns + userTurns — used as "depth" and as denominator. */
  messageCount: number;
}

function aggregateFromTree(tree: SessionTree): SessionAggregate {
  const tokens =
    tree.totals.inputTokens +
    tree.totals.outputTokens +
    tree.totals.cacheReadTokens +
    tree.totals.cacheCreationTokens;
  return {
    cost: tree.totals.costUsd,
    tokens,
    inputTokens: tree.totals.inputTokens,
    outputTokens: tree.totals.outputTokens,
    assistantTurns: tree.totals.assistantTurns,
    userTurns: tree.totals.userTurns,
    messageCount: tree.totals.assistantTurns + tree.totals.userTurns,
  };
}

function aggregateFromFlat(session: ParsedSession): SessionAggregate {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const msg of session.assistantMessages) {
    inputTokens += msg.usage.inputTokens;
    outputTokens += msg.usage.outputTokens;
  }
  return {
    cost: sessionCostFlat(session),
    tokens: sessionTotalTokensFlat(session),
    inputTokens,
    outputTokens,
    assistantTurns: session.counts.assistantMessages,
    userTurns: session.counts.userMessages,
    messageCount: session.counts.assistantMessages + session.counts.userMessages,
  };
}

/**
 * Resolve per-session aggregates, preferring tree totals (which include
 * subagent spend + turns) and falling back to the flat parent-only arrays
 * when no tree is cached. The fallback emits a single warning per session.
 */
function aggregateForSession(session: ParsedSession): SessionAggregate {
  const tree = sessionParseCache.getTreeById(session.meta.sessionId);
  if (tree) return aggregateFromTree(tree);
  console.warn(
    "session-project-value: tree missing, falling back to flat arrays",
    session.meta.sessionId,
  );
  return aggregateFromFlat(session);
}

/** Dominant model (most assistant messages). */
function dominantModel(session: ParsedSession): string {
  const counts = new Map<string, number>();
  for (const msg of session.assistantMessages) {
    const model = msg.model || "unknown";
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  let best = "unknown";
  let bestCount = 0;
  for (const [model, count] of Array.from(counts)) {
    if (count > bestCount) { best = model; bestCount = count; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeSessionProjectValue(sessions: ParsedSession[]): SessionProjectValueResult {
  if (sessions.length === 0) {
    return { byProject: [], topExpensive: [], topEfficient: [], avgTokensPerTurn: 0, avgOutputInputRatio: 0 };
  }

  // Resolve aggregates once per session — every downstream metric reads from
  // this map, so the tree lookup (and any flat-fallback warning) only fires
  // once per session per call.
  const aggregates = new Map<string, SessionAggregate>();
  for (const session of sessions) {
    aggregates.set(session.meta.sessionId, aggregateForSession(session));
  }
  const aggOf = (s: ParsedSession): SessionAggregate => aggregates.get(s.meta.sessionId)!;

  // ---- Per-project aggregation ----
  const projectMap = new Map<string, { sessions: number; tokens: number; cost: number; totalDepth: number }>();

  for (const session of sessions) {
    const agg = aggOf(session);
    const key = session.meta.projectKey;
    let proj = projectMap.get(key);
    if (!proj) {
      proj = { sessions: 0, tokens: 0, cost: 0, totalDepth: 0 };
      projectMap.set(key, proj);
    }
    proj.sessions += 1;
    proj.tokens += agg.tokens;
    proj.cost += agg.cost;
    proj.totalDepth += agg.messageCount;
  }

  const byProject: ProjectRow[] = Array.from(projectMap)
    .map(([project, data]) => ({
      project,
      sessions: data.sessions,
      tokens: data.tokens,
      avgDepth: data.sessions > 0 ? data.totalDepth / data.sessions : 0,
      cost: data.cost,
    }))
    .sort((a, b) => b.cost - a.cost);

  // ---- Top 10 most expensive sessions ----
  const sessionCosts = sessions.map(s => ({
    session: s,
    cost: aggOf(s).cost,
  }));
  sessionCosts.sort((a, b) => b.cost - a.cost);

  const topExpensive: ExpensiveSession[] = sessionCosts.slice(0, 10).map(({ session, cost }) => ({
    sessionId: session.meta.sessionId,
    firstMessage: truncate(session.meta.firstMessage),
    model: dominantModel(session),
    healthScore: deriveHealthScore(session.counts.toolErrors),
    cost,
  }));

  // ---- Top 5 most efficient sessions (messageCount / totalTokens, min 5 messages) ----
  const efficiencyCandidates = sessions
    .map(s => {
      const agg = aggOf(s);
      const mc = agg.messageCount;
      const tokens = agg.tokens;
      return { session: s, messageCount: mc, tokens, efficiency: tokens > 0 ? mc / tokens : 0 };
    })
    .filter(e => e.messageCount >= 5);

  efficiencyCandidates.sort((a, b) => b.efficiency - a.efficiency);

  const topEfficient: EfficientSession[] = efficiencyCandidates.slice(0, 5).map(e => ({
    sessionId: e.session.meta.sessionId,
    firstMessage: truncate(e.session.meta.firstMessage),
    messageCount: e.messageCount,
    tokens: e.tokens,
    efficiency: e.efficiency,
  }));

  // ---- Global averages ----
  let totalTokens = 0;
  let totalTurns = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const session of sessions) {
    const agg = aggOf(session);
    totalTokens += agg.tokens;
    totalInput += agg.inputTokens;
    totalOutput += agg.outputTokens;
    totalTurns += agg.assistantTurns;
  }

  const avgTokensPerTurn = totalTurns > 0 ? totalTokens / totalTurns : 0;
  const avgOutputInputRatio = totalInput > 0 ? totalOutput / totalInput : 0;

  return {
    byProject,
    topExpensive,
    topEfficient,
    avgTokensPerTurn,
    avgOutputInputRatio,
  };
}
