// client/src/components/analytics/messages/bubbles/dispatcher.ts
//
// Implementation of the central timeline dispatcher. Lives in its own
// file (not inside `index.ts`) specifically to keep SidechainGroup's
// import path out of any circular dependency with the barrel: SidechainGroup
// needs to call renderMessage on its nested children, and having the
// dispatcher here lets SidechainGroup import it directly without pulling
// the full barrel back through itself.
//
// Exhaustive over TimelineMessage variants. SkillInvocation renders as a
// minimal inline annotation because it has no dedicated bubble in the
// milestone's 7-component contract.

import { createElement, type ReactNode } from "react";
import type { TimelineMessage } from "@shared/session-types";
import { UserBubble } from "./UserBubble";
import { AssistantBlock } from "./AssistantBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolResultBlock } from "./ToolResultBlock";
import { SystemEventBlock } from "./SystemEventBlock";

/** Options forwarded to individual bubbles when relevant. */
export interface RenderMessageOptions {
  /** Model string of the previous assistant turn — drives AssistantBlock's model-change badge. */
  previousModel?: string;
}

/**
 * Render a single timeline message as its matching bubble/block component.
 * Exhaustive over `TimelineMessage.type` — the default branch is a TypeScript
 * `never` guard so adding a new variant to the shared type is a compile
 * error until the dispatcher gets a matching case.
 */
export function renderMessage(
  message: TimelineMessage,
  opts: RenderMessageOptions = {},
): ReactNode {
  switch (message.type) {
    case "user_text":
      return createElement(UserBubble, { message });
    case "assistant_text":
      return createElement(AssistantBlock, {
        message,
        previousModel: opts.previousModel,
      });
    case "thinking":
      return createElement(ThinkingBlock, { message });
    case "tool_call":
      return createElement(ToolCallBlock, { message });
    case "tool_result":
      return createElement(ToolResultBlock, { message });
    case "system_event":
      return createElement(SystemEventBlock, { message });
    case "skill_invocation":
      // Minimal inline annotation — no dedicated bubble for this variant.
      return createElement(
        "div",
        {
          "data-message-type": "skill_invocation",
          className: "px-3 py-1 text-xs text-muted-foreground font-mono",
        },
        `/${message.commandName}${message.commandArgs ? ` ${message.commandArgs}` : ""}`,
      );
    default: {
      // Exhaustiveness guard — TypeScript narrows to `never` here.
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}
