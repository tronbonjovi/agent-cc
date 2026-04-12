// client/src/components/analytics/messages/bubbles/tool-renderers/bash.tsx
//
// Renderer for the Bash tool. Input shape (informal, from Claude Code):
//   { command: string, description?: string, timeout?: number }
//
// Compact summary shows the command in a monospace slab. Commands can be
// long; we cap the visible width and let ToolCallBlock's expand view show
// the full input when the user clicks.

import { Terminal } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function BashSummary({ input }: ToolRendererProps) {
  const command = typeof input.command === "string" ? input.command : "";
  return (
    <span className="font-mono text-xs truncate max-w-[560px]" title={command}>
      {command || "(no command)"}
    </span>
  );
}

export const bashRenderer: ToolRenderer = {
  icon: Terminal,
  borderClass: "border-l-emerald-500/60",
  Summary: BashSummary,
};
