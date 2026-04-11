# Agent-CC Force-Directed Entity Graph — Technical Spec

## Overview

Replace the existing Nerve Center tab content (`NerveCenterTopology` and its sub-components) with a force-directed entity graph visualization. The graph renders scanner entities as nodes and their relationships as edges, using d3-force for client-side physics simulation. Users can hover to highlight connected subgraphs, click project nodes to drill into their sessions, and click session nodes to see tool calls, costs, and agent executions.

The visual style is warm, muted, and professional — not neon/sci-fi. Think Anthropic's design language: clean surfaces, earthy accents, subtle animation.

---

## 1. Install dependency

```bash
npm install d3-force @types/d3-force
```

Only the force simulation module is needed — no other d3 packages. We render with React/SVG directly, not d3's DOM manipulation.

---

## 2. API layer

### 2a. Modify `GET /api/graph`

The existing endpoint already builds nodes and edges from entities + relationships. Adapt it to return data shaped for force layout instead of dagre layout. Remove the dagre positioning — the client will compute positions.

**Request:** `GET /api/graph?scope=system` or `GET /api/graph?scope=sessions&project=<projectKey>`

**Response shape:**

```typescript
// Add to shared/types.ts

interface ForceGraphData {
  nodes: ForceNode[];
  edges: ForceEdge[];
  stats: {
    totalSessions: number;
    totalCost: number;
    totalEntities: number;
  };
}

interface ForceNode {
  id: string;
  type: EntityType | "session" | "cost" | "tool" | "agent";
  label: string;
  weight: number;       // Drives node radius. Normalized 0-1 by the server.
                         // For projects: sessionCount relative to max.
                         // For sessions: messageCount relative to max.
                         // For MCPs/skills: connection count relative to max.
  health: "ok" | "warning" | "error" | "unknown";
  meta: Record<string, unknown>;  // Type-specific data for the detail panel
                                   // Projects: { sessionCount, techStack, hasClaudeMd }
                                   // Sessions: { messageCount, toolCount, cost, isActive, slug }
                                   // MCPs: { transport, command }
                                   // etc.
}

interface ForceEdge {
  source: string;        // node id
  target: string;        // node id
  relation: string;      // "defines_mcp" | "has_skill" | "has_session" | etc.
}
```

**`scope=system`** returns all entities (projects, MCPs, skills, plugins, markdown, config) and their explicit Relationship records. No sessions — those appear on drill-in.

**`scope=sessions&project=<projectKey>`** returns the project's sessions as nodes, plus for each session: a summary cost node, tool-type aggregate nodes (one node per tool name used, sized by count), and agent execution nodes. Edges connect session → tools, session → cost, session → agents.

**Weight calculation** (server-side, per scope):
- Find the max value for each node type (e.g., max sessionCount across projects)
- Normalize each node's value to 0-1 against that max
- Clamp minimum to 0.1 so no node is invisible

### 2b. Hook: `client/src/hooks/use-graph.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ForceGraphData } from "@shared/types";

export function useForceGraph(scope: "system" | "sessions", projectKey?: string) {
  const params = new URLSearchParams({ scope });
  if (projectKey) params.set("project", projectKey);

  return useQuery<ForceGraphData>({
    queryKey: [`/api/graph?${params.toString()}`],
    staleTime: 30_000,
  });
}
```

---

## 3. Force simulation hook

Create `client/src/hooks/use-force-layout.ts`

This hook takes nodes and edges, runs a d3-force simulation, and returns positioned nodes (with x, y coordinates) plus the simulation instance for drag interaction.

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { ForceNode, ForceEdge } from "@shared/types";

interface PositionedNode extends ForceNode, SimulationNodeDatum {
  x: number;
  y: number;
  r: number;  // Computed from weight
}

interface PositionedEdge extends SimulationLinkDatum<PositionedNode> {
  relation: string;
}

interface UseForceLayoutOptions {
  width: number;
  height: number;
  minRadius?: number;    // default 6
  maxRadius?: number;    // default 40
}

function useForceLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  options: UseForceLayoutOptions
): {
  positioned: PositionedNode[];
  links: PositionedEdge[];
  simulation: Simulation<PositionedNode, PositionedEdge> | null;
  isDragging: boolean;
  onDragStart: (nodeId: string, event: React.MouseEvent) => void;
  onDrag: (event: React.MouseEvent) => void;
  onDragEnd: () => void;
}
```

**Simulation configuration:**

```typescript
const sim = forceSimulation<PositionedNode>(simNodes)
  .force("link", forceLink<PositionedNode, PositionedEdge>(simEdges)
    .id(d => d.id)
    .distance(d => {
      // Longer links for cross-cluster connections, shorter for parent-child
      const isHierarchical = ["defines_mcp","has_skill","has_claude_md","has_memory","has_session"].includes(d.relation);
      return isHierarchical ? 60 : 120;
    })
    .strength(d => {
      const isHierarchical = ["defines_mcp","has_skill","has_claude_md","has_memory","has_session"].includes(d.relation);
      return isHierarchical ? 0.7 : 0.1;
    })
  )
  .force("charge", forceManyBody()
    .strength(d => -150 - d.r * 5)  // Bigger nodes repel more
  )
  .force("center", forceCenter(width / 2, height / 2).strength(0.05))
  .force("collide", forceCollide<PositionedNode>()
    .radius(d => d.r + 8)            // Padding between nodes
    .strength(0.8)
  )
  .force("x", forceX(width / 2).strength(0.03))
  .force("y", forceY(height / 2).strength(0.03));
```

**Radius calculation:**
```typescript
const { minRadius = 6, maxRadius = 40 } = options;
const r = minRadius + node.weight * (maxRadius - minRadius);
```

**Drag behavior:**
- `onDragStart`: set the dragged node's `fx`, `fy` to current position, reheat simulation (`simulation.alpha(0.3).restart()`)
- `onDrag`: update `fx`, `fy` to mouse position (transformed from screen to SVG coords)
- `onDragEnd`: release `fx`, `fy` (set to null), let simulation settle

**On data change:** When nodes/edges change (e.g., drill-in), preserve positions of existing nodes (carry over x, y), add new nodes near their connected parent, and restart the simulation. Do not reset the whole layout.

---

## 4. Graph renderer component

Create `client/src/components/analytics/entity-graph/EntityGraph.tsx`

This is the main component that replaces `NerveCenterTopology`.

### Structure

```
entity-graph/
├── EntityGraph.tsx        # Main component — SVG graph + sidebar
├── GraphNode.tsx          # Individual node rendering
├── GraphEdge.tsx          # Edge rendering with curved paths
├── GraphSidebar.tsx       # Hover detail + stats panels
├── FlowParticles.tsx      # Animated particles along edges
├── use-force-layout.ts    # (or in hooks/ — either location is fine)
└── index.ts               # Barrel export
```

### EntityGraph.tsx

```typescript
interface EntityGraphProps {
  className?: string;
}

export function EntityGraph({ className }: EntityGraphProps) {
  const [scope, setScope] = useState<"system" | "sessions">("system");
  const [drillProjectKey, setDrillProjectKey] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const { data, isLoading } = useForceGraph(
    scope,
    drillProjectKey ?? undefined
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Measure container with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: Math.max(500, entry.contentRect.height),
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { positioned, links, onDragStart, onDrag, onDragEnd } = useForceLayout(
    data?.nodes ?? [],
    data?.edges ?? [],
    { width: dimensions.width, height: dimensions.height }
  );

  // Compute highlighted subgraph on hover
  const { highlightedNodes, highlightedEdges } = useMemo(() => {
    if (!hoveredNodeId) return { highlightedNodes: new Set<string>(), highlightedEdges: new Set<number>() };
    const nodes = new Set<string>([hoveredNodeId]);
    const edges = new Set<number>();
    links.forEach((e, i) => {
      const sid = (e.source as PositionedNode).id;
      const tid = (e.target as PositionedNode).id;
      if (sid === hoveredNodeId || tid === hoveredNodeId) {
        edges.add(i);
        nodes.add(sid);
        nodes.add(tid);
      }
    });
    return { highlightedNodes: nodes, highlightedEdges: edges };
  }, [hoveredNodeId, links]);

  // ... render
}
```

### Rendering

The graph is a single `<svg>` filling its container:

```
<div ref={containerRef} className="relative w-full h-full min-h-[500px]">
  <svg
    viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
    className="w-full h-full"
    onMouseMove={onDrag}
    onMouseUp={onDragEnd}
    onMouseLeave={onDragEnd}
  >
    {/* Dot grid background */}
    {/* Edges layer */}
    {/* Flow particles layer */}
    {/* Nodes layer (on top) */}
  </svg>

  {/* Sidebar overlaid at right */}
  <GraphSidebar ... />

  {/* Breadcrumb / scope switcher at top-left */}
  {/* Legend at bottom-left */}
</div>
```

### Layout within the Analytics page

In `stats.tsx`, replace:
```typescript
<TabsContent value="nerve-center" className="mt-4">
  <NerveCenterTopology />
</TabsContent>
```
with:
```typescript
<TabsContent value="nerve-center" className="mt-4">
  <EntityGraph />
</TabsContent>
```

The EntityGraph component should fill the available tab content area. Use `h-[calc(100vh-12rem)]` or similar to give it a tall viewport — force graphs need vertical space to breathe.

---

## 5. Node rendering — `GraphNode.tsx`

Each node is an SVG `<g>` group containing:

1. **Halo** (project and session nodes only) — `<circle>` with low opacity fill, slightly larger than the node. Radius pulses gently for active sessions.
2. **Node circle** — `<circle>` with white/surface fill, colored stroke matching entity type.
3. **Inner dot** — small `<circle>` at center, solid fill matching entity type. For active sessions, animate radius with a subtle pulse.
4. **Label** — `<text>` below the node. Only render for nodes with `r > 8` to avoid clutter on small nodes.

**Colors use the existing theme tokens:**

```typescript
const NODE_COLORS: Record<string, string> = {
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
```

**Stroke width by node type:**
- project: 1.5px
- session, mcp, skill: 1px
- everything else: 0.7px

**Interaction:**
- `onMouseEnter` → `setHoveredNodeId(node.id)`
- `onMouseLeave` → `setHoveredNodeId(null)`
- `onClick` → if project node in system scope, drill into sessions
- `onMouseDown` → start drag
- `cursor: grab` on hover, `cursor: grabbing` while dragging
- Opacity transitions: `transition: opacity 150ms ease` — dimmed nodes at `opacity: 0.12`, normal at `1`

**Dimming logic:**
- If no node is hovered: all nodes full opacity
- If a node is hovered: nodes in `highlightedNodes` set are full opacity, all others are `0.12`

---

## 6. Edge rendering — `GraphEdge.tsx`

Edges are curved SVG paths using quadratic bezier curves:

```typescript
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = 0.12;
  return `M${x1},${y1} Q${mx - dy * bend},${my + dx * bend} ${x2},${y2}`;
}
```

**Styling:**
- Hierarchical edges (`defines_mcp`, `has_skill`, `has_claude_md`, `has_memory`, `has_session`, `tool_call`, `cost`, `agent_exec`): solid stroke, 0.8px
- Cross-reference edges (`uses`, `uses_mcp`, `provides_mcp`): dashed stroke `strokeDasharray="3 5"`, 0.5px
- Stroke color: matches the **target** node's type color
- Default opacity: `0.15` for solid, `0.08` for dashed
- Highlighted opacity (when either endpoint is hovered): `0.5`
- Dimmed opacity (when another node is hovered): `0.03`
- `fill="none"` on all paths
- `transition: opacity 150ms ease`

---

## 7. Flow particles — `FlowParticles.tsx`

Subtle animated dots traveling along edges to suggest data flow. Only render on a subset of edges (every 3rd edge, or only hierarchical edges) to keep it calm.

Each particle is a `<circle r="1.8">` with:
- `<animateMotion>` along the edge path
- `<animate>` on opacity: `values="0;0.45;0.45;0"` — fades in and out
- Duration: `2-4s` (randomized per particle)
- Delay: randomized per particle so they don't all sync up
- Fill color: matches the edge's target node type

Performance note: if there are more than ~100 edges, limit particles to the 30 edges with the highest-weight source nodes.

---

## 8. Sidebar — `GraphSidebar.tsx`

Positioned `absolute right-0 top-0 bottom-0 w-56` inside the graph container. Uses existing shadcn Card components.

**Contains three sections:**

### 8a. Hover detail card
- Shows when `hoveredNodeId` is set
- Displays: node name (bold), type badge using `<Badge>`, type-specific metadata from `node.meta`
- For projects: session count, tech stack tags, health indicator
- For sessions: message count, tool count, cost, active status dot
- For MCPs: transport type, command
- Connection count at bottom

When nothing is hovered, show muted text: "Hover a node for details"

### 8b. Stats card
- System totals: entity counts by type, total sessions, total cost
- Use the `data.stats` object from the API response

### 8c. Sparkline cards (optional, v2)
- Cost trend (7d)
- Session activity (7d)
- These could reuse data from the existing `/api/sessions/nerve-center` endpoint

---

## 9. Drill-in behavior

**System → Sessions:**
- User clicks a project node
- `setScope("sessions")`, `setDrillProjectKey(node.meta.projectKey)`
- The hook refetches with new scope
- Existing system-level nodes carry over their positions (matched by id)
- New session nodes initialize near the clicked project node
- Show a breadcrumb at top-left: `System > project-name` with a back button

**Sessions → System (back):**
- User clicks the back button or the breadcrumb
- `setScope("system")`, `setDrillProjectKey(null)`
- Session nodes are removed, system nodes restore

**Future: Session → Detail:**
- Clicking a session node could expand it to show its messages, tool timeline, etc.
- Not required for v1 — a click could instead navigate to the Sessions tab with that session selected

---

## 10. Mobile behavior

Use `useBreakpoint()` and `isMobile(bp)`:
- On mobile, skip the force simulation entirely
- Render a simplified list/card layout grouped by entity type (similar to how `TopologyLayout` already has a mobile fallback)
- The force graph is a desktop experience — small screens don't have the space for it to be useful

---

## 11. Files to create

```
client/src/components/analytics/entity-graph/
├── EntityGraph.tsx
├── GraphNode.tsx
├── GraphEdge.tsx
├── GraphSidebar.tsx
├── FlowParticles.tsx
├── graph-colors.ts        # NODE_COLORS map + edge styling helpers
├── use-force-layout.ts
└── index.ts
```

**Modify:**
- `shared/types.ts` — add `ForceGraphData`, `ForceNode`, `ForceEdge` interfaces
- `client/src/hooks/use-graph.ts` — add `useForceGraph` hook (new file)
- `server/routes/graph.ts` — add `scope` param handling, weight normalization
- `client/src/components/analytics/stats.tsx` — swap `NerveCenterTopology` for `EntityGraph`

**Do not delete** the existing nerve-center components yet — keep them until the new graph is validated.

---

## 12. Suggested build order

1. **Types + API** — Add types to shared/, modify the graph route to support `scope` param and return `ForceGraphData`
2. **Hook** — `useForceGraph` data hook (simple, just wiring)
3. **Force layout hook** — `use-force-layout.ts` with d3-force simulation. Test with console.log of positioned nodes before building any UI
4. **Basic renderer** — `EntityGraph.tsx` rendering circles and lines from positioned data. No hover, no sidebar, no particles yet. Just get nodes on screen in the right positions with the right colors and sizes
5. **Interaction** — Hover highlighting, click drill-in, drag
6. **Sidebar** — Detail panel, stats
7. **Polish** — Curved edges, flow particles, label rendering, transitions, mobile fallback
8. **Swap in** — Replace NerveCenterTopology in stats.tsx
