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
// Chunk handling: text chunks are coalesced into the live assistant bubble
// via `coalesceAssistantText`. workflow_event and hook_event chunks are
// appended to liveEvents for instant render AND trigger a history
// invalidation — the subsequent revalidation pulls the persisted copy back,
// and `mergeChatEvents` drops the live duplicate at render time. Other chunk
// types (tool_call, tool_result, thinking, system) are still picked up
// through query revalidation on `done`.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/stores/chat-store';
import { useChatHistory } from '@/hooks/use-chat-history';
import { InteractionEventRenderer } from '@/components/chat/interaction-event-renderer';
import { ChatTabBar } from '@/components/chat/chat-tab-bar';
import { parseSlashCommand, dispatchCommand } from '@/lib/chat-commands';
import { mergeChatEvents } from '@/lib/chat-event-merge';
import type { InteractionEvent } from '../../../../shared/types';
import { extractChunkText } from '../../../../shared/chat-chunk';

export function ChatPanel() {
  const conversationId = useChatStore((s) => s.conversationId);
  const liveEvents = useChatStore((s) => s.liveEvents);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const appendLiveEvent = useChatStore((s) => s.appendLiveEvent);
  const removeLiveEvent = useChatStore((s) => s.removeLiveEvent);
  const coalesceAssistantText = useChatStore((s) => s.coalesceAssistantText);
  const clearLive = useChatStore((s) => s.clearLive);
  const setStreaming = useChatStore((s) => s.setStreaming);

  const queryClient = useQueryClient();
  const history = useChatHistory(conversationId);

  const [input, setInput] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
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
        if (chunk.type === 'text') {
          // Walk the canonical stream-json wire envelope through the shared
          // parser so the server persistence path and the live render path
          // can never drift. A guardrail in tests/chat-panel.test.ts bans
          // the pre-fix shortcut.
          const text = extractChunkText(chunk);
          if (text) coalesceAssistantText(text);
        } else if (chunk.type === 'done') {
          // Release the streaming gate FIRST so that even if the query
          // invalidation throws for some reason the Send button re-enables
          // and the user isn't stuck behind a greyed-out input forever.
          setStreaming(false);
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
          clearLive();
        } else if (chunk.type === 'workflow_event') {
          // Append to liveEvents for instant render, then invalidate history
          // so the persisted copy lands on the next refetch. mergeChatEvents
          // dedups the live copy when that revalidation completes.
          if (chunk.event && typeof chunk.event === 'object') {
            appendLiveEvent(chunk.event as InteractionEvent);
          }
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
        } else if (chunk.type === 'hook_event') {
          // Same append + invalidate + merge-dedup flow as workflow_event.
          if (chunk.event && typeof chunk.event === 'object') {
            appendLiveEvent(chunk.event as InteractionEvent);
          }
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
        }
      } catch (err) {
        // Log loudly so the next regression is visible in devtools rather
        // than silently swallowed the way the Bug-D investigation had to
        // reverse-engineer from wire captures.
        console.error('[chat-panel] onmessage error', err);
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
    appendLiveEvent,
    clearLive,
    setStreaming,
    queryClient,
  ]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
    // Guard against rapid re-submits while an SSE stream is still active.
    // The store's `isStreaming` flag is flipped off by the `done` handler
    // (or `onerror`), so this naturally re-opens once the turn completes.
    if (isStreaming) return;

    // Archon slash-command interceptor (task003). If the input parses as
    // `/<name> <args>` we dispatch it to the server-side workflow
    // executor FIRST. Three outcomes:
    //
    //   - handled=true  → server accepted; clear input, do NOT POST to
    //                     AI. Server streams the result back over the
    //                     existing SSE channel (wired in task004).
    //   - handled=false → server returned 404 (unknown workflow); fall
    //                     through and POST to AI as a normal prompt.
    //   - threw         → real dispatch failure (5xx / network); surface
    //                     via the existing error banner and abort. Do
    //                     NOT fall through — double-execution on a
    //                     transient hiccup would be worse than erroring.
    //
    // IMPORTANT: `conversationId` here is the M3 single-conversation id
    // from useChatStore, NOT useChatTabsStore.activeTabId. The tab-store
    // → chat-store retarget lands in task007.
    const parsed = parseSlashCommand(text);
    if (parsed) {
      try {
        const result = await dispatchCommand(parsed, conversationId);
        if (result.handled) {
          setInput('');
          setLastError(null);
          return;
        }
        // handled=false → fall through to the AI prompt path below.
      } catch (err) {
        console.error('[chat-panel] workflow dispatch error', err);
        setLastError(
          err instanceof Error ? err.message : 'Workflow dispatch failed',
        );
        return;
      }
    }

    setInput('');
    setLastError(null);
    setStreaming(true);

    // Optimistic user-message echo. The Claude CLI emits its first chunks
    // 5-10 seconds after the POST arrives (session hooks + init), so without
    // an immediate echo the input clears into dead air and the user can't
    // tell their prompt landed. Drop it on POST failure below; on success it
    // gets replaced by the persisted copy when the `done` branch in
    // onmessage calls `clearLive()` and the history query refetches.
    const optimisticId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    appendLiveEvent({
      id: optimisticId,
      conversationId,
      parentEventId: null,
      timestamp: new Date().toISOString(),
      source: 'chat-ai',
      role: 'user',
      content: { type: 'text', text },
      cost: null,
    });

    try {
      const res = await fetch('/api/chat/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
      });
      if (!res.ok) {
        // Server rejected the prompt (e.g. 503 when the Claude CLI isn't
        // installed, or 5xx during a transient backend failure). The SSE
        // stream's `done` chunk will never fire for this turn, so we have to
        // surface the error here, un-render the optimistic echo, and release
        // the streaming gate ourselves — otherwise the input greys out
        // forever and the user sees nothing.
        let msg = `Request failed: ${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          if (body && typeof body.error === 'string') msg = body.error;
        } catch {
          // Non-JSON body — keep the status-line message.
        }
        setLastError(msg);
        removeLiveEvent(optimisticId);
        setStreaming(false);
      }
    } catch (err) {
      // Network error — drop the optimistic echo and streaming state so the
      // UI isn't stuck showing a stranded user bubble next to an error.
      setLastError(err instanceof Error ? err.message : 'Network error');
      removeLiveEvent(optimisticId);
      setStreaming(false);
    }
  };

  // Merge persisted history with in-flight live events, de-duping any id
  // that already landed in history (workflow_event and hook_event SSE
  // chunks are appended to liveEvents AND pulled back on the history
  // revalidation — mergeChatEvents drops the live copy so the event doesn't
  // render twice). React Query returns `undefined` while the first load is
  // in flight; fall back to an empty array.
  const historyEvents: InteractionEvent[] = history.data?.events ?? [];
  const allEvents: InteractionEvent[] = mergeChatEvents(historyEvents, liveEvents);

  return (
    <div className="flex flex-col h-full" data-testid="chat-panel">
      <ChatTabBar />
      <ScrollArea className="flex-1 p-4">
        <InteractionEventRenderer events={allEvents} />
      </ScrollArea>
      {lastError && (
        <div
          className="border-t border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
          data-testid="chat-error-banner"
        >
          {lastError}
        </div>
      )}
      <div className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="Message Claude..."
          disabled={isStreaming}
        />
        <Button onClick={handleSubmit} disabled={isStreaming}>
          Send
        </Button>
      </div>
    </div>
  );
}
