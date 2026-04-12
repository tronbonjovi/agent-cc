// client/src/components/analytics/messages/bubbles/tool-renderers/index.ts
//
// Tool renderer registry. Each Claude Code tool (Bash, Read, Grep, Edit,
// Write, Agent, ...) has a dedicated module in this directory; they're
// wired into a Map here so ToolCallBlock can look up the right renderer
// by tool name without a switch statement that grows every time a new
// tool lands. Unknown tools fall back to a generic renderer that still
// picks out the most descriptive string field from the input object.
//
// Adding a new tool:
//   1. Create `<tool-lowercase>.tsx` exporting a `<tool>Renderer: ToolRenderer`
//   2. Import it below and add it to the TOOL_RENDERERS Map
//   3. Done — ToolCallBlock picks it up automatically
//
// The fallback renderer is exported separately so ToolCallBlock can use
// it directly when a lookup misses; it also covers MCP / plugin tools
// whose names aren't known until session-time.

import { bashRenderer } from "./bash";
import { readRenderer } from "./read";
import { grepRenderer } from "./grep";
import { editRenderer } from "./edit";
import { writeRenderer } from "./write";
import { agentRenderer } from "./agent";
import { fallbackRenderer } from "./fallback";
import type { ToolRenderer } from "./types";

export type { ToolRenderer, ToolRendererProps } from "./types";

/**
 * Registry of tool name → renderer. Names match `ToolCallMessage.name`
 * exactly (case-sensitive). The Agent/Task tool is registered under both
 * `Agent` and `Task` so either wire-format spelling picks up the renderer.
 */
export const TOOL_RENDERERS: Map<string, ToolRenderer> = new Map([
  ["Bash", bashRenderer],
  ["Read", readRenderer],
  ["Grep", grepRenderer],
  ["Edit", editRenderer],
  ["Write", writeRenderer],
  ["Agent", agentRenderer],
  ["Task", agentRenderer],
]);

export const FALLBACK_RENDERER = fallbackRenderer;

/**
 * Resolve a tool renderer by name, returning the fallback renderer when
 * no registered entry matches. Callers should never need to branch on
 * undefined — this always returns a usable ToolRenderer.
 */
export function getToolRenderer(name: string): ToolRenderer {
  return TOOL_RENDERERS.get(name) ?? FALLBACK_RENDERER;
}
