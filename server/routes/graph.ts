import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import dagre from "@dagrejs/dagre";
import type {
  GraphData,
  EntityType,
  CustomNode,
  CustomEdge,
  ForceGraphData,
  ForceNode,
  ForceEdge,
  Entity,
  ProjectEntity,
} from "@shared/types";
import { getCachedSessions } from "../scanner/session-scanner";
import { queryCosts } from "../scanner/cost-indexer";
import { getCachedExecutions } from "../scanner/agent-scanner";
import { sessionParseCache } from "../scanner/session-cache";
import {
  resolveCustomEdges,
  buildVirtualSessions,
  buildGraphResponse,
} from "../services/graph-builder";

const router = Router();

// Edge style per relationship type (dagre path)
const EDGE_STYLES: Record<string, { color: string; strokeWidth: number; dashed?: boolean; dotted?: boolean }> = {
  uses_mcp:        { color: "#22c55e", strokeWidth: 2.5 },
  defines_mcp:     { color: "#3b82f6", strokeWidth: 2 },
  has_skill:       { color: "#f97316", strokeWidth: 2 },
  has_memory:      { color: "#a78bfa", strokeWidth: 1.5, dashed: true },
  has_claude_md:   { color: "#60a5fa", strokeWidth: 2 },
  has_docs:        { color: "#94a3b8", strokeWidth: 1, dashed: true },
  provides_mcp:    { color: "#c084fc", strokeWidth: 2.5 },
  serves_data_for: { color: "#f59e0b", strokeWidth: 2.5, dotted: true },
  syncs:           { color: "#34d399", strokeWidth: 2, dashed: true },
  has_session:     { color: "#06b6d4", strokeWidth: 1.5, dashed: true },
  connects_to:     { color: "#f59e0b", strokeWidth: 2, dotted: true },
  depends_on:      { color: "#ef4444", strokeWidth: 2 },
  uses:            { color: "#f97316", strokeWidth: 1.5, dashed: true },
  shares_remote:   { color: "#34d399", strokeWidth: 1.5, dashed: true },
  uses_api:        { color: "#f59e0b", strokeWidth: 2 },
};

// Custom node subtype colors (dagre path)
const CUSTOM_SUBTYPE_COLORS: Record<string, string> = {
  service: "#06b6d4",
  database: "#f59e0b",
  api: "#f97316",
  cicd: "#8b5cf6",
  deploy: "#10b981",
  queue: "#a855f7",
  cache: "#ef4444",
  other: "#64748b",
};

// Node dimensions by entity type (dagre path)
const PROJECT_WIDTH = 280;
const PROJECT_HEIGHT = 80;
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 60;
const SESSION_WIDTH = 140;
const SESSION_HEIGHT = 36;
const CUSTOM_WIDTH = 200;
const CUSTOM_HEIGHT = 60;

// ── Weight normalization helper ───────────────────────────────────────────

function normalizeWeight(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0.1;
  return Math.max(0.1, value / maxValue);
}

// ── Force graph: scope=system builder ─────────────────────────────────────

function buildSystemScope(): ForceGraphData {
  const allEntities = storage.getEntities();
  const allRels = storage.getAllRelationships();
  const entityIds = new Set(allEntities.map((e) => e.id));
  const filteredRels = allRels.filter(
    (r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId),
  );

  // Calculate max values per type for normalization
  const sessions = getCachedSessions();
  const costRecords = queryCosts({});
  const totalCost = costRecords.reduce((sum, r) => sum + r.cost, 0);

  // Connection counts per entity
  const connectionCounts = new Map<string, number>();
  for (const rel of filteredRels) {
    connectionCounts.set(rel.sourceId, (connectionCounts.get(rel.sourceId) || 0) + 1);
    connectionCounts.set(rel.targetId, (connectionCounts.get(rel.targetId) || 0) + 1);
  }

  // Max values per type
  const maxByType = new Map<string, number>();
  for (const entity of allEntities) {
    const value = getEntityWeight(entity, sessions.length, connectionCounts);
    const cur = maxByType.get(entity.type) || 0;
    if (value > cur) maxByType.set(entity.type, value);
  }

  // Build nodes
  const nodes: ForceNode[] = allEntities.map((entity) => {
    const rawWeight = getEntityWeight(entity, sessions.length, connectionCounts);
    const maxForType = maxByType.get(entity.type) || 1;

    return {
      id: entity.id,
      type: entity.type,
      label: entity.name,
      weight: normalizeWeight(rawWeight, maxForType),
      health: entity.health,
      meta: buildEntityMeta(entity),
    };
  });

  // Build edges
  const edges: ForceEdge[] = filteredRels.map((rel) => ({
    source: rel.sourceId,
    target: rel.targetId,
    relation: rel.relation,
  }));

  return {
    nodes,
    edges,
    stats: {
      totalSessions: sessions.length,
      totalCost: Math.round(totalCost * 100) / 100,
      totalEntities: allEntities.length,
    },
  };
}

/** Get raw weight value for an entity before normalization */
function getEntityWeight(
  entity: Entity,
  _totalSessions: number,
  connectionCounts: Map<string, number>,
): number {
  if (entity.type === "project") {
    const data = (entity as ProjectEntity).data;
    return data.sessionCount || 1;
  }
  // For non-project entities, weight by connection count
  return connectionCounts.get(entity.id) || 1;
}

/** Build type-specific meta for entity nodes */
function buildEntityMeta(entity: Entity): Record<string, unknown> {
  switch (entity.type) {
    case "project": {
      const data = (entity as ProjectEntity).data;
      // Session scanner uses encoded path keys (e.g. -home-tron-dev-projects-agent-cc)
      // Entity scanner uses basenames (e.g. agent-cc). Derive session key from entity path.
      const sessionKey = entity.path ? entity.path.replace(/\//g, "-") : data.projectKey;
      return {
        sessionCount: data.sessionCount,
        techStack: data.techStack || [],
        hasClaudeMd: data.hasClaudeMd,
        projectKey: sessionKey,
      };
    }
    case "mcp":
      return {
        transport: entity.data.transport,
        command: entity.data.command,
      };
    case "skill":
      return {
        userInvocable: entity.data.userInvocable,
      };
    case "plugin":
      return {
        installed: entity.data.installed,
        marketplace: entity.data.marketplace,
        hasMCP: entity.data.hasMCP,
      };
    case "markdown":
      return {
        category: entity.data.category,
        sizeBytes: entity.data.sizeBytes,
        preview: entity.data.preview,
      };
    case "config":
      return {
        configType: entity.data.configType,
      };
    default:
      return {};
  }
}

// ── Force graph: scope=sessions builder ───────────────────────────────────

function buildSessionsScope(projectKey: string): ForceGraphData {
  const allSessions = getCachedSessions();
  const projectSessions = allSessions.filter((s) => s.projectKey === projectKey);

  // Get cost data per session
  const sessionCosts = new Map<string, number>();
  const projectCostRecords = queryCosts({ projectKey });
  for (const r of projectCostRecords) {
    sessionCosts.set(r.sessionId, (sessionCosts.get(r.sessionId) || 0) + r.cost);
  }
  const totalCost = projectCostRecords.reduce((sum, r) => sum + r.cost, 0);

  // Build tool aggregates across the whole project scope.
  // One node per unique tool name; edges link each session that used it.
  // sessionToolUses: sessionId -> (toolName -> count in that session)
  const sessionToolUses = new Map<string, Map<string, number>>();
  const toolTotals = new Map<string, number>();
  const allParsed = sessionParseCache.getAll();

  for (const session of projectSessions) {
    const parsed = allParsed.get(session.id);
    if (!parsed) continue;
    const perSession = new Map<string, number>();
    for (const exec of parsed.toolTimeline) {
      perSession.set(exec.name, (perSession.get(exec.name) || 0) + 1);
      toolTotals.set(exec.name, (toolTotals.get(exec.name) || 0) + 1);
    }
    if (perSession.size > 0) sessionToolUses.set(session.id, perSession);
  }

  // Agent executions aggregated across project: one node per unique agent slug.
  // sessionAgentUses: sessionId -> (agentSlug -> count) ; agentTotals: slug -> total execs
  const sessionAgentUses = new Map<string, Map<string, number>>();
  const agentTotals = new Map<string, number>();
  const allAgentExecs = getCachedExecutions().filter(
    (e) => e.projectKey === projectKey,
  );
  for (const exec of allAgentExecs) {
    agentTotals.set(exec.slug, (agentTotals.get(exec.slug) || 0) + 1);
    let perSession = sessionAgentUses.get(exec.sessionId);
    if (!perSession) {
      perSession = new Map<string, number>();
      sessionAgentUses.set(exec.sessionId, perSession);
    }
    perSession.set(exec.slug, (perSession.get(exec.slug) || 0) + 1);
  }

  // Collect max values for normalization
  let maxMessages = 0;
  let maxCost = 0;
  for (const s of projectSessions) {
    if (s.messageCount > maxMessages) maxMessages = s.messageCount;
    const cost = sessionCosts.get(s.id) || 0;
    if (cost > maxCost) maxCost = cost;
  }

  let maxToolTotal = 0;
  toolTotals.forEach((count) => {
    if (count > maxToolTotal) maxToolTotal = count;
  });

  let maxAgentTotal = 0;
  agentTotals.forEach((count) => {
    if (count > maxAgentTotal) maxAgentTotal = count;
  });

  const nodes: ForceNode[] = [];
  const edges: ForceEdge[] = [];

  // Session nodes
  for (const session of projectSessions) {
    const cost = sessionCosts.get(session.id) || 0;

    nodes.push({
      id: session.id,
      type: "session",
      label: (session.firstMessage || "(empty)").slice(0, 80),
      weight: normalizeWeight(session.messageCount, maxMessages),
      health: session.isActive ? "ok" : "unknown",
      meta: {
        messageCount: session.messageCount,
        toolCount: sessionToolUses.get(session.id)?.size || 0,
        cost: Math.round(cost * 1000) / 1000,
        isActive: session.isActive,
        slug: session.slug,
      },
    });

    // Cost node per session (if cost data exists)
    if (cost > 0) {
      const costNodeId = `cost-${session.id}`;
      nodes.push({
        id: costNodeId,
        type: "cost",
        label: `$${cost.toFixed(2)}`,
        weight: normalizeWeight(cost, maxCost),
        health: "unknown",
        meta: { cost, sessionId: session.id },
      });
      edges.push({
        source: session.id,
        target: costNodeId,
        relation: "cost",
      });
    }
  }

  // One tool node per unique tool name, sized by total invocation count across project.
  toolTotals.forEach((total, toolName) => {
    const toolNodeId = `tool-${toolName}`;
    nodes.push({
      id: toolNodeId,
      type: "tool",
      label: toolName,
      weight: normalizeWeight(total, maxToolTotal),
      health: "unknown",
      meta: { count: total, toolName },
    });
  });

  // Edges from each session to tools it used.
  sessionToolUses.forEach((perSession, sessionId) => {
    perSession.forEach((_count, toolName) => {
      edges.push({
        source: sessionId,
        target: `tool-${toolName}`,
        relation: "tool_call",
      });
    });
  });

  // One agent node per unique agent slug, sized by total executions across project.
  agentTotals.forEach((total, agentSlug) => {
    const agentNodeId = `agent-${agentSlug}`;
    nodes.push({
      id: agentNodeId,
      type: "agent",
      label: agentSlug,
      weight: normalizeWeight(total, maxAgentTotal),
      health: "unknown",
      meta: { count: total, agentSlug },
    });
  });

  // Edges from each session to agents it invoked.
  sessionAgentUses.forEach((perSession, sessionId) => {
    perSession.forEach((_count, agentSlug) => {
      edges.push({
        source: sessionId,
        target: `agent-${agentSlug}`,
        relation: "agent_exec",
      });
    });
  });

  return {
    nodes,
    edges,
    stats: {
      totalSessions: projectSessions.length,
      totalCost: Math.round(totalCost * 100) / 100,
      totalEntities: nodes.length,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get("/api/graph", (req: Request, res: Response) => {
  const scope = (req.query.scope as string) || undefined;

  // Force graph scopes: return ForceGraphData
  if (scope === "system" || scope === "sessions") {
    try {
      if (scope === "sessions") {
        const projectKey = req.query.project as string;
        if (!projectKey) {
          return res.status(400).json({ message: "project param required for scope=sessions" });
        }
        const data = buildSessionsScope(projectKey);
        return res.json(data);
      }
      // scope=system
      const data = buildSystemScope();
      return res.json(data);
    } catch (err) {
      console.error("[graph] Force graph error:", err);
      return res.json({ nodes: [], edges: [], stats: { totalSessions: 0, totalCost: 0, totalEntities: 0 } } as ForceGraphData);
    }
  }

  // ── Legacy dagre path (no scope param) ──────────────────────────────
  const typesParam = req.query.types as string | undefined;
  const layoutDir = (req.query.layout as string) || "TB";
  const groupParam = req.query.group === "true";
  const requestedTypes = typesParam ? typesParam.split(",") : undefined;
  const includeSessions = requestedTypes?.includes("session") ?? false;
  const includeCustom = requestedTypes?.includes("custom") ?? !requestedTypes;
  const allowedTypes = requestedTypes
    ? (requestedTypes.filter((t) => t !== "session" && t !== "custom") as EntityType[])
    : undefined;

  // Fetch data from storage/scanner
  let allEntities = storage.getEntities();
  if (allowedTypes && allowedTypes.length > 0) {
    allEntities = allEntities.filter((e) => allowedTypes.includes(e.type));
  }

  const allRels = storage.getAllRelationships();
  const entityIds = new Set(allEntities.map((e) => e.id));
  const filteredRels = allRels.filter(
    (r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId),
  );

  // Build dagre graph
  const rankdir = layoutDir === "LR" ? "LR" : "TB";
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 80, ranksep: 160, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const entity of allEntities) {
    const isProject = entity.type === "project";
    g.setNode(entity.id, {
      width: isProject ? PROJECT_WIDTH : DEFAULT_WIDTH,
      height: isProject ? PROJECT_HEIGHT : DEFAULT_HEIGHT,
    });
  }

  for (const rel of filteredRels) {
    g.setEdge(rel.sourceId, rel.targetId);
  }

  // Inject custom nodes + resolve edges
  const customNodesList: CustomNode[] = [];
  let customEdgesList: CustomEdge[] = [];

  if (includeCustom) {
    const allCustomNodes = storage.getCustomNodes();
    const allCustomEdges = storage.getCustomEdges();

    for (const cn of allCustomNodes) {
      customNodesList.push(cn);
      g.setNode(cn.id, { width: CUSTOM_WIDTH, height: CUSTOM_HEIGHT });
    }

    customEdgesList = resolveCustomEdges(allCustomEdges, customNodesList, allEntities, entityIds, g);
  }

  // Inject virtual session nodes
  const overrides = storage.getEntityOverrides();
  const virtualSessions = includeSessions
    ? buildVirtualSessions(
        allEntities.filter((e) => e.type === "project"),
        entityIds,
        getCachedSessions(),
        g,
        SESSION_WIDTH,
        SESSION_HEIGHT,
      )
    : [];

  // Layout + build response
  dagre.layout(g);

  const { nodes, edges } = buildGraphResponse(
    g,
    allEntities,
    customNodesList,
    customEdgesList,
    virtualSessions,
    overrides,
    filteredRels,
    EDGE_STYLES,
    CUSTOM_SUBTYPE_COLORS,
    groupParam,
  );

  const result: GraphData = { nodes, edges };
  res.json(result);
});

export default router;
