// client/src/components/analytics/messages/bubbles/tool-renderers/agent.tsx
//
// Renderer for the Agent / Task tool (subagent dispatch). Input shape:
//   { description: string, prompt: string, subagent_type?: string, ... }
//
// Compact summary shows the short description field — that's the single
// most useful orienting string for a subagent call. The subagent_type
// appears as a muted prefix so readers can spot specialist dispatches
// (code-reviewer, Explore, etc.) without expanding.

import { Bot } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function AgentSummary({ input }: ToolRendererProps) {
  const description = typeof input.description === "string" ? input.description : "";
  const subagentType =
    typeof input.subagent_type === "string" ? input.subagent_type : "";
  return (
    <span className="text-xs truncate max-w-[560px]" title={description}>
      {subagentType && (
        <span className="font-mono text-muted-foreground mr-1">
          {subagentType}:
        </span>
      )}
      <span>{description || "(no description)"}</span>
    </span>
  );
}

export const agentRenderer: ToolRenderer = {
  icon: Bot,
  borderClass: "border-l-cyan-500/60",
  Summary: AgentSummary,
};
