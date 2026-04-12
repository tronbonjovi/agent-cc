// client/src/components/analytics/messages/bubbles/UserBubble.tsx
//
// Renders a single user text message in the Messages tab timeline.
//
// Design notes:
//   - Left-aligned. The Messages tab is a transcript reader, not a chat UI,
//     so user and assistant both sit on the left with distinct backgrounds
//     instead of opposite sides. This keeps long reads skimmable and plays
//     nicely with tool-call nesting and subagent grouping that the later
//     tasks layer on top.
//   - Subtle primary-tinted background so the user's voice is visually
//     distinct from the assistant's block but neither one dominates.
//   - Full markdown rendering via react-markdown + remark-gfm. Users paste
//     a lot of structured stuff (lists, fenced code, tables), so rendering
//     markdown faithfully is load-bearing.
//   - No associated-tool-calls footer: UserTextMessage in shared/session-types
//     has no `toolUseIds` field (user tool_result records are a different
//     TimelineMessage variant entirely — `tool_result`). If a future task
//     adds the association on the type, this is the place to render it.
//
// task006 search:
//   - When search is active (useSearchHighlight returns non-null), switch
//     from markdown rendering to a highlighted plain-text render so
//     matches can be wrapped in <mark>. Markdown rendering doesn't play
//     well with per-character highlighting; dismissing search restores
//     the normal markdown view. Contract explicitly permits this tradeoff
//     (perfect highlighting of every variant is not required; text-body
//     matching is the minimum bar).

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { relativeTime } from "@/lib/utils";
import type { UserTextMessage } from "@shared/session-types";
import { highlightText, useSearchHighlight } from "../search-highlight";

export interface UserBubbleProps {
  message: UserTextMessage;
}

export function UserBubble({ message }: UserBubbleProps) {
  const highlight = useSearchHighlight();

  // Sidechain user records are agent-to-agent dispatch prompts (the text
  // a parent agent sent TO a subagent when invoking it via the Agent tool),
  // not human input. Render them muted with an "Agent Prompt" label so
  // they're clearly distinct from the user's real blue-tinted bubbles.
  // The surrounding SidechainGroup still carries the subagent color, so
  // keeping this inner bubble neutral lets the group's identity dominate.
  const isAgentPrompt = message.isSidechain === true;

  return (
    <div
      data-message-type="user_text"
      data-agent-prompt={isAgentPrompt ? "true" : undefined}
      className={
        isAgentPrompt
          ? "group relative px-4 py-3 bg-muted/40 border-l-4 border-l-muted-foreground/50 rounded-r"
          : "group relative px-4 py-3 bg-blue-500/10 border-l-4 border-l-blue-500 rounded-r"
      }
    >
      {/* Role label — always present so at-a-glance sender identification
          works without relying on subtle background cues. Sidechain user
          records get "Agent Prompt" in muted gray so they don't compete
          with real human input. */}
      <div className="mb-1.5">
        <span
          className={
            isAgentPrompt
              ? "text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              : "text-[11px] font-bold uppercase tracking-wider text-blue-400"
          }
        >
          {isAgentPrompt ? "Agent Prompt" : "User"}
        </span>
      </div>

      {/* Body — when search is active, render a plain-text highlighted
          view so matches carry visible <mark> spans. When idle, render
          full markdown with GFM. */}
      {highlight ? (
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {highlightText(
            message.text,
            highlight,
            highlight.getGlobalOffsetFor(message),
          )}
        </div>
      ) : (
        <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
        </div>
      )}

      {/* Timestamp — corner-anchored, fades in on hover to stay out of the
          way during a normal read-through but available when the user wants
          to anchor the event in time. */}
      <div
        className="absolute top-1 right-2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        title={message.timestamp}
      >
        {relativeTime(message.timestamp)}
      </div>
    </div>
  );
}
