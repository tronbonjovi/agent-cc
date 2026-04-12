// client/src/components/analytics/messages/bubbles/tool-renderers/grep.tsx
//
// Renderer for the Grep tool. Input shape:
//   { pattern: string, path?: string, glob?: string, type?: string,
//     output_mode?: "content" | "files_with_matches" | "count", ... }
//
// Compact summary shows the pattern in monospace. Path or glob filter, when
// present, appears as a muted suffix so the reader can tell a scoped search
// from a whole-repo one.

import { Search } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function GrepSummary({ input }: ToolRendererProps) {
  const pattern = typeof input.pattern === "string" ? input.pattern : "";
  const path = typeof input.path === "string" ? input.path : "";
  const glob = typeof input.glob === "string" ? input.glob : "";

  // Prefer explicit glob over path when both are present — a glob carries
  // more information for skim-readers ("all .tsx under src/").
  const scope = glob || path;

  return (
    <span className="font-mono text-xs truncate max-w-[560px]" title={pattern}>
      <span>{pattern || "(no pattern)"}</span>
      {scope && <span className="text-muted-foreground"> in {scope}</span>}
    </span>
  );
}

export const grepRenderer: ToolRenderer = {
  icon: Search,
  borderClass: "border-l-amber-500/60",
  Summary: GrepSummary,
};
