/**
 * Chart Analytics Routes — Aggregation endpoints for the Charts tab.
 *
 * All cost/token aggregations prefer `SessionTree.totals` (subagent-inclusive)
 * with a graceful flat fallback to `ParsedSession.assistantMessages[].usage`
 * when no tree is cached.
 *
 * Query params (all endpoints):
 *   ?days=7|30|90|all   (default 30)
 *   ?projects=a,b,c     (filter by projectKey)
 *   ?models=a,b,c       (filter by model name substring)
 *
 * Cost/token endpoints additionally accept:
 *   ?breakdown=all|parent  (default "all")
 *     - all    → tree.totals (parent + subagents)
 *     - parent → tree.root.selfCost / parent-only assistant turns
 *
 * Charts wired up:
 *   /api/charts/tokens-over-time
 *   /api/charts/cache-over-time
 *   /api/charts/models
 *   /api/charts/sessions
 *   /api/charts/session-distributions
 *   /api/charts/stop-reasons
 *   /api/charts/tools
 *   /api/charts/files
 *   /api/charts/activity
 */

import { Router, type Request } from "express";
import { handleRouteError } from "../lib/route-errors";
import { getCachedSessions } from "../scanner/session-scanner";
import { sessionParseCache } from "../scanner/session-cache";
import type { SessionData } from "@shared/types";
import type {
  ParsedSession,
  SessionTree,
  SessionTreeNode,
  AssistantTurnNode,
  ToolCallNode,
  SubagentRootNode,
} from "@shared/session-types";

const router = Router();

// ---------------------------------------------------------------------------
// Query-param parsing
// ---------------------------------------------------------------------------

interface ChartFilters {
  cutoffIso: string | null; // null = "all"
  projects: Set<string> | null;
  models: Set<string> | null;
  breakdown: "all" | "parent";
}

function parseFilters(req: Request): ChartFilters {
  const daysRaw = (req.query.days as string) || "30";
  let cutoffIso: string | null = null;
  if (daysRaw !== "all") {
    const days = parseInt(daysRaw, 10);
    const safe = [7, 30, 90].includes(days) ? days : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - safe);
    cutoffIso = cutoff.toISOString();
  }

  const projectsRaw = req.query.projects as string | undefined;
  const projects = projectsRaw
    ? new Set(projectsRaw.split(",").map(p => p.trim()).filter(Boolean))
    : null;

  const modelsRaw = req.query.models as string | undefined;
  const models = modelsRaw
    ? new Set(modelsRaw.split(",").map(m => m.trim().toLowerCase()).filter(Boolean))
    : null;

  const breakdownRaw = (req.query.breakdown as string) || "all";
  const breakdown: "all" | "parent" = breakdownRaw === "parent" ? "parent" : "all";

  return { cutoffIso, projects, models, breakdown };
}

function passesFilters(s: SessionData, f: ChartFilters): boolean {
  if (f.cutoffIso) {
    const ts = s.firstTs || s.lastTs || "";
    if (!ts || ts < f.cutoffIso) return false;
  }
  if (f.projects && !f.projects.has(s.projectKey)) return false;
  // Note: f.models is NOT checked here — the models filter is session-level
  // and requires inspecting the tree/parsed payload, so it is applied in
  // loadSessions() after the metrics are resolved (see passesModelFilter).
  return true;
}

/**
 * Session-level model filter: include the session if ANY of its models
 * matches one of the requested models. Walks tree.nodesById for assistant-turn
 * nodes when a tree is present (so subagent models count too); otherwise walks
 * parsed.assistantMessages[].model. Comparison is case-insensitive.
 *
 * Returns true when no models filter is set, or when the session has at least
 * one matching model. Returns false when both tree and parsed are missing
 * (nothing to match against).
 */
function passesModelFilter(
  tree: SessionTree | null,
  parsed: ParsedSession | null,
  models: Set<string> | null,
): boolean {
  if (!models || models.size === 0) return true;
  if (tree) {
    const nodes = Array.from(tree.nodesById.values());
    for (const node of nodes) {
      if (node.kind !== "assistant-turn") continue;
      const model = (node as AssistantTurnNode).model || "unknown";
      if (models.has(model.toLowerCase())) return true;
    }
    return false;
  }
  if (parsed) {
    for (const m of parsed.assistantMessages) {
      const model = m.model || "unknown";
      if (models.has(model.toLowerCase())) return true;
    }
    return false;
  }
  return false;
}

function dayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Per-session metric helper (tree-preferred, flat fallback)
// ---------------------------------------------------------------------------

interface SessionMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  assistantTurns: number;
  toolCalls: number;
  toolErrors: number;
}

function metricsFromTree(tree: SessionTree, breakdown: "all" | "parent"): SessionMetrics {
  if (breakdown === "parent") {
    // Parent-only metrics: walk root.children's assistant-turn nodes
    // and sum their usage. selfCost on the root is intentionally zero,
    // so we have to walk the immediate parent turns ourselves.
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let costUsd = 0;
    let assistantTurns = 0;
    let toolCalls = 0;
    let toolErrors = 0;

    const visit = (node: SessionTreeNode): void => {
      // Only walk descendants of the parent session — stop at subagent roots.
      if (node.kind === "subagent-root") return;
      if (node.kind === "assistant-turn") {
        const turn = node as AssistantTurnNode;
        assistantTurns++;
        inputTokens += turn.usage.inputTokens;
        outputTokens += turn.usage.outputTokens;
        cacheReadTokens += turn.usage.cacheReadTokens;
        cacheCreationTokens += turn.usage.cacheCreationTokens;
        costUsd += turn.selfCost.costUsd;
      } else if (node.kind === "tool-call") {
        const call = node as ToolCallNode;
        toolCalls++;
        if (call.isError) toolErrors++;
      }
      for (const child of node.children || []) visit(child);
    };
    for (const child of tree.root.children) visit(child);

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd,
      assistantTurns,
      toolCalls,
      toolErrors,
    };
  }

  // breakdown === "all": tree.totals already includes subagent rollup
  return {
    inputTokens: tree.totals.inputTokens,
    outputTokens: tree.totals.outputTokens,
    cacheReadTokens: tree.totals.cacheReadTokens,
    cacheCreationTokens: tree.totals.cacheCreationTokens,
    costUsd: tree.totals.costUsd,
    assistantTurns: tree.totals.assistantTurns,
    toolCalls: tree.totals.toolCalls,
    toolErrors: tree.totals.toolErrors,
  };
}

function metricsFromFlat(parsed: ParsedSession): SessionMetrics {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let toolErrors = 0;

  for (const m of parsed.assistantMessages) {
    inputTokens += m.usage.inputTokens;
    outputTokens += m.usage.outputTokens;
    cacheReadTokens += m.usage.cacheReadTokens;
    cacheCreationTokens += m.usage.cacheCreationTokens;
  }
  for (const e of parsed.toolTimeline) {
    if (e.isError) toolErrors++;
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    // Cost not computed in fallback — left to callers if needed.
    // (cost-analytics route handles this elsewhere; charts that need
    // cost go through getMetricsForSession which prefers tree path.)
    costUsd: 0,
    assistantTurns: parsed.assistantMessages.length,
    toolCalls: parsed.toolTimeline.length,
    toolErrors,
  };
}

interface ResolvedSessionData {
  session: SessionData;
  parsed: ParsedSession | null;
  tree: SessionTree | null;
  metrics: SessionMetrics;
}

function getMetricsForSession(s: SessionData, breakdown: "all" | "parent"): ResolvedSessionData {
  const tree = sessionParseCache.getTreeByPath(s.filePath);
  const parsed = sessionParseCache.getByPath(s.filePath);
  let metrics: SessionMetrics;
  if (tree) {
    metrics = metricsFromTree(tree, breakdown);
  } else if (parsed) {
    if (breakdown === "all") {
      console.warn(
        `[chart-analytics] ${s.id}: tree missing, falling back to flat aggregation (parent-only)`,
      );
    }
    metrics = metricsFromFlat(parsed);
  } else {
    metrics = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      assistantTurns: 0,
      toolCalls: 0,
      toolErrors: 0,
    };
  }
  return { session: s, parsed, tree, metrics };
}

function loadSessions(filters: ChartFilters): ResolvedSessionData[] {
  const all = getCachedSessions().filter(s => !s.isEmpty && s.messageCount > 0);
  const filtered = all.filter(s => passesFilters(s, filters));
  const resolved = filtered.map(s => getMetricsForSession(s, filters.breakdown));
  // Apply session-level model filter after resolving tree/parsed payloads.
  // A session is included if ANY of its assistant turns (parent or subagent)
  // used one of the requested models.
  if (filters.models && filters.models.size > 0) {
    return resolved.filter(r => passesModelFilter(r.tree, r.parsed, filters.models));
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Helpers — bucketing
// ---------------------------------------------------------------------------

function bucketByDay<T>(
  items: T[],
  dateOf: (t: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(item);
  }
  return map;
}

function sortByDate<T extends { date: string }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Tool name normalization
// ---------------------------------------------------------------------------

function normalizeToolName(name: string): string {
  if (!name) return "Unknown";
  // Capitalize first letter so Read/read both render as "Read"
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// ---------------------------------------------------------------------------
// 1. tokens-over-time
// ---------------------------------------------------------------------------

router.get("/api/charts/tokens-over-time", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);
    const buckets = bucketByDay(sessions, s => dayKey(s.session.firstTs));

    const rows = Array.from(buckets.entries()).map(([date, list]) => {
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreationTokens = 0;
      for (const s of list) {
        inputTokens += s.metrics.inputTokens;
        outputTokens += s.metrics.outputTokens;
        cacheReadTokens += s.metrics.cacheReadTokens;
        cacheCreationTokens += s.metrics.cacheCreationTokens;
      }
      return {
        date,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        total: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
      };
    });

    res.json(sortByDate(rows));
  } catch (err) {
    handleRouteError(res, err, "routes/charts/tokens-over-time");
  }
});

// ---------------------------------------------------------------------------
// 2. cache-over-time
// ---------------------------------------------------------------------------

router.get("/api/charts/cache-over-time", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);
    const buckets = bucketByDay(sessions, s => dayKey(s.session.firstTs));

    const rows = Array.from(buckets.entries()).map(([date, list]) => {
      let cachedTokens = 0;
      let uncachedTokens = 0;
      for (const s of list) {
        // Convention used by costs/cache panel: cacheRead = "cache hits",
        // input = "cache misses" (the assistant had to read fresh).
        cachedTokens += s.metrics.cacheReadTokens;
        uncachedTokens += s.metrics.inputTokens;
      }
      const total = cachedTokens + uncachedTokens;
      const hitRate = total > 0 ? Math.round((cachedTokens / total) * 1000) / 10 : 0;
      return { date, hitRate, cachedTokens, uncachedTokens };
    });

    res.json(sortByDate(rows));
  } catch (err) {
    handleRouteError(res, err, "routes/charts/cache-over-time");
  }
});

// ---------------------------------------------------------------------------
// 3. models — model distribution per day (tree walk for subagent models)
// ---------------------------------------------------------------------------

router.get("/api/charts/models", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    // date → model → tokens
    const map = new Map<string, Map<string, number>>();

    for (const s of sessions) {
      const date = dayKey(s.session.firstTs);
      if (!date) continue;
      if (!map.has(date)) map.set(date, new Map());
      const inner = map.get(date)!;

      if (s.tree) {
        // Walk every assistant-turn node across the tree (parent + subagents)
        Array.from(s.tree.nodesById.values()).forEach((node) => {
          if (node.kind !== "assistant-turn") return;
          const turn = node as AssistantTurnNode;
          const model = turn.model || "unknown";
          if (filters.models && !filters.models.has(model.toLowerCase())) return;
          const tokens = turn.usage.inputTokens + turn.usage.outputTokens;
          inner.set(model, (inner.get(model) || 0) + tokens);
        });
      } else if (s.parsed) {
        // Flat fallback
        for (const m of s.parsed.assistantMessages) {
          const model = m.model || "unknown";
          if (filters.models && !filters.models.has(model.toLowerCase())) continue;
          const tokens = m.usage.inputTokens + m.usage.outputTokens;
          inner.set(model, (inner.get(model) || 0) + tokens);
        }
      }
    }

    const rows = Array.from(map.entries()).map(([date, models]) => {
      const row: Record<string, string | number> = { date };
      models.forEach((tokens, model) => {
        row[model] = tokens;
      });
      return row;
    });

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    res.json(rows);
  } catch (err) {
    handleRouteError(res, err, "routes/charts/models");
  }
});

// ---------------------------------------------------------------------------
// 4. sessions — daily session pattern
// ---------------------------------------------------------------------------

function computeHealthScore(toolErrors: number, _totalCalls: number): "good" | "fair" | "poor" {
  if (toolErrors > 10) return "poor";
  if (toolErrors > 3) return "fair";
  return "good";
}

router.get("/api/charts/sessions", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);
    const buckets = bucketByDay(sessions, s => dayKey(s.session.firstTs));

    const rows = Array.from(buckets.entries()).map(([date, list]) => {
      let healthGood = 0;
      let healthFair = 0;
      let healthPoor = 0;
      let totalMessages = 0;
      let totalDuration = 0;
      for (const s of list) {
        const score = computeHealthScore(s.metrics.toolErrors, s.metrics.toolCalls);
        if (score === "good") healthGood++;
        else if (score === "fair") healthFair++;
        else healthPoor++;
        totalMessages += s.metrics.assistantTurns;
        const first = s.session.firstTs ? new Date(s.session.firstTs).getTime() : 0;
        const last = s.session.lastTs ? new Date(s.session.lastTs).getTime() : 0;
        if (first && last && last > first) totalDuration += last - first;
      }
      const count = list.length;
      return {
        date,
        count,
        healthGood,
        healthFair,
        healthPoor,
        avgMessages: count > 0 ? Math.round(totalMessages / count) : 0,
        avgDuration: count > 0 ? Math.round(totalDuration / count) : 0,
      };
    });

    res.json(sortByDate(rows));
  } catch (err) {
    handleRouteError(res, err, "routes/charts/sessions");
  }
});

// ---------------------------------------------------------------------------
// 5. session-distributions — depth + duration histograms
// ---------------------------------------------------------------------------

router.get("/api/charts/session-distributions", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    const depthBuckets: Record<string, number> = {
      "1-5": 0,
      "6-20": 0,
      "21-50": 0,
      "51-100": 0,
      "100+": 0,
    };
    const durationBuckets: Record<string, number> = {
      "<5m": 0,
      "5-30m": 0,
      "30m-2h": 0,
      "2-6h": 0,
      ">6h": 0,
    };

    for (const s of sessions) {
      const turns = s.metrics.assistantTurns;
      if (turns <= 5) depthBuckets["1-5"]++;
      else if (turns <= 20) depthBuckets["6-20"]++;
      else if (turns <= 50) depthBuckets["21-50"]++;
      else if (turns <= 100) depthBuckets["51-100"]++;
      else depthBuckets["100+"]++;

      const first = s.session.firstTs ? new Date(s.session.firstTs).getTime() : 0;
      const last = s.session.lastTs ? new Date(s.session.lastTs).getTime() : 0;
      const minutes = first && last && last > first ? (last - first) / 60000 : 0;
      if (minutes < 5) durationBuckets["<5m"]++;
      else if (minutes < 30) durationBuckets["5-30m"]++;
      else if (minutes < 120) durationBuckets["30m-2h"]++;
      else if (minutes < 360) durationBuckets["2-6h"]++;
      else durationBuckets[">6h"]++;
    }

    res.json({
      depth: Object.entries(depthBuckets).map(([bucket, count]) => ({ bucket, count })),
      duration: Object.entries(durationBuckets).map(([bucket, count]) => ({ bucket, count })),
    });
  } catch (err) {
    handleRouteError(res, err, "routes/charts/session-distributions");
  }
});

// ---------------------------------------------------------------------------
// 6. stop-reasons
// ---------------------------------------------------------------------------

router.get("/api/charts/stop-reasons", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    const counts = new Map<string, number>();

    for (const s of sessions) {
      if (s.tree) {
        Array.from(s.tree.nodesById.values()).forEach((node) => {
          if (node.kind !== "assistant-turn") return;
          const turn = node as AssistantTurnNode;
          const reason = turn.stopReason || "unknown";
          counts.set(reason, (counts.get(reason) || 0) + 1);
        });
      } else if (s.parsed) {
        for (const m of s.parsed.assistantMessages) {
          const reason = m.stopReason || "unknown";
          counts.set(reason, (counts.get(reason) || 0) + 1);
        }
      }
    }

    const rows = Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    res.json(rows);
  } catch (err) {
    handleRouteError(res, err, "routes/charts/stop-reasons");
  }
});

// ---------------------------------------------------------------------------
// 7. tools — frequency, errors, over-time
// ---------------------------------------------------------------------------

router.get("/api/charts/tools", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    const frequency = new Map<string, number>();
    const errors = new Map<string, { success: number; failure: number }>();
    // date → tool → count
    const overTime = new Map<string, Map<string, number>>();

    for (const s of sessions) {
      const date = dayKey(s.session.firstTs);
      // Walk parsed.toolTimeline regardless of tree presence (file ops &
      // tool counts are stored in the flat ParsedSession). Subagent tool
      // calls do not appear in parent's toolTimeline; that's a known
      // limitation tracked in the contract risk notes.
      if (!s.parsed) continue;
      for (const exec of s.parsed.toolTimeline) {
        const name = normalizeToolName(exec.name);
        frequency.set(name, (frequency.get(name) || 0) + 1);

        const e = errors.get(name) || { success: 0, failure: 0 };
        if (exec.isError) e.failure++;
        else e.success++;
        errors.set(name, e);

        if (date) {
          if (!overTime.has(date)) overTime.set(date, new Map());
          const inner = overTime.get(date)!;
          inner.set(name, (inner.get(name) || 0) + 1);
        }
      }
    }

    const frequencyRows = Array.from(frequency.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);

    const errorRows = Array.from(errors.entries())
      .map(([tool, e]) => ({ tool, success: e.success, failure: e.failure }))
      .sort((a, b) => b.failure - a.failure);

    const overTimeRows = Array.from(overTime.entries())
      .map(([date, inner]) => {
        const row: Record<string, string | number> = { date };
        inner.forEach((count, tool) => {
          row[tool] = count;
        });
        return row;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    res.json({
      frequency: frequencyRows,
      errors: errorRows,
      overTime: overTimeRows,
    });
  } catch (err) {
    handleRouteError(res, err, "routes/charts/tools");
  }
});

// ---------------------------------------------------------------------------
// 8. files — heatmap and churn
// ---------------------------------------------------------------------------

router.get("/api/charts/files", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    // file → counts
    const files = new Map<string, { reads: number; writes: number; edits: number; sessions: Set<string> }>();
    // date → set of file paths touched
    const churnByDay = new Map<string, Set<string>>();

    for (const s of sessions) {
      if (!s.parsed) continue;
      const sessionId = s.session.id;
      for (const exec of s.parsed.toolTimeline) {
        const fp = exec.filePath;
        if (!fp) continue;
        const tool = exec.name.toLowerCase();
        if (tool !== "read" && tool !== "write" && tool !== "edit") continue;

        const entry = files.get(fp) || { reads: 0, writes: 0, edits: 0, sessions: new Set<string>() };
        if (tool === "read") entry.reads++;
        else if (tool === "write") entry.writes++;
        else if (tool === "edit") entry.edits++;
        entry.sessions.add(sessionId);
        files.set(fp, entry);

        const date = dayKey(exec.timestamp);
        if (date) {
          if (!churnByDay.has(date)) churnByDay.set(date, new Set());
          churnByDay.get(date)!.add(fp);
        }
      }
    }

    const heatmap = Array.from(files.entries())
      .map(([file, e]) => ({
        file,
        reads: e.reads,
        writes: e.writes,
        edits: e.edits,
        sessions: e.sessions.size,
      }))
      .sort((a, b) => (b.reads + b.writes + b.edits) - (a.reads + a.writes + a.edits))
      .slice(0, 100);

    const churn = Array.from(churnByDay.entries())
      .map(([date, set]) => ({ date, uniqueFiles: set.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ heatmap, churn });
  } catch (err) {
    handleRouteError(res, err, "routes/charts/files");
  }
});

// ---------------------------------------------------------------------------
// 9. activity — timeline, projects, sidechains
// ---------------------------------------------------------------------------

router.get("/api/charts/activity", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    // Timeline: per-day session count + total tokens + unique files
    const timelineMap = new Map<string, { sessions: number; tokens: number; files: Set<string> }>();
    // Projects: per-project session count, tokens, unique files
    const projectMap = new Map<string, { sessions: number; tokens: number; files: Set<string> }>();
    // Sidechains: per-day count and percentage
    const sidechainMap = new Map<string, { count: number; total: number }>();

    for (const s of sessions) {
      const date = dayKey(s.session.firstTs);
      const tokens = s.metrics.inputTokens + s.metrics.outputTokens;
      const project = s.session.projectKey || "unknown";

      if (date) {
        const tEntry = timelineMap.get(date) || { sessions: 0, tokens: 0, files: new Set<string>() };
        tEntry.sessions++;
        tEntry.tokens += tokens;
        timelineMap.set(date, tEntry);
      }

      const pEntry = projectMap.get(project) || { sessions: 0, tokens: 0, files: new Set<string>() };
      pEntry.sessions++;
      pEntry.tokens += tokens;
      projectMap.set(project, pEntry);

      // Files for both timeline and project
      if (s.parsed) {
        for (const exec of s.parsed.toolTimeline) {
          if (!exec.filePath) continue;
          const tool = exec.name.toLowerCase();
          if (tool !== "read" && tool !== "write" && tool !== "edit") continue;
          if (date) timelineMap.get(date)?.files.add(exec.filePath);
          projectMap.get(project)?.files.add(exec.filePath);
        }
      }

      // Sidechain detection: walk tree if available, else parsed sidechain count
      let sideCount = 0;
      let totalCount = 0;
      if (s.tree) {
        Array.from(s.tree.nodesById.values()).forEach((node) => {
          if (node.kind === "assistant-turn") {
            totalCount++;
            if ((node as AssistantTurnNode).isSidechain) sideCount++;
          }
        });
      } else if (s.parsed) {
        totalCount = s.parsed.assistantMessages.length;
        sideCount = s.parsed.counts.sidechainMessages || 0;
      }
      if (date) {
        const sd = sidechainMap.get(date) || { count: 0, total: 0 };
        sd.count += sideCount;
        sd.total += totalCount;
        sidechainMap.set(date, sd);
      }
    }

    const timeline = Array.from(timelineMap.entries())
      .map(([date, e]) => ({ date, sessions: e.sessions, tokens: e.tokens, files: e.files.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const projects = Array.from(projectMap.entries())
      .map(([project, e]) => ({ project, sessions: e.sessions, tokens: e.tokens, files: e.files.size }))
      .sort((a, b) => b.tokens - a.tokens);

    const sidechains = Array.from(sidechainMap.entries())
      .map(([date, e]) => ({
        date,
        count: e.count,
        percentage: e.total > 0 ? Math.round((e.count / e.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ timeline, projects, sidechains });
  } catch (err) {
    handleRouteError(res, err, "routes/charts/activity");
  }
});

// ---------------------------------------------------------------------------
// 10. subagent-costs — per-agent-type spend + delegation ratios (task007)
// ---------------------------------------------------------------------------
//
// Walks each in-range session's SessionTree, iterates `subagentsByAgentId`,
// and aggregates `rollupCost.costUsd` keyed by `agentType`. Also computes a
// per-session delegation ratio (subagent share of total session cost) so the
// chart can surface "most-delegation-heavy" sessions.
//
// Sessions without a tree are silently skipped — graceful degradation.
// Subagents with a missing/empty `agentType` are bucketed under "unknown"
// with a console.warn for diagnosability.

interface SubagentTopSession {
  sessionId: string;
  slug: string;
  costUsd: number;
  delegationRatio: number;
}

interface SubagentByAgentType {
  agentType: string;
  totalCostUsd: number;
  invocationCount: number;
  sessionCount: number;
  topSessions: SubagentTopSession[];
}

interface SubagentCostsResponse {
  byAgentType: SubagentByAgentType[];
  totals: {
    totalSubagentCostUsd: number;
    parentOnlyCostUsd: number;
    delegationPercentage: number;
  };
  mostDelegationHeavy: Array<{
    sessionId: string;
    slug: string;
    delegationRatio: number;
    costUsd: number;
  }>;
}

router.get("/api/charts/subagent-costs", (req, res) => {
  try {
    const filters = parseFilters(req);
    const sessions = loadSessions(filters);

    // Per-agent-type accumulator. We collect per-session contributions first
    // so we can compute topSessions (top 5 by cost) at the end.
    interface AgentTypeAccum {
      totalCostUsd: number;
      invocationCount: number;
      parentSessions: Map<string, number>; // sessionId → cost contributed
    }
    const byType = new Map<string, AgentTypeAccum>();

    // For totals + mostDelegationHeavy
    let sumTreeRollup = 0;
    let sumParentSelf = 0;
    const sessionDelegation: Array<{
      sessionId: string;
      slug: string;
      delegationRatio: number;
      costUsd: number;
    }> = [];

    for (const r of sessions) {
      const tree = r.tree;
      if (!tree) continue; // skip null-tree sessions silently

      const rollup = tree.root.rollupCost.costUsd || 0;
      const self = tree.root.selfCost.costUsd || 0;
      sumTreeRollup += rollup;
      sumParentSelf += self;

      // delegationRatio guard: rollup of 0 → 0 (avoid divide-by-zero)
      const delegationRatio = rollup > 0 ? (rollup - self) / rollup : 0;
      sessionDelegation.push({
        sessionId: r.session.id,
        slug: r.session.slug,
        delegationRatio,
        costUsd: rollup,
      });

      // Walk subagents
      const subagentNodes = Array.from(tree.subagentsByAgentId.values());
      for (const node of subagentNodes) {
        if (node.kind !== "subagent-root") continue;
        const sub = node as SubagentRootNode;
        let agentType = sub.agentType;
        if (!agentType) {
          console.warn(
            `[chart-analytics] subagent-costs: missing agentType for agentId=${sub.agentId} in session=${r.session.id} — bucketing as "unknown"`,
          );
          agentType = "unknown";
        }

        const subCost = sub.rollupCost.costUsd || 0;
        let entry = byType.get(agentType);
        if (!entry) {
          entry = {
            totalCostUsd: 0,
            invocationCount: 0,
            parentSessions: new Map(),
          };
          byType.set(agentType, entry);
        }
        entry.totalCostUsd += subCost;
        entry.invocationCount += 1;
        entry.parentSessions.set(
          r.session.id,
          (entry.parentSessions.get(r.session.id) || 0) + subCost,
        );
      }
    }

    // Build slug lookup for topSessions / mostDelegationHeavy
    const slugBySessionId = new Map<string, string>();
    for (const r of sessions) {
      slugBySessionId.set(r.session.id, r.session.slug);
    }

    // Build per-session delegation ratio lookup so topSessions can include it
    const ratioBySessionId = new Map<string, number>();
    for (const sd of sessionDelegation) {
      ratioBySessionId.set(sd.sessionId, sd.delegationRatio);
    }

    const byAgentType: SubagentByAgentType[] = Array.from(byType.entries())
      .map(([agentType, entry]) => {
        // Top 5 parent sessions by cost contributed for this agent type
        const topSessions: SubagentTopSession[] = Array.from(
          entry.parentSessions.entries(),
        )
          .map(([sessionId, costUsd]) => ({
            sessionId,
            slug: slugBySessionId.get(sessionId) || sessionId,
            costUsd,
            delegationRatio: ratioBySessionId.get(sessionId) || 0,
          }))
          .sort((a, b) => b.costUsd - a.costUsd)
          .slice(0, 5);

        return {
          agentType,
          totalCostUsd: entry.totalCostUsd,
          invocationCount: entry.invocationCount,
          sessionCount: entry.parentSessions.size,
          topSessions,
        };
      })
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

    const totalSubagentCostUsd = sumTreeRollup - sumParentSelf;
    const delegationPercentage =
      sumTreeRollup > 0 ? (totalSubagentCostUsd / sumTreeRollup) * 100 : 0;

    // mostDelegationHeavy: top 10 sessions by delegationRatio descending.
    // Includes ratio=1 sessions (parent did nothing but dispatch).
    const mostDelegationHeavy = sessionDelegation
      .slice()
      .sort((a, b) => b.delegationRatio - a.delegationRatio)
      .slice(0, 10);

    const response: SubagentCostsResponse = {
      byAgentType,
      totals: {
        totalSubagentCostUsd,
        parentOnlyCostUsd: sumParentSelf,
        delegationPercentage,
      },
      mostDelegationHeavy,
    };

    res.json(response);
  } catch (err) {
    handleRouteError(res, err, "routes/charts/subagent-costs");
  }
});

export default router;
