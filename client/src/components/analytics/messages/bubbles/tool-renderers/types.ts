// client/src/components/analytics/messages/bubbles/tool-renderers/types.ts
//
// Shared types for the tool renderer registry. Each Claude Code tool
// (Bash, Read, Grep, Edit, Write, Agent, ...) gets its own renderer module
// that knows the shape of its `input` object. The dispatcher below looks up
// a renderer by tool name and falls back to a generic JSON dump for unknown
// tools — new tools land cleanly without a switch statement growing forever.

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/** Primary prop passed to every tool renderer's Summary component. */
export interface ToolRendererProps {
  /** Raw ToolCallMessage.input — shape is tool-specific, no central schema. */
  input: Record<string, unknown>;
}

/**
 * A tool renderer bundles the visual identity of a single tool: its icon,
 * the left-border accent color it uses in ToolCallBlock, and a Summary
 * component that produces the one-line compact label from the tool's raw
 * input object. Rendering the full parameter dump on expand lives in
 * ToolCallBlock itself — renderers only own the compact "what does this
 * call do at a glance" line.
 */
export interface ToolRenderer {
  icon: LucideIcon;
  /** Tailwind class for the left-border accent, e.g. `border-l-emerald-500/60`. */
  borderClass: string;
  /** Compact one-line summary rendered in the collapsed ToolCallBlock header. */
  Summary: ComponentType<ToolRendererProps>;
}
