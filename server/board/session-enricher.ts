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
import { sessionParseCache } from "../scanner/session-cache";
import type { SessionData } from "@shared/types";
import type { SessionEnrichment, LastSessionSnapshot } from "@shared/board-types";
import type { TaskItem } from "@shared/task-types";
import type { ParsedSession } from "@shared/session-types";

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
    healthReasons: enrichment.healthReasons,
    totalToolCalls: enrichment.totalToolCalls,
    retries: enrichment.retries,
    cacheHitRate: enrichment.cacheHitRate,
    maxTokensStops: enrichment.maxTokensStops,
    webRequests: enrichment.webRequests,
    sidechainCount: enrichment.sidechainCount,
    turnCount: enrichment.turnCount,
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
export function enrichTaskSession(sessionId: string | undefined, sessions?: SessionData[], task?: TaskItem): SessionEnrichment | null {
  // Auto-link fallback: when no manual sessionId, try to find one by matching signals
  if (!sessionId && task) {
    const allParsed = sessionParseCache.getAll();
    const autoLinkedId = autoLinkSession(task, allParsed);
    if (autoLinkedId) sessionId = autoLinkedId;
  }

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

  // Detail fields from parsed session cache and health data
  const parsed = sessionParseCache.getById(sessionId);

  const healthReasons = health?.healthReasons ?? [];
  const totalToolCalls = health?.totalToolCalls ?? 0;
  const retries = health?.retries ?? 0;

  // Cache hit rate from cost data
  const cacheRead = cost?.cacheReadTokens ?? 0;
  const cacheCreation = cost?.cacheCreationTokens ?? 0;
  const cacheTotal = cacheRead + cacheCreation;
  const cacheHitRate = cacheTotal > 0 ? cacheRead / cacheTotal : null;

  // Fields from parsed session (safe defaults when null)
  let maxTokensStops = 0;
  let webRequests = 0;
  let sidechainCount = 0;
  let turnCount = 0;

  if (parsed) {
    maxTokensStops = parsed.assistantMessages.filter(
      m => m.stopReason === "max_tokens"
    ).length;

    webRequests = parsed.assistantMessages.reduce((sum, m) => {
      const stu = m.usage.serverToolUse;
      return sum + (stu.webSearchRequests ?? 0) + (stu.webFetchRequests ?? 0);
    }, 0);

    sidechainCount = parsed.counts.sidechainMessages;
    turnCount = parsed.systemEvents.turnDurations.length;
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
    agentRole,
    healthReasons,
    totalToolCalls,
    retries,
    cacheHitRate,
    maxTokensStops,
    webRequests,
    sidechainCount,
    turnCount,
  };
}

/**
 * Score parsed sessions against a task and return the best-matching sessionId.
 *
 * Signals (additive):
 *  - Git branch contains task ID  (weight 0.5)
 *  - Git branch contains milestone name (weight 0.2)
 *  - File path overlap between session toolTimeline and task touches: labels (weight 0.3)
 *  - Session started within 10 minutes of task.updated (weight 0.2)
 *
 * Returns the sessionId with the highest score above the 0.4 threshold,
 * or null if nothing qualifies. Tie-break: most recent session (latest lastTs).
 */
export function autoLinkSession(
  task: TaskItem,
  parsedSessions: Map<string, ParsedSession>,
): string | null {
  const THRESHOLD = 0.4;
  const taskIdLower = task.id.toLowerCase();

  // Extract touches: paths from labels
  const touchPaths = (task.labels ?? [])
    .filter(l => l.startsWith("touches:"))
    .map(l => l.slice("touches:".length));

  const milestoneName = task.parent ?? "";

  let bestId: string | null = null;
  let bestScore = 0;
  let bestLastTs = "";

  const sessionIds = Array.from(parsedSessions.keys());
  for (let i = 0; i < sessionIds.length; i++) {
    const sessionId = sessionIds[i];
    const parsed = parsedSessions.get(sessionId)!;
    let score = 0;
    const branch = parsed.meta.gitBranch.toLowerCase();

    // Signal 1: branch contains task ID (0.5)
    if (branch.includes(taskIdLower)) {
      score += 0.5;
    }

    // Signal 2: branch contains milestone name (0.2)
    if (milestoneName && branch.includes(milestoneName.toLowerCase())) {
      score += 0.2;
    }

    // Signal 3: file path overlap (0.3)
    if (touchPaths.length > 0) {
      const sessionFilePaths: string[] = [];
      for (let j = 0; j < parsed.toolTimeline.length; j++) {
        const fp = parsed.toolTimeline[j].filePath;
        if (fp !== null && sessionFilePaths.indexOf(fp) === -1) {
          sessionFilePaths.push(fp);
        }
      }
      let matched = 0;
      for (const tp of touchPaths) {
        for (const sf of sessionFilePaths) {
          if (sf === tp || sf.endsWith("/" + tp) || tp.endsWith("/" + sf)) {
            matched++;
            break;
          }
        }
      }
      score += 0.3 * (matched / touchPaths.length);
    }

    // Signal 4: timing correlation (0.2)
    if (task.updated && parsed.meta.firstTs) {
      const taskUpdated = new Date(task.updated).getTime();
      const sessionStart = new Date(parsed.meta.firstTs).getTime();
      const diffMs = Math.abs(sessionStart - taskUpdated);
      if (diffMs <= 10 * 60 * 1000) {
        score += 0.2;
      }
    }

    if (score < THRESHOLD) continue;

    const lastTs = parsed.meta.lastTs ?? "";
    if (
      score > bestScore ||
      (score === bestScore && lastTs > bestLastTs)
    ) {
      bestScore = score;
      bestId = sessionId;
      bestLastTs = lastTs;
    }
  }

  return bestId;
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
