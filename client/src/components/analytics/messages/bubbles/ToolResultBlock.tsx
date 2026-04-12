// client/src/components/analytics/messages/bubbles/ToolResultBlock.tsx
//
// Renders the result of a tool call in the Messages tab timeline. Pairs
// visually with a ToolCallBlock (built in wave 2) — the spec for that
// wave says "a tool_result is nested visually under its parent tool_call
// (matched by toolUseId)", but arranging that nesting is task004's job.
// Here we just render the result as a standalone block that *looks* like
// it wants to be indented (left margin / max-width).
//
// Success vs error divergence:
//   - Error: red-tinted background, output shown expanded by default so
//     failures don't hide behind a click.
//   - Success: neutral background, output collapsed by default with a
//     "Show output" toggle. Tool output is often long and usually not
//     interesting when it succeeded.
//
// Output truncation: caps at OUTPUT_CHAR_CAP characters OR OUTPUT_LINE_CAP
// lines. Beyond that we show a "Show more" toggle that expands to the
// full content. Raw <pre> rendering throughout — tool output is stdout,
// not markdown.

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { ToolResultMessage } from "@shared/session-types";
import { highlightText, useSearchHighlight } from "../search-highlight";

/**
 * Soft caps for truncation. Tuned to comfortably fit a typical terminal
 * scrollback without making long Read/Grep results unreviewable. Tweak
 * freely — the component API doesn't depend on these.
 */
const OUTPUT_CHAR_CAP = 2000;
const OUTPUT_LINE_CAP = 50;

/** Returns true when the output exceeds either the char or line cap. */
function isTruncatable(text: string): boolean {
  if (text.length > OUTPUT_CHAR_CAP) return true;
  // Count newlines — cheaper than .split("\n").length for long strings.
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines++;
      if (lines > OUTPUT_LINE_CAP) return true;
    }
  }
  return false;
}

/** Cap text at the soft limits, returning the visible slice. */
function truncate(text: string): string {
  if (text.length <= OUTPUT_CHAR_CAP) {
    // Still might exceed line cap — trim on lines.
    const lines = text.split("\n");
    if (lines.length <= OUTPUT_LINE_CAP) return text;
    return lines.slice(0, OUTPUT_LINE_CAP).join("\n");
  }
  return text.slice(0, OUTPUT_CHAR_CAP);
}

export interface ToolResultBlockProps {
  message: ToolResultMessage;
}

export function ToolResultBlock({ message }: ToolResultBlockProps) {
  const isError = message.isError;
  const highlight = useSearchHighlight();

  // Success: collapsed by default. Error: expanded by default — failures
  // should surface without a click.
  const [showOutput, setShowOutput] = useState(isError);

  // Show-more state for truncated output, independent of show-output.
  // When search is active, force-render the full content so a match
  // deep in the output isn't hidden behind the Show more toggle. The
  // auto-expand effect in the viewer already clicks the "Show output"
  // disclosure; we handle the "Show more" truncation by treating
  // search-active as implicit show-full.
  const [showFull, setShowFull] = useState(false);
  const truncatable = isTruncatable(message.content);
  const effectiveShowFull = showFull || highlight != null;
  const visible = effectiveShowFull
    ? message.content
    : truncate(message.content);

  // Visual styling:
  //   - Indented under an implicit parent tool-call (ml-6).
  //   - Max-width caps runaway wide output.
  //   - Red tint on error; neutral on success.
  const containerClass = isError
    ? "ml-6 max-w-[900px] px-3 py-2 bg-red-500/10 border-l-2 border-l-red-500/60 rounded-r"
    : "ml-6 max-w-[900px] px-3 py-2 bg-muted/30 border-l-2 border-l-muted-foreground/20 rounded-r";

  return (
    <div data-message-type="tool_result" className={containerClass}>
      {/* Header: toggle + error label (when applicable). */}
      <button
        type="button"
        onClick={() => setShowOutput(!showOutput)}
        className="flex items-center gap-1.5 text-xs hover:text-foreground transition-colors w-full text-left"
        aria-expanded={showOutput}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${
            showOutput ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
        {isError && (
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 text-red-400"
            aria-hidden="true"
          />
        )}
        <span
          className={
            isError
              ? "text-red-400 font-medium"
              : "text-muted-foreground"
          }
        >
          {isError ? "Error" : "Show output"}
        </span>
      </button>

      {/* Output body — plain <pre> so tool output renders verbatim. Search
          matches get wrapped in <mark> spans via `highlightText`. */}
      {showOutput && (
        <div className="mt-2">
          <pre className="whitespace-pre-wrap break-words text-[11px] font-mono text-muted-foreground max-h-[600px] overflow-y-auto">
            {highlight
              ? highlightText(
                  visible,
                  highlight,
                  highlight.getGlobalOffsetFor(message),
                )
              : visible}
          </pre>
          {truncatable && !effectiveShowFull && (
            <button
              type="button"
              onClick={() => setShowFull(true)}
              className="mt-1 text-[11px] text-primary hover:underline"
            >
              Show more ({message.content.length.toLocaleString()} chars)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
