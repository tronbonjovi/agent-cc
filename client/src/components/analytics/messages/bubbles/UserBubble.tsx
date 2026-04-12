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

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { relativeTime } from "@/lib/utils";
import type { UserTextMessage } from "@shared/session-types";

export interface UserBubbleProps {
  message: UserTextMessage;
}

export function UserBubble({ message }: UserBubbleProps) {
  return (
    <div
      data-message-type="user_text"
      className="group relative px-4 py-3 bg-primary/5 border-l-2 border-l-primary/40 rounded-r"
    >
      {/* Body — rendered as markdown with GFM extensions (tables, tasklists,
          autolinks, strikethrough). Prose styles are applied via Tailwind's
          typography defaults tuned to our palette. */}
      <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
      </div>

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
