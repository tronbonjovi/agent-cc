// graph-colors.ts — Color mapping and edge styling helpers for the entity graph

/** Colors per node type, referencing CSS custom properties from the theme. */
export const NODE_COLORS: Record<string, string> = {
  project:  "hsl(var(--entity-project))",
  mcp:      "hsl(var(--entity-mcp))",
  skill:    "hsl(var(--entity-skill))",
  plugin:   "hsl(var(--entity-plugin))",
  markdown: "hsl(var(--entity-markdown))",
  config:   "hsl(var(--entity-config))",
  session:  "hsl(var(--chart-1))",
  cost:     "hsl(var(--chart-2))",
  tool:     "hsl(var(--chart-3))",
  agent:    "hsl(var(--chart-4))",
};

/** Stroke width by node type — larger nodes get thicker strokes. */
export function getStrokeWidth(type: string): number {
  if (type === "project") return 1.5;
  if (type === "session" || type === "mcp" || type === "skill") return 1;
  return 0.7;
}

/** Relations that represent parent-child / hierarchical connections. */
const HIERARCHICAL_RELATIONS = new Set([
  "defines_mcp",
  "has_skill",
  "has_claude_md",
  "has_memory",
  "has_session",
  "tool_call",
  "cost",
  "agent_exec",
]);

/** Returns true for relations that are hierarchical (solid edge style). */
export function isHierarchical(relation: string): boolean {
  return HIERARCHICAL_RELATIONS.has(relation);
}

/**
 * Compute edge opacity based on highlight state.
 * - Default: 0.15 for hierarchical (solid), 0.08 for cross-ref (dashed)
 * - Highlighted (endpoint is hovered): 0.5
 * - Dimmed (another node is hovered): 0.03
 */
export function getEdgeOpacity(
  relation: string,
  isHighlighted: boolean,
  isDimmed: boolean,
): number {
  if (isHighlighted) return 0.5;
  if (isDimmed) return 0.03;
  return isHierarchical(relation) ? 0.15 : 0.08;
}

/** Edge stroke width: hierarchical = 0.8px, cross-ref = 0.5px. */
export function getEdgeStrokeWidth(relation: string): number {
  return isHierarchical(relation) ? 0.8 : 0.5;
}
