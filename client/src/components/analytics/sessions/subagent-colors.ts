// client/src/components/analytics/sessions/subagent-colors.ts
//
// Shared subagent palette + owner-resolution helpers (flat-to-tree wave2 task001).
//
// Extracted unchanged from ToolTimeline.tsx so TokenBreakdown, FileImpact,
// and other tree-aware views can color rows by owning subagent without
// duplicating the palette / hash / walk logic. ToolTimeline.tsx re-exports
// the four originals from this module for backward compatibility.

import type {
  ToolExecution,
  SerializedSessionTreeForClient,
  SessionTreeNode,
} from "@shared/session-types";

/**
 * Resolved owner of a tool call: either the parent session itself
 * (`session-root`, neutral color) or a subagent root carrying its `agentId`.
 * The owner determines the color tag rendered next to the tool row.
 */
export interface ToolOwner {
  kind: "session-root" | "subagent-root";
  agentId: string | null;
}

/**
 * Walk the parentId chain from the tool's issuing assistant turn up to either
 * `session-root` or `subagent-root`. Defensive: a missing turn or broken
 * parent chain falls back to `session-root` so an unexpected tree shape
 * still renders cleanly with a neutral color tag.
 */
export function resolveToolOwner(
  tree: SerializedSessionTreeForClient,
  tool: ToolExecution,
): ToolOwner {
  // Defensive: callers may pass null/undefined when ?include=tree wasn't
  // requested. We can't tighten the static signature without churning every
  // call site, so we guard at runtime and fall back to the neutral owner.
  if (!tree) {
    return { kind: "session-root", agentId: null };
  }
  const startId = `asst:${tool.issuedByAssistantUuid}`;
  let node: SessionTreeNode | undefined = tree.nodesById[startId];
  // Cap walk length so a malformed tree with a parentId cycle can never hang.
  let safety = 256;
  while (node && safety-- > 0) {
    if (node.kind === "session-root") {
      return { kind: "session-root", agentId: null };
    }
    if (node.kind === "subagent-root") {
      // SubagentRootNode has agentId; the type narrowing is enforced by the
      // shared types. Read defensively in case wire data is malformed.
      const agentId = (node as { agentId?: string }).agentId ?? null;
      return { kind: "subagent-root", agentId };
    }
    if (node.parentId == null) break;
    node = tree.nodesById[node.parentId];
  }
  return { kind: "session-root", agentId: null };
}

/**
 * Resolve the owner of a specific assistant turn by id (rather than via a
 * tool execution). Used by token-breakdown / row-level views in tasks 002-004
 * that already know the turn id and don't need to go through a ToolExecution.
 *
 * Behavior matches `resolveToolOwner`: walk the parentId chain to the first
 * `session-root` or `subagent-root` ancestor; defensive fallback to
 * `session-root` for null trees, missing turn ids, or broken chains.
 */
export function resolveAssistantTurnOwner(
  tree: SerializedSessionTreeForClient | null | undefined,
  turnId: string,
): ToolOwner {
  if (!tree) {
    return { kind: "session-root", agentId: null };
  }
  let node: SessionTreeNode | undefined = tree.nodesById[turnId];
  if (!node) {
    return { kind: "session-root", agentId: null };
  }
  // Cap walk length so a malformed tree with a parentId cycle can never hang.
  let safety = 256;
  while (node && safety-- > 0) {
    if (node.kind === "session-root") {
      return { kind: "session-root", agentId: null };
    }
    if (node.kind === "subagent-root") {
      const agentId = (node as { agentId?: string }).agentId ?? null;
      return { kind: "subagent-root", agentId };
    }
    if (node.parentId == null) break;
    node = tree.nodesById[node.parentId];
  }
  return { kind: "session-root", agentId: null };
}

/**
 * Deterministic color palette for subagent owners. Six visually distinct
 * Tailwind classes — kept inline (no shared theme token) per task contract.
 * The first entry being a non-empty class is required for tests; do not
 * reorder without updating call sites.
 */
export const PALETTE: readonly string[] = [
  "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
] as const;

/**
 * Map an owner to its color-tag CSS class. Parent-session owners (and any
 * defensive fallback) return an empty string so the row stays visually
 * unchanged from the pre-tree look. Subagent owners hash their `agentId` to a
 * stable palette index — same agent always gets the same color across
 * re-renders and views.
 */
export function colorClassForOwner(owner: ToolOwner): string {
  if (owner.kind !== "subagent-root" || !owner.agentId) return "";
  let hash = 0;
  for (let i = 0; i < owner.agentId.length; i++) {
    hash = (hash + owner.agentId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
