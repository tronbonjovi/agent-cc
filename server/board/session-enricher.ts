// server/board/session-enricher.ts

import { getCachedSessions } from "../scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../scanner/session-analytics";
import type { SessionData } from "@shared/types";
import type { SessionEnrichment } from "@shared/board-types";

/**
 * Look up session data for a task and return enrichment fields.
 * Accepts an optional pre-fetched sessions array to avoid repeated array copies
 * when called in a loop (e.g., from the aggregator).
 * Returns null if no sessionId or session not found.
 */
export function enrichTaskSession(sessionId: string | undefined, sessions?: SessionData[]): SessionEnrichment | null {
  if (!sessionId) return null;

  const allSessions = sessions ?? getCachedSessions();
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return null;

  const cost = getSessionCost(allSessions, sessionId);
  const health = getSessionHealth(allSessions, sessionId);

  // Pick the model with the highest token count
  let primaryModel: string | null = null;
  if (cost?.modelBreakdown) {
    let maxTokens = 0;
    for (const [model, breakdown] of Object.entries(cost.modelBreakdown)) {
      const total = breakdown.input + breakdown.output;
      if (total > maxTokens) {
        maxTokens = total;
        primaryModel = model;
      }
    }
  }

  // Duration in minutes between first and last message
  let durationMinutes: number | null = null;
  if (session.firstTs && session.lastTs) {
    const diff = new Date(session.lastTs).getTime() - new Date(session.firstTs).getTime();
    if (diff >= 0) {
      durationMinutes = Math.round(diff / 60000);
    }
  }

  return {
    sessionId,
    isActive: session.isActive,
    model: primaryModel,
    lastActivity: null,
    lastActivityTs: session.lastTs,
    messageCount: session.messageCount,
    costUsd: cost?.estimatedCostUsd ?? 0,
    inputTokens: cost?.inputTokens ?? 0,
    outputTokens: cost?.outputTokens ?? 0,
    healthScore: health?.healthScore ?? null,
    toolErrors: health?.toolErrors ?? 0,
    durationMinutes,
  };
}
