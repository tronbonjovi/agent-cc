// client/src/components/analytics/messages/bubbles/tool-renderers/fallback.tsx
//
// Fallback renderer for tools with no registered renderer. New tools land
// in sessions all the time (MCP servers, plugin tools, custom commands),
// and the registry must render them without a code change. This renderer
// picks the first string-valued input key as the compact summary so the
// reader sees *something* relevant, and ToolCallBlock's expand view shows
// the full JSON input below.

import { Wrench } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function FallbackSummary({ input }: ToolRendererProps) {
  // Find the first string-valued input field. Prefer keys that commonly
  // carry the most-descriptive param across MCP tools.
  const preferredKeys = ["query", "name", "description", "path", "url", "text"];
  let primary = "";
  for (const key of preferredKeys) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) {
      primary = v;
      break;
    }
  }
  if (!primary) {
    for (const [, v] of Object.entries(input)) {
      if (typeof v === "string" && v.length > 0) {
        primary = v;
        break;
      }
    }
  }
  return (
    <span className="font-mono text-xs text-muted-foreground truncate max-w-[560px]">
      {primary || "(no summary)"}
    </span>
  );
}

export const fallbackRenderer: ToolRenderer = {
  icon: Wrench,
  borderClass: "border-l-muted-foreground/40",
  Summary: FallbackSummary,
};
