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
import type { SessionEnrichment, LastSessionSnapshot, AutoLinkResult } from "@shared/board-types";
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
  let autoLinkResult: AutoLinkResult | null = null;
  if (!sessionId && task) {
    const allParsed = sessionParseCache.getAll();
    autoLinkResult = autoLinkSession(task, allParsed);
    if (autoLinkResult) sessionId = autoLinkResult.sessionId;
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
    linkScore: autoLinkResult?.score,
    linkSignals: autoLinkResult?.signals,
  };
}

/**
 * Score parsed sessions against a task and return the best match with signal breakdown.
 *
 * Signals (additive):
 *  - Git branch contains task ID  (weight 0.5)
 *  - Git branch contains milestone name (weight 0.2, min 5 chars)
 *  - File path overlap incl. directory matching (weight 0.3)
 *  - Timing: session active during task update window (weight 0.2)
 *  - Command invocations mentioning task ID (weight 0.15)
 *  - Message content mentioning task ID or title (weight 0.2)
 *
 * Returns the best match above the 0.4 threshold with score breakdown,
 * or null if nothing qualifies. Tie-break: most recent session (latest lastTs).
 */
export function autoLinkSession(
  task: TaskItem,
  parsedSessions: Map<string, ParsedSession>,
): AutoLinkResult | null {
  const THRESHOLD = 0.4;
  const taskIdLower = task.id.toLowerCase();
  const taskTitleLower = (task.title ?? "").toLowerCase();

  // Extract touches: paths from labels, normalize trailing slashes
  const touchPaths = (task.labels ?? [])
    .filter(l => l.startsWith("touches:"))
    .map(l => l.slice("touches:".length).replace(/\/+$/, ""));

  const milestoneName = task.parent ?? "";

  let bestResult: AutoLinkResult | null = null;
  let bestLastTs = "";

  const sessionIds = Array.from(parsedSessions.keys());
  for (let i = 0; i < sessionIds.length; i++) {
    const sessionId = sessionIds[i];
    const parsed = parsedSessions.get(sessionId)!;
    let score = 0;
    const branch = parsed.meta.gitBranch.toLowerCase();

    const signals: AutoLinkResult["signals"] = [];

    // Signal 1: branch contains task ID (0.5)
    const branchTaskMatch = branch.includes(taskIdLower);
    if (branchTaskMatch) score += 0.5;
    signals.push({ name: "branch-task-id", weight: 0.5, matched: branchTaskMatch });

    // Signal 2: branch contains milestone name (0.2, min 5 chars for safety)
    const milestoneMatch = milestoneName.length > 4 && branch.includes(milestoneName.toLowerCase());
    if (milestoneMatch) score += 0.2;
    signals.push({ name: "branch-milestone", weight: 0.2, matched: milestoneMatch });

    // Signal 3: file path overlap with directory-level support (0.3)
    let fileMatchScore = 0;
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
          // Exact match or suffix match (existing)
          if (sf === tp || sf.endsWith("/" + tp) || tp.endsWith("/" + sf)) {
            matched++;
            break;
          }
          // Directory-level: if task touches a directory (no extension), match files under it
          if (!tp.includes(".") && (sf.startsWith(tp + "/") || sf === tp)) {
            matched++;
            break;
          }
        }
      }
      fileMatchScore = 0.3 * (matched / touchPaths.length);
      score += fileMatchScore;
    }
    signals.push({ name: "file-overlap", weight: 0.3, matched: fileMatchScore > 0 });

    // Signal 4: timing — session active during task update window (0.2)
    let timingMatch = false;
    if (task.updated) {
      const taskUpdated = new Date(task.updated).getTime();
      const sessionStart = parsed.meta.firstTs ? new Date(parsed.meta.firstTs).getTime() : null;
      const sessionEnd = parsed.meta.lastTs ? new Date(parsed.meta.lastTs).getTime() : null;
      const BUFFER_MS = 10 * 60 * 1000;

      if (sessionStart !== null && sessionEnd !== null) {
        // Session was active during task update (task.updated falls within session window)
        if (taskUpdated >= sessionStart && taskUpdated <= sessionEnd) {
          timingMatch = true;
        }
        // Session started within 10-minute buffer after task update
        else if (sessionStart > taskUpdated && sessionStart - taskUpdated <= BUFFER_MS) {
          timingMatch = true;
        }
      } else if (sessionStart !== null) {
        // Fallback: just check start proximity
        if (Math.abs(sessionStart - taskUpdated) <= BUFFER_MS) {
          timingMatch = true;
        }
      }
    }
    if (timingMatch) score += 0.2;
    signals.push({ name: "timing", weight: 0.2, matched: timingMatch });

    // Signal 5: command invocations mentioning task ID (0.15)
    let commandMatch = false;
    if (parsed.systemEvents.localCommands.length > 0) {
      for (const cmd of parsed.systemEvents.localCommands) {
        if (cmd.content.toLowerCase().includes(taskIdLower) || cmd.content.includes("/work-task")) {
          commandMatch = true;
          break;
        }
      }
    }
    if (commandMatch) score += 0.15;
    signals.push({ name: "command-invocation", weight: 0.15, matched: commandMatch });

    // Signal 6: message content mentions task ID or title (0.2)
    let messageMatch = false;
    if (taskTitleLower.length > 4) {
      for (const m of parsed.assistantMessages) {
        if (m.textPreview.toLowerCase().includes(taskIdLower) || m.textPreview.toLowerCase().includes(taskTitleLower)) {
          messageMatch = true;
          break;
        }
      }
      if (!messageMatch) {
        for (const m of parsed.userMessages) {
          if (m.textPreview.toLowerCase().includes(taskIdLower) || m.textPreview.toLowerCase().includes(taskTitleLower)) {
            messageMatch = true;
            break;
          }
        }
      }
    } else {
      // Title too short for substring match, only match task ID
      for (const m of parsed.assistantMessages) {
        if (m.textPreview.toLowerCase().includes(taskIdLower)) {
          messageMatch = true;
          break;
        }
      }
      if (!messageMatch) {
        for (const m of parsed.userMessages) {
          if (m.textPreview.toLowerCase().includes(taskIdLower)) {
            messageMatch = true;
            break;
          }
        }
      }
    }
    if (messageMatch) score += 0.2;
    signals.push({ name: "message-content", weight: 0.2, matched: messageMatch });

    if (score < THRESHOLD) continue;

    const lastTs = parsed.meta.lastTs ?? "";
    if (
      bestResult === null ||
      score > bestResult.score ||
      (score === bestResult.score && lastTs > bestLastTs)
    ) {
      bestResult = { sessionId, score, signals };
      bestLastTs = lastTs;
    }
  }

  return bestResult;
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
