import fs from "fs";
import crypto from "crypto";
import { getDB, save } from "../db";
import { getPricing, computeCost, getModelFamily } from "./pricing";
import { getCachedSessions } from "./session-scanner";
import { decodeProjectKey } from "./utils";
import type { CostRecord, CostSummary, SessionCostDetail, CostTokenBreakdown } from "@shared/types";

/** Create a deterministic record ID for dedup */
export function createCostRecordId(sessionId: string, timestamp: string, model: string): string {
  return crypto.createHash("md5").update(`${sessionId}:${timestamp}:${model}`).digest("hex").slice(0, 16);
}

/** Extract parent session ID from a subagent file path.
 *  Path pattern: .../projects/{projectKey}/{parentSessionId}/subagents/agent-{id}.jsonl
 *  Returns null if not a subagent or if subagents dir is directly under project (no session dir). */
export function extractParentSessionId(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  // Match: .../projects/{projectKey}/{sessionId}/subagents/agent-{id}.jsonl
  // Two segments between projects/ and subagents/ means we have both projectKey and sessionId
  const match = normalized.match(/\/projects\/[^/]+\/([^/]+)\/subagents\/agent-[^/]+\.jsonl$/);
  if (!match) return null;
  return match[1];
}

/** Parse a JSONL file from a byte offset and return CostRecords.
 *  This is the low-level parser — no DB interaction. */
export function parseJSONLForCosts(
  filePath: string,
  sessionId: string,
  parentSessionId: string | null,
  projectKey: string,
  fromOffset: number,
): CostRecord[] {
  const records: CostRecord[] = [];
  const now = new Date().toISOString();

  let content: string;
  try {
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const readLen = stat.size - fromOffset;
    if (readLen <= 0) {
      fs.closeSync(fd);
      return records;
    }
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, buf.length, fromOffset);
    fs.closeSync(fd);
    content = buf.toString("utf-8");
  } catch {
    return records;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record.type !== "assistant") continue;
      const msg = record.message;
      if (!msg || !msg.usage) continue;

      const u = msg.usage;
      const model = msg.model || "unknown";
      const pricing = getPricing(model);
      const family = getModelFamily(model);

      const inputTokens = u.input_tokens || 0;
      const outputTokens = u.output_tokens || 0;
      const cacheReadTokens = u.cache_read_input_tokens || 0;
      const cacheCreationTokens = u.cache_creation_input_tokens || 0;
      const cost = computeCost(pricing, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
      const timestamp = record.timestamp || "";

      records.push({
        id: createCostRecordId(sessionId, timestamp, model),
        sessionId,
        parentSessionId,
        projectKey,
        model,
        modelFamily: family,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        cost,
        pricingSnapshot: {
          input: pricing.input,
          output: pricing.output,
          cacheRead: pricing.cacheRead,
          cacheCreation: pricing.cacheCreation,
        },
        timestamp,
        indexedAt: now,
      });
    } catch {
      // Malformed line — skip
    }
  }

  return records;
}

/** Run incremental cost indexing across all known session files.
 *  Called after the main session scan cycle. */
export function indexCosts(): void {
  const db = getDB();
  const state = db.costIndexState;
  const sessions = getCachedSessions();
  let newRecords = 0;

  const filesToIndex: Array<{
    filePath: string;
    sessionId: string;
    parentSessionId: string | null;
    projectKey: string;
  }> = [];

  for (const session of sessions) {
    filesToIndex.push({
      filePath: session.filePath,
      sessionId: session.id,
      parentSessionId: null,
      projectKey: session.projectKey,
    });

    const sessionDir = session.filePath.replace(/\/[^/]+\.jsonl$/, "");
    const subagentsDir = sessionDir + "/subagents";
    try {
      if (fs.existsSync(subagentsDir)) {
        const files = fs.readdirSync(subagentsDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith(".jsonl")) {
            const subPath = subagentsDir + "/" + f.name;
            const agentId = f.name.replace(/\.jsonl$/, "").replace(/^agent-/, "");
            filesToIndex.push({
              filePath: subPath,
              sessionId: agentId,
              parentSessionId: session.id,
              projectKey: session.projectKey,
            });
          }
        }
      }
    } catch {
      // subagents dir not readable — skip
    }
  }

  for (const file of filesToIndex) {
    try {
      const stat = fs.statSync(file.filePath);
      const fileState = state.files[file.filePath];

      if (fileState && fileState.fileSize === stat.size && fileState.lastOffset >= stat.size) {
        continue;
      }

      let offset = 0;
      if (fileState && stat.size >= fileState.fileSize) {
        offset = fileState.lastOffset;
      } else if (fileState) {
        // File shrank — remove old records and reindex from start
        for (const id of Object.keys(db.costRecords)) {
          if (db.costRecords[id].sessionId === file.sessionId) {
            delete db.costRecords[id];
          }
        }
      }

      const records = parseJSONLForCosts(
        file.filePath,
        file.sessionId,
        file.parentSessionId,
        file.projectKey,
        offset,
      );

      for (const record of records) {
        if (!db.costRecords[record.id]) {
          db.costRecords[record.id] = record;
          newRecords++;
        }
      }

      state.files[file.filePath] = {
        filePath: file.filePath,
        lastOffset: stat.size,
        lastTimestamp: records.length > 0 ? records[records.length - 1].timestamp : (fileState?.lastTimestamp || ""),
        recordCount: (fileState?.recordCount || 0) + records.length,
        fileSize: stat.size,
      };
    } catch {
      // File unreadable — skip
    }
  }

  state.totalRecords = Object.keys(db.costRecords).length;
  state.lastIndexAt = new Date().toISOString();

  if (newRecords > 0) {
    save();
    console.log(`[cost-indexer] Indexed ${newRecords} new cost records (${state.totalRecords} total)`);
  }
}

/** Query cost records with filters */
export function queryCosts(filter: {
  days?: number;
  projectKey?: string;
  sessionId?: string;
  modelFamily?: string;
}): CostRecord[] {
  const db = getDB();
  let records = Object.values(db.costRecords);

  if (filter.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filter.days);
    const cutoffStr = cutoff.toISOString();
    records = records.filter(r => r.timestamp >= cutoffStr);
  }

  if (filter.projectKey) {
    records = records.filter(r => r.projectKey === filter.projectKey);
  }

  if (filter.sessionId) {
    records = records.filter(r => r.sessionId === filter.sessionId || r.parentSessionId === filter.sessionId);
  }

  if (filter.modelFamily) {
    records = records.filter(r => r.modelFamily === filter.modelFamily);
  }

  return records;
}

function sumTokens(records: CostRecord[]): CostTokenBreakdown {
  let input = 0, output = 0, cacheRead = 0, cacheCreation = 0;
  for (const r of records) {
    input += r.inputTokens;
    output += r.outputTokens;
    cacheRead += r.cacheReadTokens;
    cacheCreation += r.cacheCreationTokens;
  }
  return { input, output, cacheRead, cacheCreation };
}

/** Build a CostSummary for the costs page */
export function getCostSummary(days: number): CostSummary {
  const records = queryCosts({ days });
  const sessions = getCachedSessions();
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  const totalTokens = sumTokens(records);

  // Weekly comparison — always from full data
  const now = new Date();
  const sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const fourteenAgo = new Date(now); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const sevenStr = sevenAgo.toISOString().slice(0, 10);
  const fourteenStr = fourteenAgo.toISOString().slice(0, 10);

  const allRecords = Object.values(getDB().costRecords);
  let thisWeekCost = 0, lastWeekCost = 0;
  for (const r of allRecords) {
    const d = r.timestamp.slice(0, 10);
    if (d >= sevenStr && d < tomorrowStr) thisWeekCost += r.cost;
    if (d >= fourteenStr && d < sevenStr) lastWeekCost += r.cost;
  }
  const changePct = lastWeekCost > 0 ? Math.round((thisWeekCost / lastWeekCost - 1) * 100) : 0;

  // Monthly total (always 30d)
  const thirtyAgo = new Date(now); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toISOString();
  const monthlyTotalCost = allRecords.filter(r => r.timestamp >= thirtyStr).reduce((s, r) => s + r.cost, 0);

  // By model (exact versions)
  const byModel: CostSummary["byModel"] = {};
  const modelSessions: Record<string, Set<string>> = {};
  for (const r of records) {
    const key = r.model;
    if (!byModel[key]) {
      byModel[key] = { cost: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, sessions: 0 };
      modelSessions[key] = new Set();
    }
    byModel[key].cost += r.cost;
    byModel[key].tokens.input += r.inputTokens;
    byModel[key].tokens.output += r.outputTokens;
    byModel[key].tokens.cacheRead += r.cacheReadTokens;
    byModel[key].tokens.cacheCreation += r.cacheCreationTokens;
    modelSessions[key].add(r.sessionId);
  }
  for (const key of Object.keys(byModel)) {
    byModel[key].sessions = modelSessions[key].size;
    byModel[key].cost = Math.round(byModel[key].cost * 1000) / 1000;
  }

  // By project
  const projCost: Record<string, { cost: number; sessions: Set<string> }> = {};
  for (const r of records) {
    if (!projCost[r.projectKey]) projCost[r.projectKey] = { cost: 0, sessions: new Set() };
    projCost[r.projectKey].cost += r.cost;
    projCost[r.projectKey].sessions.add(r.sessionId);
  }
  const byProject = Object.entries(projCost)
    .map(([key, data]) => ({
      projectKey: key,
      projectName: decodeProjectKey(key).split("/").pop() || key,
      cost: Math.round(data.cost * 1000) / 1000,
      sessions: data.sessions.size,
    }))
    .sort((a, b) => b.cost - a.cost);

  // By day
  const dayCost: Record<string, { cost: number; compute: number; cache: number }> = {};
  for (const r of records) {
    const d = r.timestamp.slice(0, 10);
    if (!dayCost[d]) dayCost[d] = { cost: 0, compute: 0, cache: 0 };
    const computePart = (r.inputTokens * r.pricingSnapshot.input + r.outputTokens * r.pricingSnapshot.output) / 1_000_000;
    const cachePart = (r.cacheReadTokens * r.pricingSnapshot.cacheRead + r.cacheCreationTokens * r.pricingSnapshot.cacheCreation) / 1_000_000;
    dayCost[d].cost += r.cost;
    dayCost[d].compute += computePart;
    dayCost[d].cache += cachePart;
  }
  const byDay = Object.entries(dayCost)
    .map(([date, data]) => ({
      date,
      cost: Math.round(data.cost * 1000) / 1000,
      computeCost: Math.round(data.compute * 1000) / 1000,
      cacheCost: Math.round(data.cache * 1000) / 1000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top sessions — aggregate by root session ID
  const sessionCosts: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    model: string;
    subagentCost: number;
  }> = {};
  for (const r of records) {
    const rootId = r.parentSessionId || r.sessionId;
    if (!sessionCosts[rootId]) {
      sessionCosts[rootId] = {
        cost: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        model: "",
        subagentCost: 0,
      };
    }
    const sc = sessionCosts[rootId];
    sc.cost += r.cost;
    sc.tokens.input += r.inputTokens;
    sc.tokens.output += r.outputTokens;
    sc.tokens.cacheRead += r.cacheReadTokens;
    sc.tokens.cacheCreation += r.cacheCreationTokens;
    if (r.parentSessionId) {
      sc.subagentCost += r.cost;
    } else {
      if (!sc.model) sc.model = r.model;
    }
  }
  const subagentSessions: Record<string, Set<string>> = {};
  for (const r of records) {
    if (r.parentSessionId) {
      const rootId = r.parentSessionId;
      if (!subagentSessions[rootId]) subagentSessions[rootId] = new Set();
      subagentSessions[rootId].add(r.sessionId);
    }
  }
  const topSessions = Object.entries(sessionCosts)
    .map(([sessionId, data]) => {
      const sess = sessionMap.get(sessionId);
      return {
        sessionId,
        firstMessage: (sess?.firstMessage || "").slice(0, 100),
        model: data.model || "unknown",
        cost: Math.round(data.cost * 1000) / 1000,
        subagentCount: subagentSessions[sessionId]?.size || 0,
        subagentCost: Math.round(data.subagentCost * 1000) / 1000,
        tokens: data.tokens,
      };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  return {
    totalCost: Math.round(totalCost * 1000) / 1000,
    totalTokens,
    weeklyComparison: {
      thisWeek: Math.round(thisWeekCost * 100) / 100,
      lastWeek: Math.round(lastWeekCost * 100) / 100,
      changePct,
    },
    monthlyTotalCost: Math.round(monthlyTotalCost * 1000) / 1000,
    byModel,
    byProject,
    byDay,
    topSessions,
    planLimits: {
      pro: { limit: 0, label: "Pro (usage-based)" },
      max5x: { limit: 100, label: "Max $100/mo" },
      max20x: { limit: 200, label: "Max $200/mo" },
    },
  };
}

/** Get detailed cost breakdown for a single session (including subagents) */
export function getSessionCostDetail(sessionId: string): SessionCostDetail | null {
  const records = queryCosts({ sessionId });
  if (records.length === 0) return null;

  const sessions = getCachedSessions();
  const sess = sessions.find(s => s.id === sessionId);

  const directRecords = records.filter(r => r.parentSessionId === null || r.sessionId === sessionId);
  const subagentRecords = records.filter(r => r.parentSessionId === sessionId);

  const directTokens = sumTokens(directRecords);
  const directCost = directRecords.reduce((s, r) => s + r.cost, 0);
  const directModel = directRecords.find(r => r.model)?.model || "unknown";
  const pricing = getPricing(directModel);

  const subagentMap: Record<string, CostRecord[]> = {};
  for (const r of subagentRecords) {
    if (!subagentMap[r.sessionId]) subagentMap[r.sessionId] = [];
    subagentMap[r.sessionId].push(r);
  }

  const subagents = Object.entries(subagentMap).map(([sid, recs]) => ({
    sessionId: sid,
    model: recs[0]?.model || "unknown",
    cost: Math.round(recs.reduce((s, r) => s + r.cost, 0) * 1000) / 1000,
    tokens: sumTokens(recs),
  }));

  return {
    sessionId,
    firstMessage: (sess?.firstMessage || "").slice(0, 200),
    totalCost: Math.round(records.reduce((s, r) => s + r.cost, 0) * 1000) / 1000,
    directCost: Math.round(directCost * 1000) / 1000,
    directTokens,
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
