// client/src/stores/chat-store.ts
//
// Live-events layer for the integrated chat surface.
//
// Prior to the unified-capture milestone (task006), this store held the full
// message list as an ephemeral in-memory buffer. The rewired design splits
// responsibility in two:
//
//   - Persisted conversation history is loaded via React Query
//     (`useChatHistory`) from `GET /api/chat/conversations/:id/events`.
//   - This store holds only the in-flight `liveEvents` buffer — chunks
//     arriving on the active SSE stream that have not yet been flushed to the
//     server's persisted store. When the stream emits `done`, the query is
//     invalidated and `liveEvents` is cleared; the freshly-persisted events
//     re-appear via the query cache.
//
// That gives us reload-survival (history re-fetches on mount) without
// double-rendering the in-flight turn or racing the persistence write.

import { create } from 'zustand';
import type { InteractionEvent } from '../../../shared/types';

interface ChatState {
  /** In-flight events for the active stream; cleared on `done`. */
  liveEvents: InteractionEvent[];
  /** Currently active conversation id. */
  conversationId: string;
  /** True while an assistant turn is streaming. */
  isStreaming: boolean;
  /** Append an event to the live buffer (e.g. a tool_call as it arrives). */
  appendLiveEvent: (event: InteractionEvent) => void;
  /**
   * Remove a live event by id. Used to un-render the optimistic user echo
   * when POST /api/chat/prompt fails so the stranded bubble doesn't stick
   * around after the error banner surfaces.
   */
  removeLiveEvent: (id: string) => void;
  /**
   * Merge an assistant text chunk into the last assistant text event in the
   * buffer, or start a new one if the tail isn't an assistant text event.
   * Mirrors the server-side `assistantTextBuffer` coalescing so the UI shows
   * one growing bubble per turn rather than N chunks.
   */
  coalesceAssistantText: (text: string) => void;
  /** Drop all live events (called after React Query revalidation). */
  clearLive: () => void;
  /** Toggle the streaming flag (drives spinners / input-disabled state). */
  setStreaming: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  liveEvents: [],
  conversationId: 'default',
  isStreaming: false,

  appendLiveEvent: (event) =>
    set((s) => {
      // Idempotent on id collisions — a second line of defense against the
      // server re-emitting the same SSE chunk (e.g. on reconnect) or a
      // workflow/hook_event chunk being appended here and then pulled back
      // through the history revalidation before mergeChatEvents runs.
      if (s.liveEvents.some((e) => e.id === event.id)) return s;
      return { liveEvents: [...s.liveEvents, event] };
    }),

  removeLiveEvent: (id) =>
    set((s) => ({ liveEvents: s.liveEvents.filter((e) => e.id !== id) })),

  coalesceAssistantText: (text) =>
    set((s) => {
      const last = s.liveEvents[s.liveEvents.length - 1];
      if (
        last &&
        last.role === 'assistant' &&
        last.content.type === 'text'
      ) {
        const updated: InteractionEvent = {
          ...last,
          content: { type: 'text', text: last.content.text + text },
        };
        return { liveEvents: [...s.liveEvents.slice(0, -1), updated] };
      }
      // No existing assistant text event — start a new one. This happens on
      // the first text chunk of a turn, or when text follows a tool_call /
      // tool_result that broke the coalescing chain.
      const fresh: InteractionEvent = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conversationId: s.conversationId,
        parentEventId: null,
        timestamp: new Date().toISOString(),
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text },
        cost: null,
      };
      return { liveEvents: [...s.liveEvents, fresh] };
    }),

  clearLive: () => set({ liveEvents: [] }),

  setStreaming: (v) => set({ isStreaming: v }),
}));
