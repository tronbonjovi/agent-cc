// client/src/components/analytics/messages/bubbles/index.ts
//
// Barrel export for the Messages tab bubble components. Re-exports every
// individual bubble plus the central dispatcher (`renderMessage`) from
// `./dispatcher`. Kept as a pure barrel so SidechainGroup can import the
// dispatcher directly without a circular dependency back through this
// file — SidechainGroup's internal `renderMessage` call is what makes
// the cycle awkward, so the implementation lives in `dispatcher.ts`
// and this file only re-exports it.
//
// External callers (task004's ConversationViewer and the Messages tab
// at large) import everything from `.../bubbles` — they don't need to
// know the two-file split.

export { renderMessage } from "./dispatcher";
export type { RenderMessageOptions } from "./dispatcher";

export { UserBubble } from "./UserBubble";
export type { UserBubbleProps } from "./UserBubble";

export { AssistantBlock } from "./AssistantBlock";
export type { AssistantBlockProps } from "./AssistantBlock";

export { ThinkingBlock } from "./ThinkingBlock";
export type { ThinkingBlockProps } from "./ThinkingBlock";

export { ToolCallBlock } from "./ToolCallBlock";
export type { ToolCallBlockProps } from "./ToolCallBlock";

export { ToolResultBlock } from "./ToolResultBlock";
export type { ToolResultBlockProps } from "./ToolResultBlock";

export { SystemEventBlock } from "./SystemEventBlock";
export type { SystemEventBlockProps } from "./SystemEventBlock";

export { SidechainGroup } from "./SidechainGroup";
export type { SidechainGroupProps } from "./SidechainGroup";
