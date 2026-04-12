// client/src/components/analytics/messages/bubbles/tool-renderers/write.tsx
//
// Renderer for the Write tool. Input shape:
//   { file_path: string, content: string }
//
// Compact summary shows the file path (monospace). Full content is
// intentionally hidden — new-file writes are often large, and seeing the
// path is usually enough to orient. ToolCallBlock's expand view shows the
// full input for readers who want the payload.

import { FilePlus } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function WriteSummary({ input }: ToolRendererProps) {
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  const content = typeof input.content === "string" ? input.content : "";
  const charCount = content.length;
  return (
    <span className="font-mono text-xs truncate max-w-[560px]" title={filePath}>
      {filePath || "(no file)"}
      {charCount > 0 && (
        <span className="text-muted-foreground"> ({charCount.toLocaleString()} chars)</span>
      )}
    </span>
  );
}

export const writeRenderer: ToolRenderer = {
  icon: FilePlus,
  borderClass: "border-l-pink-500/60",
  Summary: WriteSummary,
};
