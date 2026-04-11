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

/** Neutral edge color — edges provide structure, nodes provide color. */
export const EDGE_COLOR = "hsl(var(--border))";

/**
 * Compute edge opacity based on highlight state.
 * - Default: 0.4 (always visible)
 * - Highlighted (endpoint is hovered): 0.7
 * - Dimmed (another node is hovered): 0.15
 */
export function getEdgeOpacity(
  isHighlighted: boolean,
  isDimmed: boolean,
): number {
  if (isHighlighted) return 0.7;
  if (isDimmed) return 0.15;
  return 0.4;
}
