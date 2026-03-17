import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import dagre from "@dagrejs/dagre";
import type { GraphData, EntityType, CustomNode, CustomEdge } from "@shared/types";
import { getCachedSessions } from "../scanner/session-scanner";
import {
  resolveCustomEdges,
  buildVirtualSessions,
  buildGraphResponse,
} from "../services/graph-builder";

const router = Router();

// Edge style per relationship type
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

// Custom node subtype colors
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

// Node dimensions by entity type
const PROJECT_WIDTH = 280;
const PROJECT_HEIGHT = 80;
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 60;
const SESSION_WIDTH = 140;
const SESSION_HEIGHT = 36;
const CUSTOM_WIDTH = 200;
const CUSTOM_HEIGHT = 60;

router.get("/api/graph", (req: Request, res: Response) => {
  // ── Parse query params ──────────────────────────────────────────────
  const typesParam = req.query.types as string | undefined;
  const layoutDir = (req.query.layout as string) || "TB";
  const groupParam = req.query.group === "true";
  const requestedTypes = typesParam ? typesParam.split(",") : undefined;
  const includeSessions = requestedTypes?.includes("session") ?? false;
  const includeCustom = requestedTypes?.includes("custom") ?? !requestedTypes;
  const allowedTypes = requestedTypes
    ? (requestedTypes.filter((t) => t !== "session" && t !== "custom") as EntityType[])
    : undefined;

  // ── Fetch data from storage/scanner ─────────────────────────────────
  let allEntities = storage.getEntities();
  if (allowedTypes && allowedTypes.length > 0) {
    allEntities = allEntities.filter((e) => allowedTypes.includes(e.type));
  }

  const allRels = storage.getAllRelationships();
  const entityIds = new Set(allEntities.map((e) => e.id));
  const filteredRels = allRels.filter(
    (r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId)
  );

  // ── Build dagre graph ───────────────────────────────────────────────
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

  // ── Inject custom nodes + resolve edges ─────────────────────────────
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

  // ── Inject virtual session nodes ────────────────────────────────────
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

  // ── Layout + build response ─────────────────────────────────────────
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
