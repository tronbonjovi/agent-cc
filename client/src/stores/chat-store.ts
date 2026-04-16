// client/src/stores/chat-store.ts
//
// Live-events + drafts layer for the integrated chat surface.
//
// History vs live split (unified-capture M4 / task006):
//
//   - Persisted conversation history is loaded via React Query
//     (`useChatHistory`) from `GET /api/chat/conversations/:id/events`.
//   - This store holds only the in-flight `liveEvents` buffer — chunks
//     arriving on the active SSE stream that have not yet been flushed to the
//     server's persisted store. When the stream emits `done`, the query is
//     invalidated and the conversation's live buffer is cleared; the
//     freshly-persisted events re-appear via the query cache.
//
// task007 — per-conversation scoping:
//
//   `liveEvents` is now a `Record<conversationId, InteractionEvent[]>` so two
//   tabs streaming simultaneously stay isolated. Every reader/writer takes
//   the target `conversationId` explicitly. The id-collision idempotence
//   guard from task006 still holds — it's now per-conversation.
//
//   `drafts` is a `Record<conversationId, string>` (in-memory only) so the
//   unsent input text survives tab switches. Drafts die on page refresh —
//   persistence is intentionally out of scope for this task (no schema
//   change on `/api/chat/tabs`). `ChatTabBar` inspects `drafts[tabId]` to
//   decide whether to show the close-confirm dialog, and clears the entry
//   via `setDraft(tabId, '')` whenever a tab closes.
//
// The hardcoded `'default'` `conversationId` field from M3 is gone —
// `ChatPanel` now sources the active id through the `useActiveConversationId`
// hook, which wraps `useChatTabsStore.activeTabId`.

import { create } from 'zustand';
import type { InteractionEvent } from '../../../shared/types';

interface ChatState {
  /**
   * In-flight events per conversation. Keyed by `conversationId` so two
   * open tabs don't cross-contaminate. Cleared per-conversation on SSE `done`.
   */
  liveEvents: Record<string, InteractionEvent[]>;

  /**
   * In-memory draft input per conversation. Survives tab switches, dies on
   * reload. Not persisted — schema-level persistence is a future milestone.
   */
  drafts: Record<string, string>;

  /** True while an assistant turn is streaming (any tab). */
  isStreaming: boolean;

  /** Append an event to the conversation's live buffer (idempotent on id). */
  appendLiveEvent: (conversationId: string, event: InteractionEvent) => void;

  /**
   * Remove a live event by id from the given conversation. Used to un-render
   * the optimistic user echo when `POST /api/chat/prompt` fails so the
   * stranded bubble doesn't stick around after the error banner surfaces.
   */
  removeLiveEvent: (conversationId: string, id: string) => void;

  /**
   * Merge an assistant text chunk into the tail assistant text event for the
   * given conversation, or start a new one if the tail isn't an assistant
   * text event. Mirrors the server-side `assistantTextBuffer` coalescing.
   */
  coalesceAssistantText: (conversationId: string, text: string) => void;

  /** Drop the conversation's live buffer (called after React Query revalidation). */
  clearLive: (conversationId: string) => void;

  /** Toggle the streaming flag (drives spinners / input-disabled state). */
  setStreaming: (v: boolean) => void;

  /** Set (or clear, with '') the draft text for a conversation. */
  setDraft: (conversationId: string, text: string) => void;

  /** Read the draft for a conversation, or '' if none. */
  getDraft: (conversationId: string) => string;
}

export const useChatStore = create<ChatState>((set, get) => ({
  liveEvents: {},
  drafts: {},
  isStreaming: false,

  appendLiveEvent: (conversationId, event) =>
    set((s) => {
      const existing = s.liveEvents[conversationId] ?? [];
      // Idempotent on id collisions — a second line of defense against the
      // server re-emitting the same SSE chunk (e.g. on reconnect) or a
      // workflow/hook_event chunk being appended here and then pulled back
      // through the history revalidation before mergeChatEvents runs. The
      // check is per-conversation, so the same id can legitimately appear
      // in two different tabs without one swallowing the other.
      if (existing.some((e) => e.id === event.id)) return s;
      return {
        liveEvents: {
          ...s.liveEvents,
          [conversationId]: [...existing, event],
        },
      };
    }),

  removeLiveEvent: (conversationId, id) =>
    set((s) => {
      const existing = s.liveEvents[conversationId] ?? [];
      return {
        liveEvents: {
          ...s.liveEvents,
          [conversationId]: existing.filter((e) => e.id !== id),
        },
      };
    }),

  coalesceAssistantText: (conversationId, text) =>
    set((s) => {
      const existing = s.liveEvents[conversationId] ?? [];
      const last = existing[existing.length - 1];
      if (
        last &&
        last.role === 'assistant' &&
        last.content.type === 'text'
      ) {
        const updated: InteractionEvent = {
          ...last,
          content: { type: 'text', text: last.content.text + text },
        };
        return {
          liveEvents: {
            ...s.liveEvents,
            [conversationId]: [...existing.slice(0, -1), updated],
          },
        };
      }
      // No existing assistant text event — start a new one. This happens on
      // the first text chunk of a turn, or when text follows a tool_call /
      // tool_result that broke the coalescing chain.
      const fresh: InteractionEvent = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conversationId,
        parentEventId: null,
        timestamp: new Date().toISOString(),
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text },
        cost: null,
      };
      return {
        liveEvents: {
          ...s.liveEvents,
          [conversationId]: [...existing, fresh],
        },
      };
    }),

  clearLive: (conversationId) =>
    set((s) => ({
      liveEvents: {
        ...s.liveEvents,
        [conversationId]: [],
      },
    })),

  setStreaming: (v) => set({ isStreaming: v }),

  setDraft: (conversationId, text) =>
    set((s) => ({
      drafts: {
        ...s.drafts,
        [conversationId]: text,
      },
    })),

  getDraft: (conversationId) => get().drafts[conversationId] ?? '',
}));

// ---------------------------------------------------------------------------
// shouldShowThinking — pure-logic selector for the M9 thinking indicator.
//
// Exported standalone (not on the store) so it can be unit-tested in vitest
// without round-tripping through zustand state. The panel consumes it by
// reading the two store slices it needs (`isStreaming` and `liveEvents`)
// and calling this function with the active conversationId.
//
// Returns true iff:
//   - a turn is in flight (`isStreaming === true`), AND
//   - no ASSISTANT-role event has landed in this conversation's live buffer
//     yet. The optimistic user echo (role: 'user') MUST NOT count — that
//     lands immediately on Send and the indicator's whole job is to cover
//     the echo → first-envelope gap.
//
// System-role events (hook_fire, info notes) also do NOT count as the
// indicator's exit condition; the user is still waiting for the model to
// say something, and a stray system note mid-wait shouldn't flicker the
// dots off. Only assistant-role events hide the indicator.
// ---------------------------------------------------------------------------
export function shouldShowThinking(
  isStreaming: boolean,
  liveEvents: Record<string, InteractionEvent[]>,
  conversationId: string,
): boolean {
  if (!isStreaming) return false;
  const events = liveEvents[conversationId] ?? [];
  const hasAssistantEvent = events.some((e) => e.role === 'assistant');
  return !hasAssistantEvent;
}
