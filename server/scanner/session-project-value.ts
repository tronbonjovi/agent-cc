/**
 * Session & project value analysis — per-project cost breakdown,
 * most expensive sessions, most efficient sessions, and per-session metrics.
 */

import { getPricing, computeCost } from "./pricing";
import type { ParsedSession } from "@shared/session-types";

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

/** Sum all token fields for a session's assistant messages. */
function sessionTotalTokens(session: ParsedSession): number {
  let total = 0;
  for (const msg of session.assistantMessages) {
    total += msg.usage.inputTokens + msg.usage.outputTokens
      + msg.usage.cacheReadTokens + msg.usage.cacheCreationTokens;
  }
  return total;
}

/** Compute API-equivalent cost for a whole session. */
function sessionCost(session: ParsedSession): number {
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

/** Total message count (assistant + user) for a session. */
function messageCount(session: ParsedSession): number {
  return session.counts.assistantMessages + session.counts.userMessages;
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

  // ---- Per-project aggregation ----
  const projectMap = new Map<string, { sessions: number; tokens: number; cost: number; totalDepth: number }>();

  for (const session of sessions) {
    const key = session.meta.projectKey;
    let proj = projectMap.get(key);
    if (!proj) {
      proj = { sessions: 0, tokens: 0, cost: 0, totalDepth: 0 };
      projectMap.set(key, proj);
    }
    proj.sessions += 1;
    proj.tokens += sessionTotalTokens(session);
    proj.cost += sessionCost(session);
    proj.totalDepth += messageCount(session);
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
    cost: sessionCost(s),
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
      const mc = messageCount(s);
      const tokens = sessionTotalTokens(s);
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
    for (const msg of session.assistantMessages) {
      totalTokens += msg.usage.inputTokens + msg.usage.outputTokens
        + msg.usage.cacheReadTokens + msg.usage.cacheCreationTokens;
      totalInput += msg.usage.inputTokens;
      totalOutput += msg.usage.outputTokens;
      totalTurns += 1;
    }
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
