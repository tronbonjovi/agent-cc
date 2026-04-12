// client/src/components/analytics/messages/bubbles/tool-renderers/edit.tsx
//
// Renderer for the Edit tool. Input shape:
//   { file_path: string, old_string: string, new_string: string,
//     replace_all?: boolean }
//
// Compact summary shows the file path. A "replace all" suffix appears when
// the flag is set, since a global rename reads very differently from a
// single surgical edit and skim-readers should see it without expanding.

import { Pencil } from "lucide-react";
import type { ToolRenderer, ToolRendererProps } from "./types";

function EditSummary({ input }: ToolRendererProps) {
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  const replaceAll = input.replace_all === true;
  return (
    <span className="font-mono text-xs truncate max-w-[560px]" title={filePath}>
      {filePath || "(no file)"}
      {replaceAll && <span className="text-muted-foreground"> (replace all)</span>}
    </span>
  );
}

export const editRenderer: ToolRenderer = {
  icon: Pencil,
  borderClass: "border-l-violet-500/60",
  Summary: EditSummary,
};
