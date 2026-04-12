import type {
  SessionData, SessionCostData, CostAnalytics,
  FileHeatmapEntry, FileHeatmapResult,
  SessionHealth, HealthAnalytics, StaleAnalytics,
} from "@shared/types";
import { getPricing, computeCost } from "./pricing";
import { sessionParseCache } from "./session-cache";
import type { ParsedSession, AssistantTurnNode, ToolCallNode } from "@shared/session-types";

// Alias for backward compat within this file
const calcCost = computeCost;

// Default context window size for models (tokens)
const DEFAULT_CONTEXT_WINDOW = 200000;

/** Input data for computing health reason tags */
export interface HealthReasonInput {
  toolErrors: number;
  retries: number;
  totalToolCalls: number;
  messageCount: number;
  estimatedCostUsd: number;
  totalTokens: number;
  maxContextTokens: number;
  messageTimestamps: string[];
  allSessionCosts: number[];
}

/**
 * Compute health reason tags for a session.
 * A session can have multiple reasons (they're tags, not categories).
 * Healthy sessions get an empty array.
 */
export function computeHealthReasons(input: HealthReasonInput): string[] {
  const reasons: string[] = [];

  // "high error rate" — error count > 10% of messages
  if (input.messageCount > 0 && input.toolErrors / input.messageCount > 0.1) {
    reasons.push("high error rate");
  }

  // "excessive retries" — retries above threshold (same as health score "poor" threshold)
  if (input.retries > 8) {
    reasons.push("excessive retries");
  }

  // "context overflow" — token usage >= 80% of context limit
  if (input.maxContextTokens > 0 && input.totalTokens / input.maxContextTokens >= 0.8) {
    reasons.push("context overflow");
  }

  // "long idle gaps" — any gap > 5 minutes between consecutive messages
  if (input.messageTimestamps.length >= 2) {
    const sorted = input.messageTimestamps
      .map(ts => new Date(ts).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
    const FIVE_MINUTES = 5 * 60 * 1000;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > FIVE_MINUTES) {
        reasons.push("long idle gaps");
        break;
      }
    }
  }

  // "high cost" — session cost above 90th percentile
  if (input.allSessionCosts.length > 0 && input.estimatedCostUsd > 0) {
    const sortedCosts = [...input.allSessionCosts].sort((a, b) => a - b);
    const p90Index = Math.floor(sortedCosts.length * 0.9);
    const p90Value = sortedCosts[Math.min(p90Index, sortedCosts.length - 1)];
    if (input.estimatedCostUsd > p90Value) {
      reasons.push("high cost");
    }
  }

  // "short session" — fewer than 3 messages
  if (input.messageCount < 3) {
    reasons.push("short session");
  }

  return reasons;
}

interface RawAnalytics {
  cost: SessionCostData;
  files: Map<string, { read: number; write: number; edit: number; lastTs: string; sessions: Set<string> }>;
  health: SessionHealth;
  messageTimestamps: string[];
  totalTokens: number;
}

/**
 * Scan a single session for cost, file ops, and health data.
 *
 * Two code paths:
 *
 * 1. **Tree path (preferred):** when `sessionParseCache.getTreeById()` returns
 *    a populated `SessionTree`, cost / tokens / per-model breakdown / tool
 *    counts come from the tree so subagent activity is included. The flat
 *    `parsed.toolTimeline` is still walked for file-ops + retry detection
 *    because file-heatmap aggregation only cares about parent-session
 *    file activity (subagent file ops are intentionally out of scope here).
 *
 * 2. **Flat fallback:** when no tree is cached we warn once and run the
 *    legacy parent-only aggregation. Preserves graceful degradation for any
 *    code path that primes the parsed cache without going through
 *    `parseSessionAndBuildTree`.
 */
function analyzeSession(session: SessionData): RawAnalytics | null {
  // Get the comprehensive parsed data from cache (still needed for file ops
  // + retry detection regardless of which aggregation path runs).
  const parsed = sessionParseCache.getOrParse(session.filePath, session.projectKey);
  if (!parsed) return null;

  const tree = sessionParseCache.getTreeById(parsed.meta.sessionId);

  // --- File ops & retry detection (shared by both paths) ---
  const fileOps = new Map<string, { read: number; write: number; edit: number; lastTs: string }>();
  let lastEditFile = "";
  let lastEditTs = 0;
  let retries = 0;

  for (const exec of parsed.toolTimeline) {
    const toolName = exec.name.toLowerCase();
    const fp = exec.filePath;
    if (fp && (toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "glob")) {
      const existing = fileOps.get(fp) || { read: 0, write: 0, edit: 0, lastTs: "" };
      if (toolName === "read") existing.read++;
      else if (toolName === "write") existing.write++;
      else if (toolName === "edit") existing.edit++;
      if (exec.timestamp > existing.lastTs) existing.lastTs = exec.timestamp;
      fileOps.set(fp, existing);

      if (toolName === "edit" || toolName === "write") {
        const now = new Date(exec.timestamp).getTime();
        if (fp === lastEditFile && now - lastEditTs < 60000) {
          retries++;
        }
        lastEditFile = fp;
        lastEditTs = now;
      }
    }
  }

  // --- Aggregate cost / tokens / model breakdown / health counts ---
  const modelBreakdown: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number; cost: number }> = {};
  const modelsSet = new Set<string>();
  const messageTimestamps: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let totalCost = 0;
  let toolErrors = 0;
  let totalToolCalls = 0;

  if (tree) {
    // Tree path: walk every assistant-turn / tool-call node so subagent
    // activity is rolled into the breakdown and totals.
    Array.from(tree.nodesById.values()).forEach((node) => {
      if (node.kind === "assistant-turn") {
        const turn = node as AssistantTurnNode;
        if (turn.timestamp) messageTimestamps.push(turn.timestamp);

        const model = turn.model || "unknown";
        modelsSet.add(model);

        if (!modelBreakdown[model]) {
          modelBreakdown[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
        }
        modelBreakdown[model].input += turn.usage.inputTokens;
        modelBreakdown[model].output += turn.usage.outputTokens;
        modelBreakdown[model].cacheRead += turn.usage.cacheReadTokens;
        modelBreakdown[model].cacheCreation += turn.usage.cacheCreationTokens;
        modelBreakdown[model].cost += turn.selfCost.costUsd;
      } else if (node.kind === "tool-call") {
        const call = node as ToolCallNode;
        totalToolCalls++;
        if (call.isError) toolErrors++;
      } else if (node.kind === "user-turn") {
        if (node.timestamp) messageTimestamps.push(node.timestamp);
      }
    });

    totalInput = tree.totals.inputTokens;
    totalOutput = tree.totals.outputTokens;
    totalCacheRead = tree.totals.cacheReadTokens;
    totalCacheCreation = tree.totals.cacheCreationTokens;
    totalCost = tree.totals.costUsd;
  } else {
    // Fallback: legacy flat aggregation over parent-session arrays only.
    console.warn(
      `[${parsed.meta.sessionId}] session-analytics: tree missing, falling back to flat arrays`,
    );

    for (const msg of parsed.assistantMessages) {
      if (msg.timestamp) messageTimestamps.push(msg.timestamp);

      const u = msg.usage;
      const model = msg.model || "unknown";
      modelsSet.add(model);

      totalInput += u.inputTokens;
      totalOutput += u.outputTokens;
      totalCacheRead += u.cacheReadTokens;
      totalCacheCreation += u.cacheCreationTokens;

      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 };
      }
      modelBreakdown[model].input += u.inputTokens;
      modelBreakdown[model].output += u.outputTokens;
      modelBreakdown[model].cacheRead += u.cacheReadTokens;
      modelBreakdown[model].cacheCreation += u.cacheCreationTokens;
    }

    for (const msg of parsed.userMessages) {
      if (msg.timestamp) messageTimestamps.push(msg.timestamp);
    }

    for (const exec of parsed.toolTimeline) {
      totalToolCalls++;
      if (exec.isError) toolErrors++;
    }

    // Legacy path costs are computed per-model from pricing tables; the tree
    // path already carries selfCost so we only do this in the fallback.
    for (const [model, data] of Object.entries(modelBreakdown)) {
      const pricing = getPricing(model);
      data.cost = calcCost(pricing, data.input, data.output, data.cacheRead, data.cacheCreation);
      totalCost += data.cost;
    }
  }

  // Health score
  let healthScore: "good" | "fair" | "poor" = "good";
  if (toolErrors > 10 || retries > 8) healthScore = "poor";
  else if (toolErrors > 3 || retries > 3) healthScore = "fair";

  // Build file map with session ID
  const filesWithSession = new Map<string, { read: number; write: number; edit: number; lastTs: string; sessions: Set<string> }>();
  fileOps.forEach((ops, fp) => {
    filesWithSession.set(fp, { ...ops, sessions: new Set([session.id]) });
  });

  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheCreation;

  return {
    cost: {
      sessionId: session.id,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation,
      estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
      models: Array.from(modelsSet),
      modelBreakdown,
    },
    files: filesWithSession,
    health: {
      sessionId: session.id,
      toolErrors,
      retries,
      totalToolCalls,
      healthScore,
    },
    messageTimestamps,
    totalTokens,
  };
}

// Cache
let cachedCostAnalytics: CostAnalytics | null = null;
let cachedFileHeatmap: FileHeatmapResult | null = null;
let cachedHealthAnalytics: HealthAnalytics | null = null;
let cachedSessionCosts: Map<string, SessionCostData> = new Map();
let cachedSessionHealthMap: Map<string, SessionHealth> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function isCacheValid(): boolean {
  return Date.now() - cacheTimestamp < CACHE_TTL;
}

function runFullScan(sessions: SessionData[]): void {
  const start = performance.now();
  const nonEmpty = sessions.filter(s => !s.isEmpty && s.messageCount > 0);

  const allCosts: SessionCostData[] = [];
  const globalFiles = new Map<string, { read: number; write: number; edit: number; lastTs: string; sessions: Set<string> }>();
  const allHealth: SessionHealth[] = [];
  const costMap = new Map<string, SessionCostData>();

  // Collect raw results for health reason second pass
  const rawResults: Array<{ session: SessionData; result: RawAnalytics }> = [];

  // Project breakdown
  const byProject: Record<string, { cost: number; sessions: number; tokens: number }> = {};
  const byDay: Record<string, { cost: number; sessions: number; tokens: number }> = {};
  const byModel: Record<string, { cost: number; tokens: number; sessions: number }> = {};

  for (const session of nonEmpty) {
    const result = analyzeSession(session);
    if (!result) continue;

    allCosts.push(result.cost);
    costMap.set(session.id, result.cost);
    rawResults.push({ session, result });

    // Merge file ops
    result.files.forEach((ops, fp) => {
      const existing = globalFiles.get(fp);
      if (existing) {
        existing.read += ops.read;
        existing.write += ops.write;
        existing.edit += ops.edit;
        if (ops.lastTs > existing.lastTs) existing.lastTs = ops.lastTs;
        Array.from(ops.sessions).forEach(sid => existing.sessions.add(sid));
      } else {
        globalFiles.set(fp, { ...ops, sessions: new Set(Array.from(ops.sessions)) });
      }
    });

    // Aggregate by project
    const proj = session.projectKey || "unknown";
    if (!byProject[proj]) byProject[proj] = { cost: 0, sessions: 0, tokens: 0 };
    byProject[proj].cost += result.cost.estimatedCostUsd;
    byProject[proj].sessions++;
    byProject[proj].tokens += result.cost.inputTokens + result.cost.outputTokens;

    // Aggregate by day
    const day = (session.firstTs || "").slice(0, 10);
    if (day) {
      if (!byDay[day]) byDay[day] = { cost: 0, sessions: 0, tokens: 0 };
      byDay[day].cost += result.cost.estimatedCostUsd;
      byDay[day].sessions++;
      byDay[day].tokens += result.cost.inputTokens + result.cost.outputTokens;
    }

    // Aggregate by model
    for (const [model, data] of Object.entries(result.cost.modelBreakdown)) {
      if (!byModel[model]) byModel[model] = { cost: 0, tokens: 0, sessions: 0 };
      byModel[model].cost += data.cost;
      byModel[model].tokens += data.input + data.output;
      byModel[model].sessions++;
    }
  }

  // Second pass: compute health reasons now that we have all session costs for percentile
  const allSessionCosts = allCosts.map(c => c.estimatedCostUsd);
  for (const { session, result } of rawResults) {
    const reasons = computeHealthReasons({
      toolErrors: result.health.toolErrors,
      retries: result.health.retries,
      totalToolCalls: result.health.totalToolCalls,
      messageCount: session.messageCount,
      estimatedCostUsd: result.cost.estimatedCostUsd,
      totalTokens: result.totalTokens,
      maxContextTokens: DEFAULT_CONTEXT_WINDOW,
      messageTimestamps: result.messageTimestamps,
      allSessionCosts,
    });
    const healthWithReasons: SessionHealth = {
      ...result.health,
      healthReasons: reasons,
      projectKey: session.projectKey || undefined,
      lastTs: session.lastTs || undefined,
      estimatedCostUsd: result.cost.estimatedCostUsd,
    };
    allHealth.push(healthWithReasons);
  }

  const durationMs = Math.round(performance.now() - start);

  // Build cost analytics
  const totalCost = allCosts.reduce((s, c) => s + c.estimatedCostUsd, 0);
  const totalInput = allCosts.reduce((s, c) => s + c.inputTokens, 0);
  const totalOutput = allCosts.reduce((s, c) => s + c.outputTokens, 0);

  const topSessions = allCosts
    .filter(c => c.estimatedCostUsd > 0)
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, 20)
    .map(c => {
      const sess = sessions.find(s => s.id === c.sessionId);
      return {
        sessionId: c.sessionId,
        firstMessage: (sess?.firstMessage || "").slice(0, 100),
        cost: Math.round(c.estimatedCostUsd * 10000) / 10000,
        tokens: c.inputTokens + c.outputTokens,
      };
    });

  const byDayArr = Object.entries(byDay)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Round costs
  for (const key of Object.keys(byProject)) {
    byProject[key].cost = Math.round(byProject[key].cost * 10000) / 10000;
  }
  for (const key of Object.keys(byModel)) {
    byModel[key].cost = Math.round(byModel[key].cost * 10000) / 10000;
  }
  for (const d of byDayArr) {
    d.cost = Math.round(d.cost * 10000) / 10000;
  }

  cachedCostAnalytics = {
    totalCostUsd: Math.round(totalCost * 10000) / 10000,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalSessions: nonEmpty.length,
    byProject,
    byDay: byDayArr,
    byModel,
    topSessions,
    durationMs,
  };

  // Build file heatmap
  const fileEntries: FileHeatmapEntry[] = [];
  let totalOps = 0;
  globalFiles.forEach((ops, fp) => {
    const parts = fp.replace(/\\/g, "/").split("/");
    const total = ops.read + ops.write + ops.edit;
    totalOps += total;
    fileEntries.push({
      filePath: fp,
      fileName: parts[parts.length - 1] || fp,
      touchCount: total,
      sessionCount: ops.sessions.size,
      operations: { read: ops.read, write: ops.write, edit: ops.edit },
      lastTouched: ops.lastTs,
      sessions: Array.from(ops.sessions),
    });
  });
  fileEntries.sort((a, b) => b.touchCount - a.touchCount);

  cachedFileHeatmap = {
    files: fileEntries.slice(0, 100),
    totalFiles: fileEntries.length,
    totalOperations: totalOps,
    durationMs,
  };

  // Build health analytics
  let poorCount = 0, fairCount = 0, goodCount = 0;
  let totalErrors = 0, totalRetries = 0;
  for (const h of allHealth) {
    if (h.healthScore === "poor") poorCount++;
    else if (h.healthScore === "fair") fairCount++;
    else goodCount++;
    totalErrors += h.toolErrors;
    totalRetries += h.retries;
  }

  cachedHealthAnalytics = {
    sessions: allHealth.filter(h => h.healthScore !== "good").sort((a, b) => b.toolErrors - a.toolErrors).slice(0, 50),
    avgToolErrors: allHealth.length ? Math.round(totalErrors / allHealth.length * 10) / 10 : 0,
    avgRetries: allHealth.length ? Math.round(totalRetries / allHealth.length * 10) / 10 : 0,
    poorCount,
    fairCount,
    goodCount,
    durationMs,
  };

  cachedSessionCosts = costMap;
  cachedSessionHealthMap = new Map(allHealth.map(h => [h.sessionId, h]));
  cacheTimestamp = Date.now();
}

export function getCostAnalytics(sessions: SessionData[]): CostAnalytics {
  if (!isCacheValid()) runFullScan(sessions);
  return cachedCostAnalytics!;
}

export function getFileHeatmap(sessions: SessionData[]): FileHeatmapResult {
  if (!isCacheValid()) runFullScan(sessions);
  return cachedFileHeatmap!;
}

export function getHealthAnalytics(sessions: SessionData[]): HealthAnalytics {
  if (!isCacheValid()) runFullScan(sessions);
  return cachedHealthAnalytics!;
}

export function getSessionCost(sessions: SessionData[], sessionId: string): SessionCostData | null {
  if (!isCacheValid()) runFullScan(sessions);
  return cachedSessionCosts.get(sessionId) || null;
}

export function getSessionHealth(sessions: SessionData[], sessionId: string): SessionHealth | null {
  if (!isCacheValid()) runFullScan(sessions);
  return cachedSessionHealthMap.get(sessionId) || null;
}

export function getStaleAnalytics(sessions: SessionData[]): StaleAnalytics {
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const empty = sessions.filter(s => s.isEmpty).map(s => ({ id: s.id, sizeBytes: s.sizeBytes }));
  const stale = sessions
    .filter(s => !s.isEmpty && s.messageCount < 5 && (s.lastTs || "") < THIRTY_DAYS_AGO)
    .map(s => ({
      id: s.id,
      firstMessage: (s.firstMessage || "").slice(0, 100),
      lastTs: s.lastTs || "",
      messageCount: s.messageCount,
      sizeBytes: s.sizeBytes,
    }));

  const reclaimableBytes = empty.reduce((s, e) => s + e.sizeBytes, 0) +
    stale.reduce((s, e) => s + e.sizeBytes, 0);

  return {
    stale,
    empty,
    totalStale: stale.length,
    totalEmpty: empty.length,
    reclaimableBytes,
  };
}
