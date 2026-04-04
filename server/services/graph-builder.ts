import dagre from "@dagrejs/dagre";
import type {
  Entity,
  CustomNode,
  CustomEdge,
  EntityOverride,
  Relationship,
  GraphNode,
  GraphNodeType,
  SessionData,
} from "@shared/types";
import { encodeProjectKey } from "../scanner/utils";

// ── Types ────────────────────────────────────────────────────────────────

export interface VirtualSession {
  id: string;
  label: string;
  projectEntityId: string;
}

export interface EdgeStyleDef {
  color: string;
  strokeWidth: number;
  dashed?: boolean;
  dotted?: boolean;
}

export interface ResolvedEdge extends CustomEdge {
  // source/target already resolved to IDs
}

// ── resolveCustomEdges ───────────────────────────────────────────────────

/**
 * Resolve custom edge references: edges may reference entity names, IDs, or
 * dash-separated names. Returns only edges whose source AND target are present
 * in the graph (entityIds or customNodeIds).
 *
 * Side-effect: adds resolved edges to `g` via `g.setEdge`.
 */
export function resolveCustomEdges(
  customEdges: CustomEdge[],
  customNodes: CustomNode[],
  entities: Entity[],
  entityIds: Set<string>,
  g: dagre.graphlib.Graph,
): ResolvedEdge[] {
  // Build lookup: lowered name / dash-name / id → canonical id
  const entityNameToId = new Map<string, string>();
  for (const entity of entities) {
    entityNameToId.set(entity.name.toLowerCase(), entity.id);
    entityNameToId.set(entity.name.toLowerCase().replace(/\s+/g, "-"), entity.id);
    entityNameToId.set(entity.id, entity.id);
  }
  for (const cn of customNodes) {
    entityNameToId.set(cn.id, cn.id);
    entityNameToId.set(cn.label.toLowerCase(), cn.id);
    entityNameToId.set(cn.label.toLowerCase().replace(/\s+/g, "-"), cn.id);
  }

  const customNodeIds = new Set(customNodes.map((n) => n.id));

  const resolved: ResolvedEdge[] = [];
  for (const ce of customEdges) {
    const resolvedSource =
      entityNameToId.get(ce.source) || entityNameToId.get(ce.source.toLowerCase());
    const resolvedTarget =
      entityNameToId.get(ce.target) || entityNameToId.get(ce.target.toLowerCase());
    if (resolvedSource && resolvedTarget) {
      const sourceInGraph = entityIds.has(resolvedSource) || customNodeIds.has(resolvedSource);
      const targetInGraph = entityIds.has(resolvedTarget) || customNodeIds.has(resolvedTarget);
      if (sourceInGraph && targetInGraph) {
        resolved.push({ ...ce, source: resolvedSource, target: resolvedTarget });
        g.setEdge(resolvedSource, resolvedTarget);
      }
    }
  }
  return resolved;
}

// ── buildVirtualSessions ─────────────────────────────────────────────────

/**
 * Inject virtual session nodes into the dagre graph.  Returns an array of
 * VirtualSession descriptors.  For every project entity that matches a
 * session's projectKey, the top 20 most-recent sessions are added.
 */
export function buildVirtualSessions(
  projectEntities: Entity[],
  entityIds: Set<string>,
  sessions: SessionData[],
  g: dagre.graphlib.Graph,
  sessionWidth: number,
  sessionHeight: number,
): VirtualSession[] {
  // Build map: encoded project key → entity id (deterministic, no lossy decode)
  const keyToEntityId = new Map<string, string>();
  for (const p of projectEntities) {
    keyToEntityId.set(encodeProjectKey(p.path), p.id);
  }

  // Group sessions by projectKey and take top 20 per project
  const grouped = new Map<string, SessionData[]>();
  for (const s of sessions) {
    const arr = grouped.get(s.projectKey) || [];
    arr.push(s);
    grouped.set(s.projectKey, arr);
  }

  const virtualSessions: VirtualSession[] = [];

  grouped.forEach((projectSessions, projectKey) => {
    // Match session key directly against encoded project paths
    const projectEntityId = keyToEntityId.get(projectKey);

    if (!projectEntityId) return;
    if (!entityIds.has(projectEntityId)) return;

    const sorted = [...projectSessions]
      .sort((a, b) => (b.lastTs || "").localeCompare(a.lastTs || ""))
      .slice(0, 20);

    for (const s of sorted) {
      const nodeId = `session-${s.id}`;
      const label = (s.firstMessage || "(empty)").slice(0, 60);
      virtualSessions.push({ id: nodeId, label, projectEntityId });
      g.setNode(nodeId, { width: sessionWidth, height: sessionHeight });
      g.setEdge(projectEntityId, nodeId);
    }
  });

  return virtualSessions;
}

// ── buildGraphResponse ───────────────────────────────────────────────────

/**
 * After dagre.layout(g) has been called, build the final nodes[] and edges[]
 * arrays that constitute the GraphData response.
 */
export function buildGraphResponse(
  g: dagre.graphlib.Graph,
  entities: Entity[],
  customNodes: CustomNode[],
  customEdges: ResolvedEdge[],
  virtualSessions: VirtualSession[],
  overrides: Record<string, EntityOverride>,
  relationships: Relationship[],
  edgeStyles: Record<string, EdgeStyleDef>,
  customSubtypeColors: Record<string, string>,
  groupParam: boolean,
): { nodes: GraphNode[]; edges: { id: string; source: string; target: string; label: string; style: EdgeStyleDef & { animated: boolean } }[] } {
  // Build parent mapping for grouping
  const parentMap = new Map<string, string>();
  if (groupParam) {
    for (const rel of relationships) {
      const sourceEntity = entities.find((e) => e.id === rel.sourceId);
      const targetEntity = entities.find((e) => e.id === rel.targetId);
      if (sourceEntity?.type === "project" && targetEntity && targetEntity.type !== "project") {
        parentMap.set(rel.targetId, rel.sourceId);
      }
    }
  }

  // Entity nodes
  const nodes: GraphNode[] = entities.map((entity) => {
    const nodePos = g.node(entity.id);

    const dashName = entity.name.toLowerCase().replace(/\s+/g, "-");
    const override =
      overrides[entity.id] ||
      overrides[entity.name] ||
      overrides[entity.name.toLowerCase()] ||
      overrides[dashName];

    const node: GraphNode = {
      id: entity.id,
      type: entity.type,
      label: override?.label || entity.name,
      description: override?.description || entity.description || undefined,
      health: entity.health,
      position: {
        x: nodePos?.x ?? 0,
        y: nodePos?.y ?? 0,
      },
      color: override?.color,
    };
    if (groupParam && parentMap.has(entity.id)) {
      node.parentId = parentMap.get(entity.id);
    }
    return node;
  });

  // Custom nodes
  for (const cn of customNodes) {
    const nodePos = g.node(cn.id);
    nodes.push({
      id: cn.id,
      type: "custom" as GraphNodeType,
      label: cn.label,
      description: cn.description,
      health: "unknown",
      position: { x: nodePos?.x ?? 0, y: nodePos?.y ?? 0 },
      subType: cn.subType,
      color: cn.color || customSubtypeColors[cn.subType] || "#64748b",
      url: cn.url,
      source: cn.source,
    });
  }

  // Virtual session nodes
  for (const vs of virtualSessions) {
    const nodePos = g.node(vs.id);
    nodes.push({
      id: vs.id,
      type: "session" as GraphNodeType,
      label: vs.label,
      health: "unknown",
      position: { x: nodePos?.x ?? 0, y: nodePos?.y ?? 0 },
    });
  }

  // Relationship edges
  const edges = relationships.map((rel, i) => ({
    id: `e-${rel.sourceId}-${rel.targetId}-${rel.relation}-${i}`,
    source: rel.sourceId,
    target: rel.targetId,
    label: rel.relation,
    style: { ...(edgeStyles[rel.relation] || { color: "#94a3b8", strokeWidth: 1 }), animated: true as const },
  }));

  // Session edges
  for (const vs of virtualSessions) {
    edges.push({
      id: `e-${vs.projectEntityId}-${vs.id}-has_session`,
      source: vs.projectEntityId,
      target: vs.id,
      label: "has_session",
      style: { ...edgeStyles.has_session, animated: true as const },
    });
  }

  // Custom edges
  for (const ce of customEdges) {
    const style = edgeStyles[ce.label] || {
      color: ce.color || "#94a3b8",
      strokeWidth: 1.5,
      dashed: ce.dashed,
    };
    edges.push({
      id: ce.id,
      source: ce.source,
      target: ce.target,
      label: ce.label,
      style: { ...style, animated: true as const },
    });
  }

  return { nodes, edges };
}
