// client/src/components/analytics/messages/bubbles/ThinkingBlock.tsx
//
// Renders a Claude "thinking" (extended reasoning) block in the Messages
// tab timeline. Thinking is the model's internal reasoning surfaced by
// Claude Code sessions — visually secondary to the actual assistant reply,
// so this component is:
//
//   - Collapsed by default, expandable via a click.
//   - Muted gray italic so it never competes with the main conversation.
//   - Rendered as preformatted plain text (no markdown). Thinking contains
//     raw prose with newlines the model meant to keep — rendering it as
//     markdown would eat line breaks and collapse paragraphs.
//
// Note on the label: the original spec called for "Thinking... (N tokens)"
// where N is the thinking token count. `ThinkingMessage` in
// `shared/session-types` has no token-count field (only `uuid`, `text`,
// `timestamp`), so we fall back to a character-length approximation rendered
// as "(X chars)". If a future task enriches the type with a token count,
// swap the character math for the real value — the label is the only line
// that needs touching.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ThinkingMessage } from "@shared/session-types";
import { highlightText, useSearchHighlight } from "../search-highlight";

export interface ThinkingBlockProps {
  message: ThinkingMessage;
}

/** Format a character count with thousands separators for the collapsed header. */
function formatCharLength(text: string): string {
  const n = text.length;
  return n.toLocaleString();
}

export function ThinkingBlock({ message }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const charLabel = formatCharLength(message.text);
  const highlight = useSearchHighlight();

  return (
    <div
      data-message-type="thinking"
      className="px-3 py-1.5 text-xs text-muted-foreground italic"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
        <span>Thinking... ({charLabel} chars)</span>
      </button>

      {expanded && (
        <pre className="mt-2 ml-4 whitespace-pre-wrap text-xs text-muted-foreground italic font-sans">
          {highlight
            ? highlightText(
                message.text,
                highlight,
                highlight.getGlobalOffsetFor(message),
              )
            : message.text}
        </pre>
      )}
    </div>
  );
}
