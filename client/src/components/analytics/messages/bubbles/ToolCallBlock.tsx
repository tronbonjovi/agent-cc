// client/src/components/analytics/messages/bubbles/ToolCallBlock.tsx
//
// Renders a single tool_call message in the Messages tab timeline. The
// compact header uses the tool's dedicated renderer from the registry
// (Bash → command, Read → file path, Grep → pattern, etc.) so skim-readers
// see the most useful parameter at a glance without expanding.
//
// Click to expand the full input as a JSON dump — that's the escape hatch
// for tools with extra params the compact summary doesn't surface, and the
// universal fallback for unknown tools whose only rendering is "show me
// the raw input". ToolCallMessage.input is `Record<string, unknown>` — the
// parser doesn't impose a schema, so each renderer owns its field
// knowledge and the expand view shows the unmodified object.
//
// Pairing with ToolResultBlock (success/error, duration) is task004's job.
// This component deliberately does not consume its corresponding result —
// the Messages tab's conversation viewer is where that linkage lives.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCallMessage } from "@shared/session-types";
import { getToolRenderer } from "./tool-renderers";

export interface ToolCallBlockProps {
  message: ToolCallMessage;
}

export function ToolCallBlock({ message }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const renderer = getToolRenderer(message.name);
  const Icon = renderer.icon;
  const Summary = renderer.Summary;

  // Accent stripe uses the renderer-provided left-border class so each
  // tool type has a distinct visual identity. Background stays neutral
  // to match the other muted-toned blocks in the timeline.
  const containerClass =
    `px-3 py-2 bg-muted/20 border-l-2 ${renderer.borderClass} rounded-r`;

  return (
    <div data-message-type="tool_call" data-tool-name={message.name} className={containerClass}>
      {/* Header row: chevron + icon + tool name + renderer's compact summary. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-mono font-medium text-foreground shrink-0">
          {message.name}
        </span>
        <span className="flex-1 min-w-0">
          <Summary input={message.input} />
        </span>
      </button>

      {/* Expanded body: full raw input as a JSON dump. No markdown, no
          renderer-specific view — the universal escape hatch. */}
      {expanded && (
        <div className="mt-2 ml-5">
          <pre className="whitespace-pre-wrap break-words text-[11px] font-mono text-muted-foreground bg-muted/40 rounded p-2 max-h-[400px] overflow-y-auto">
            {JSON.stringify(message.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
