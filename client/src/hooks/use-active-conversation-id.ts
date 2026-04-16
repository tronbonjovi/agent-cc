// client/src/hooks/use-active-conversation-id.ts
//
// task007 — the single seam between `ChatPanel` and `useChatTabsStore`.
//
// ChatPanel MUST source the active conversation id through this hook, not
// via a direct `useChatTabsStore(...)` subscribe. The indirection narrows
// the task006 regression lock (which originally banned any mention of
// `useChatTabsStore` in `chat-panel.tsx`) to a single hook wrapper — the
// panel itself stays ignorant of the tabs store and its persistence layer.
//
// Fallback contract: when `activeTabId` is `null` (fresh install, all tabs
// closed, or the server returned an empty state), we return the sentinel
// `'default'`. That keeps the conversation id source non-nullable for the
// rest of the panel (history query key, SSE url, prompt POST body), so
// there's no "no conversation selected" branch to wire in every consumer.
// In practice the `'default'` conversation is only hit transiently during
// the first-mount auto-create flow before the "Main" tab lands.

import { useChatTabsStore } from '@/stores/chat-tabs-store';

/**
 * Pure helper exposed for testing. Zustand selectors can't be run under
 * vitest's non-React environment, but the fallback logic is the only
 * non-trivial thing worth pinning — isolate it so tests can call it
 * directly.
 */
export function resolveActiveConversationId(
  activeTabId: string | null,
): string {
  if (!activeTabId) return 'default';
  return activeTabId;
}

/**
 * React hook that subscribes to `useChatTabsStore.activeTabId` and applies
 * the fallback. Components should treat the returned value as opaque — it's
 * either a real conversation id or the `'default'` sentinel.
 */
export function useActiveConversationId(): string {
  const activeTabId = useChatTabsStore((s) => s.activeTabId);
  return resolveActiveConversationId(activeTabId);
}
