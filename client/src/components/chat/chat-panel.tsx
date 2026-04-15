// client/src/components/chat/chat-panel.tsx
//
// Integrated chat surface for the unified-capture milestone (task006).
//
// Two-layer rendering model:
//
//   - Persisted conversation history is loaded via React Query
//     (`useChatHistory`) from `GET /api/chat/conversations/:id/events`.
//   - In-flight streaming chunks live in the Zustand chat store's
//     `liveEvents` buffer, populated by the SSE listener.
//
// On SSE `done` we invalidate the history query so the just-persisted events
// are re-fetched from the server, then clear `liveEvents` so we don't
// double-render the turn. The optimistic user-message path from M1 is gone —
// we rely on the backend persisting the prompt and React Query picking it up
// on revalidation. The UX cost is a brief skeleton while the POST round-trips
// (tightened in a later milestone).
//
// Chunk handling is intentionally narrow: text chunks are coalesced into the
// live assistant bubble via `coalesceAssistantText`; tool_call / tool_result
// / thinking / system chunks are ignored in the live stream and picked up
// through query revalidation on `done`. Richer live chunk rendering is owned
// by the `chat-workflows-tabs` milestone, not this task.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/stores/chat-store';
import { useChatHistory } from '@/hooks/use-chat-history';
import { InteractionEventRenderer } from '@/components/chat/interaction-event-renderer';
import type { InteractionEvent } from '../../../../shared/types';

export function ChatPanel() {
  const conversationId = useChatStore((s) => s.conversationId);
  const liveEvents = useChatStore((s) => s.liveEvents);
  const coalesceAssistantText = useChatStore((s) => s.coalesceAssistantText);
  const clearLive = useChatStore((s) => s.clearLive);
  const setStreaming = useChatStore((s) => s.setStreaming);

  const queryClient = useQueryClient();
  const history = useChatHistory(conversationId);

  const [input, setInput] = useState('');
  const esRef = useRef<EventSource | null>(null);

  // Open the SSE stream once on mount and tear it down on unmount. The
  // server keeps the connection open across prompts, so we do NOT re-open it
  // per submit.
  useEffect(() => {
    const es = new EventSource(`/api/chat/stream/${conversationId}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const chunk = JSON.parse(ev.data);
        if (
          chunk.type === 'text' &&
          chunk.raw &&
          typeof chunk.raw.text === 'string'
        ) {
          coalesceAssistantText(chunk.raw.text);
        } else if (chunk.type === 'done') {
          // Ask React Query to re-fetch the now-persisted events, then drop
          // the live buffer. Order matters: invalidate first so the cache
          // shows the fresh rows before the live bubble disappears.
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
          clearLive();
          setStreaming(false);
        }
        // Other chunk types (tool_call, tool_result, thinking, system) are
        // intentionally ignored in the live stream — they'll appear on the
        // next revalidation once the backend has persisted them.
      } catch {
        // Malformed chunk — skip it rather than killing the stream.
      }
    };

    es.onerror = () => setStreaming(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [
    conversationId,
    coalesceAssistantText,
    clearLive,
    setStreaming,
    queryClient,
  ]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setStreaming(true);

    try {
      await fetch('/api/chat/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
      });
    } catch {
      // Network error — drop streaming state so the UI isn't stuck.
      setStreaming(false);
    }
  };

  // Concatenate persisted history with in-flight live events. React Query
  // returns `undefined` while the first load is in flight; fall back to an
  // empty array so the renderer just shows the live events (if any) or the
  // empty-state placeholder.
  const historyEvents: InteractionEvent[] = history.data?.events ?? [];
  const allEvents: InteractionEvent[] = [...historyEvents, ...liveEvents];

  return (
    <div className="flex flex-col h-full" data-testid="chat-panel">
      <ScrollArea className="flex-1 p-4">
        <InteractionEventRenderer events={allEvents} />
      </ScrollArea>
      <div className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="Message Claude..."
        />
        <Button onClick={handleSubmit}>Send</Button>
      </div>
    </div>
  );
}
