// client/src/components/analytics/messages/bubbles/tool-renderers/read.tsx
//
// Renderer for the Read tool. Input shape:
//   { file_path: string, offset?: number, limit?: number }
//
// Compact summary shows the file path (monospace). Line range, when
// present, shows as a muted suffix so skimmers can tell a partial read
// from a full-file read at a glance.

import { FileText } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function ReadSummary({ input }: ToolRendererProps) {
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;

  // Build an optional " (lines X-Y)" suffix when offset/limit are present.
  // Only offset → "(from line X)"; only limit → "(first X lines)".
  let range = "";
  if (offset != null && limit != null) {
    range = ` (lines ${offset}–${offset + limit - 1})`;
  } else if (offset != null) {
    range = ` (from line ${offset})`;
  } else if (limit != null) {
    range = ` (first ${limit} lines)`;
  }

  return (
    <span className="font-mono text-xs truncate max-w-[560px]" title={filePath}>
      {filePath || "(no file)"}
      {range && <span className="text-muted-foreground">{range}</span>}
    </span>
  );
}

export const readRenderer: ToolRenderer = {
  icon: FileText,
  borderClass: "border-l-sky-500/60",
  Summary: ReadSummary,
};
