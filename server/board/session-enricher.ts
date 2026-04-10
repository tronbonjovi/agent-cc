// server/board/session-enricher.ts
//
// Cost Granularity Investigation (card-overhaul-task001)
// ──────────────────────────────────────────────────────
// Finding: Cost data is SESSION-LEVEL only. Here's why:
//
// 1. Claude Code stores subagent JSONL files at:
//      <project>/<session-uuid>/subagents/agent-<id>.jsonl
//    Each subagent file has its own `usage` blocks (input/output tokens, model).
//
// 2. However, the `sessionId` written into task frontmatter by workflow-framework
//    is always the PARENT session UUID, not a subagent ID. Multiple tasks often
//    share the same parent session.
//
// 3. The session scanner (session-scanner.ts) only reads top-level .jsonl files
//    in project directories — it does not recurse into subagent subdirectories.
//
// 4. session-analytics.ts computes cost by reading the parent session's JSONL,
//    which contains only the orchestrator's usage, NOT the subagent usage. The
//    subagent usage lives in separate files under the subagents/ directory.
//
// 5. To get per-task cost, we would need:
//    (a) workflow-framework to write `agentId` into task frontmatter
//    (b) scanner to read subagent JSONL files and index them by agentId
//    This is a cross-project change that doesn't exist today.
//
// Decision: Display cost with a "(session)" qualifier label and tooltip to
// set expectations that the cost covers the full session, not just one task.

import { getCachedSessions } from "../scanner/session-scanner";
import { getSessionCost, getSessionHealth } from "../scanner/session-analytics";
import { getCachedExecutions } from "../scanner/agent-scanner";
import type { SessionData } from "@shared/types";
import type { SessionEnrichment, LastSessionSnapshot } from "@shared/board-types";

/**
 * In-memory cache of session snapshots keyed by task ID.
 * Persists across aggregation cycles so completed tasks retain their
 * session metadata even after the live session data is no longer available.
 */
const snapshotCache = new Map<string, LastSessionSnapshot>();

/** Build a LastSessionSnapshot from a SessionEnrichment. */
export function buildSessionSnapshot(enrichment: SessionEnrichment): LastSessionSnapshot {
  return {
    model: enrichment.model,
    agentRole: enrichment.agentRole,
    messageCount: enrichment.messageCount,
    durationMinutes: enrichment.durationMinutes,
    inputTokens: enrichment.inputTokens,
    outputTokens: enrichment.outputTokens,
    costUsd: enrichment.costUsd,
  };
}

/** Store a snapshot for a task. Called by the aggregator when enrichment succeeds. */
export function cacheSnapshot(taskId: string, snapshot: LastSessionSnapshot): void {
  snapshotCache.set(taskId, snapshot);
}

/** Retrieve a cached snapshot for a task. Returns undefined if none cached. */
export function getCachedSnapshot(taskId: string): LastSessionSnapshot | undefined {
  return snapshotCache.get(taskId);
}

/** Clear the snapshot cache (for testing). */
export function clearSnapshotCache(): void {
  snapshotCache.clear();
}

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

  // Agent role: find the most recent subagent execution for this session.
  // agentType comes from .meta.json files in subagent directories (e.g. "Explore",
  // "Plan", "general-purpose"). The parent session itself has no role — it's the
  // orchestrator. We surface the most recent subagent's type as the "agent role"
  // to show what the session is currently doing.
  const agentRole = getMostRecentAgentRole(sessionId);

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
    agentRole,
  };
}

/**
 * Find the most recent agent execution for a session and return its agentType.
 * Returns null if no executions exist or none have an agentType.
 */
function getMostRecentAgentRole(sessionId: string): string | null {
  const executions = getCachedExecutions();
  const sessionExecs = executions.filter(e => e.sessionId === sessionId && e.agentType);
  if (sessionExecs.length === 0) return null;

  // Pick the one with the most recent lastTs
  sessionExecs.sort((a, b) => (b.lastTs || "").localeCompare(a.lastTs || ""));
  return sessionExecs[0].agentType;
}
