// client/src/hooks/use-chat-history.ts
//
// React Query hook for loaded chat history (unified-capture milestone,
// task006).
//
// Fetches persisted InteractionEvents for a conversation from the task005
// load endpoint. ChatPanel renders the returned events concatenated with the
// in-flight `liveEvents` from the Zustand chat store; on SSE `done`, the
// query is invalidated so the just-persisted events come back from the
// server and `liveEvents` is cleared.
//
// The query key is `['chat-history', conversationId]` — a fixed tuple rather
// than the `queryClient`'s default URL-derived key — so cache invalidation
// from ChatPanel can target it precisely without string-matching a URL.
// That also lets us override the project's default queryFn (which would
// otherwise `fetch(queryKey.join('/'))`, producing a nonsense URL like
// `chat-history/default`).

import { useQuery } from '@tanstack/react-query';
import type { InteractionEvent } from '../../../shared/types';

interface ChatHistoryResponse {
  events: InteractionEvent[];
}

export function useChatHistory(conversationId: string) {
  return useQuery<ChatHistoryResponse>({
    queryKey: ['chat-history', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/chat/conversations/${conversationId}/events`);
      if (!res.ok) {
        throw new Error(`Failed to load chat history: ${res.status}`);
      }
      return res.json();
    },
  });
}
