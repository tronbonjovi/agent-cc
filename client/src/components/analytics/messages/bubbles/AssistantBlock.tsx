// client/src/components/analytics/messages/bubbles/AssistantBlock.tsx
//
// Renders a Claude assistant text turn in the Messages tab timeline.
//
// Design notes:
//   - Full-width block, distinct background from UserBubble (neutral
//     card-like surface instead of primary tint).
//   - Full markdown rendering via react-markdown + remark-gfm. Code fences
//     are rendered as plain <pre> with a subtle background — no syntax
//     highlighting. This is an explicit scope call for wave 1; a future
//     polish task can add a syntax highlighter on top without touching this
//     file's public API.
//   - Optional badges:
//     * Stop reason pill (amber): shown when stopReason is anything other
//       than "end_turn". Highlights incomplete turns (max_tokens, etc.) so
//       readers don't wonder why the answer ended mid-thought.
//     * Model badge: shown when `previousModel` differs from `model` (or
//       when the caller omits previousModel, treating every bubble as if
//       it's the first). The caller is expected to pass the prior turn's
//       model so the badge appears only on model switches.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { relativeTime, shortModel } from "@/lib/utils";
import type { AssistantTextMessage } from "@shared/session-types";

export interface AssistantBlockProps {
  message: AssistantTextMessage;
  /**
   * The model string of the previous assistant turn in the session, used
   * to decide whether to display a model-change badge. When omitted the
   * badge is suppressed — callers that don't know or don't care simply
   * leave this out.
   */
  previousModel?: string;
}

/**
 * Custom renderers for react-markdown that style code blocks with a neutral
 * monospace background, no syntax highlighting. Defined at module scope so
 * react-markdown doesn't rebuild them on every render.
 */
const markdownComponents = {
  pre({ children, ...props }: React.ComponentProps<"pre">) {
    return (
      <pre
        className="my-2 p-3 rounded bg-muted/60 text-xs font-mono whitespace-pre-wrap break-words overflow-x-auto"
        {...props}
      >
        {children}
      </pre>
    );
  },
  code({ className, children, ...props }: React.ComponentProps<"code">) {
    // Inline code (no parent <pre>) gets a small pill; block code inherits
    // the <pre> styling above. react-markdown distinguishes the two by
    // whether className contains "language-*".
    const isInline = !className || !className.startsWith("language-");
    if (isInline) {
      return (
        <code
          className="px-1 py-0.5 rounded bg-muted/60 text-[11px] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function AssistantBlock({ message, previousModel }: AssistantBlockProps) {
  // Stop-reason pill: anything other than end_turn is worth flagging.
  // end_turn is the normal completion path; max_tokens/tool_use/stop_sequence
  // are unusual and worth a visual marker.
  const showStopReason =
    message.stopReason && message.stopReason !== "end_turn";

  // Model-change badge: show when this turn uses a different model than
  // the previous one, or when the previous model is unknown (first turn
  // in the visible window).
  const showModelBadge = !previousModel || previousModel !== message.model;

  return (
    <div
      data-message-type="assistant_text"
      className="group relative px-4 py-3 bg-muted/40 border-l-2 border-l-muted-foreground/30 rounded-r"
    >
      {/* Badge row — optional, muted, shows model switches and stop reason. */}
      {(showStopReason || showModelBadge) && (
        <div className="flex items-center gap-2 mb-2 text-[10px]">
          {showModelBadge && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              {shortModel(message.model)}
            </span>
          )}
          {showStopReason && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
              {message.stopReason}
            </span>
          )}
        </div>
      )}

      {/* Body — markdown with GFM + custom code renderers. */}
      <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.text}
        </Markdown>
      </div>

      {/* Corner timestamp on hover, matching UserBubble's convention. */}
      <div
        className="absolute top-1 right-2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        title={message.timestamp}
      >
        {relativeTime(message.timestamp)}
      </div>
    </div>
  );
}
