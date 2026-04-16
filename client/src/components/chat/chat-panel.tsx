// client/src/components/chat/chat-panel.tsx
//
// Integrated chat surface — chat-scanner-unification task003.
//
// Two-layer rendering model:
//
//   - Persisted conversation history is loaded via React Query
//     (`useChatHistory`) from the scanner session messages endpoint.
//   - In-flight streaming chunks live in the Zustand chat store's
//     per-conversation `liveEvents` buffer, populated by the SSE listener.
//
// On SSE `done` we invalidate the history query so the scanner-parsed events
// are re-fetched, then clear the live buffer for this conversation so we
// don't double-render the turn.
//
// Per-tab retarget:
//   - `conversationId` is the sessionId in the unified model.
//   - Input text lives on `useChatStore.drafts[conversationId]` (in-memory).
//   - liveEvents are keyed by conversationId.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Mic } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useChatStore, shouldShowThinking } from '@/stores/chat-store';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useActiveConversationId } from '@/hooks/use-active-conversation-id';
import { InteractionEventRenderer } from '@/components/chat/interaction-event-renderer';
import { ChatTabBar } from '@/components/chat/chat-tab-bar';
import { ModelDropdown } from '@/components/chat/model-dropdown';
import { parseSlashCommand, dispatchCommand } from '@/lib/chat-commands';
import { mergeChatEvents } from '@/lib/chat-event-merge';
import type { InteractionEvent } from '../../../../shared/types';
import { extractChunkText } from '../../../../shared/chat-chunk';
// Auto-create "Main" tab on first-mount empty state. The effect and its
// strict-mode latch live in a dedicated hook so chat-panel.tsx stays on
// the hook seam and the narrowed regression lock in
// tests/chat-panel.test.ts continues to pass.
import { useChatTabsStoreAutoCreate } from '@/hooks/use-chat-tabs-auto-create';

export function ChatPanel() {
  const conversationId = useActiveConversationId();
  const liveEventsMap = useChatStore((s) => s.liveEvents);
  const liveEvents = liveEventsMap[conversationId] ?? [];
  const isStreaming = useChatStore((s) => s.isStreaming);
  const appendLiveEvent = useChatStore((s) => s.appendLiveEvent);
  const removeLiveEvent = useChatStore((s) => s.removeLiveEvent);
  const coalesceAssistantText = useChatStore((s) => s.coalesceAssistantText);
  const clearLive = useChatStore((s) => s.clearLive);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const input = useChatStore((s) => s.drafts[conversationId] ?? '');
  const setDraft = useChatStore((s) => s.setDraft);

  const queryClient = useQueryClient();
  const history = useChatHistory(conversationId);

  // Kick off the first-mount auto-create flow. This is intentionally a
  // separate hook so the effect can live outside the panel's render body
  // and not get tangled with SSE lifecycle — see
  // `client/src/hooks/use-chat-tabs-auto-create.ts` for the strict-mode
  // double-invoke guard.
  useChatTabsStoreAutoCreate();

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
          if (text) coalesceAssistantText(conversationId, text);
        } else if (chunk.type === 'done') {
          // Release the streaming gate FIRST so that even if the query
          // invalidation throws for some reason the Send button re-enables
          // and the user isn't stuck behind a greyed-out input forever.
          setStreaming(false);
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
          clearLive(conversationId);
        } else if (chunk.type === 'workflow_event') {
          // Append to liveEvents for instant render, then invalidate history
          // so the persisted copy lands on the next refetch. mergeChatEvents
          // dedups the live copy when that revalidation completes.
          if (chunk.event && typeof chunk.event === 'object') {
            appendLiveEvent(conversationId, chunk.event as InteractionEvent);
          }
          queryClient.invalidateQueries({
            queryKey: ['chat-history', conversationId],
          });
        } else if (chunk.type === 'hook_event') {
          // Same append + invalidate + merge-dedup flow as workflow_event.
          if (chunk.event && typeof chunk.event === 'object') {
            appendLiveEvent(conversationId, chunk.event as InteractionEvent);
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

    // Slash-command interceptor (task003). If the input parses as
    // `/<name> <args>` we dispatch it to the server-side workflow
    // executor FIRST. Three outcomes:
    //
    //   - handled=true  → server accepted; clear draft, do NOT POST to
    //                     AI. Server streams the result back over the
    //                     existing SSE channel (wired in task004).
    //   - handled=false → server returned 404 (unknown workflow); fall
    //                     through and POST to AI as a normal prompt.
    //   - threw         → real dispatch failure (5xx / network); surface
    //                     via the existing error banner and abort. Do
    //                     NOT fall through — double-execution on a
    //                     transient hiccup would be worse than erroring.
    //
    // `conversationId` now comes from `useActiveConversationId`, which
    // wraps `useChatTabsStore.activeTabId` — so each tab gets its own
    // conversation thread end-to-end (history query, SSE stream, prompt
    // POST, draft input).
    const parsed = parseSlashCommand(text);
    if (parsed) {
      try {
        const result = await dispatchCommand(parsed, conversationId);
        if (result.handled) {
          setDraft(conversationId, '');
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

    setDraft(conversationId, '');
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
    appendLiveEvent(conversationId, {
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
      // Read the per-conversation model from the settings store and forward
      // it to the server. The server falls back to the CLI default when this
      // field is omitted (legacy clients), but the composer dropdown always
      // resolves to *some* id because getSettings merges globalDefaults —
      // see model-dropdown.tsx.
      const model = useChatSettingsStore
        .getState()
        .getSettings(conversationId).model;
      const res = await fetch('/api/chat/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text, model }),
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
        removeLiveEvent(conversationId, optimisticId);
        setStreaming(false);
      }
    } catch (err) {
      // Network error — drop the optimistic echo and streaming state so the
      // UI isn't stuck showing a stranded user bubble next to an error.
      setLastError(err instanceof Error ? err.message : 'Network error');
      removeLiveEvent(conversationId, optimisticId);
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

  // task005 (chat-ux-cleanup): show a pulsing-dots indicator between the
  // optimistic user echo and the first assistant envelope. The Claude CLI
  // emits whole assistant-message envelopes on a 5-10s cadence (not tokens,
  // see reference_claude_cli_streaming), so progressive-bubble streaming is
  // architecturally impossible — the indicator is the UX fix for dead air.
  const showThinking = shouldShowThinking(isStreaming, liveEventsMap, conversationId);

  // task007 (chat-ux-cleanup): chat panel is now a single column — the
  // in-panel ConversationSidebar was removed because it duplicated the tab
  // bar and wasted ~25% of panel width. "Recent sessions" moved to a
  // history popover on the collapse bar in layout.tsx. Structure is now:
  // tab bar → messages → input, with no horizontal PanelGroup wrapper.
  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <ChatTabBar />
      <ScrollArea className="flex-1 p-4">
        <InteractionEventRenderer events={allEvents} />
        {showThinking && <ThinkingIndicator />}
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
      {/*
        Composer (chat-composer-controls task002)
        ───────────────────────────────────────────
        Three-zone layout modeled on Claude.ai:
          - Left:   model selector stub (task003 replaces with a real dropdown)
          - Center: multi-line <textarea> that grows with content
          - Right:  plus button (task004), send button, mic icon (disabled)

        Layout-only change — behavior preserved: Enter submits, Shift+Enter
        inserts a newline, send still triggers handleSubmit. The stubs
        expose data-testid mounting points so subsequent tasks don't have
        to perform brittle structural traversal.
      */}
      <div
        className="border-t p-3 flex items-end gap-2"
        data-testid="chat-composer"
      >
        {/* Left zone: model selector (task003). ModelDropdown owns the
            `data-testid="chat-composer-model"` mount that task002 set up,
            reads the current model from `useChatSettingsStore`, and writes
            selections back via `updateSettings`. The POST body below picks
            up the resolved model from the store on submit. */}
        <ModelDropdown conversationId={conversationId} />

        {/* Center: multi-line input. min-h keeps the composer from looking
            cramped; rows={1} lets it start single-line and expand naturally
            via the user's line breaks. resize-none suppresses the native
            drag-handle so the composer stays visually clean. */}
        <textarea
          value={input}
          onChange={(e) => setDraft(conversationId, e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter inserts a newline. Preserving the
            // single-line submit behavior matches every other chat surface
            // users have muscle memory for.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Message Claude..."
          disabled={isStreaming}
          rows={1}
          className="flex-1 min-h-[36px] max-h-48 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {/* Right zone: plus button, send, mic */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          data-testid="chat-composer-plus"
          aria-label="Attach"
          onClick={() => {
            /* task004 wires the popover */
          }}
        >
          <Plus />
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isStreaming}
          data-testid="chat-composer-send"
        >
          Send
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          data-testid="chat-composer-mic"
          aria-label="Voice input (not available)"
          disabled
        >
          <Mic />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThinkingIndicator — dead-air UX fix (task005)
//
// Styled like an assistant TextBubble (same bg-card + border + rounded-lg
// padding) so it reads as "an assistant message in progress". Three spans
// with staggered `animationDelay` produce the classic "..." wave using
// Tailwind's `animate-pulse` (opacity-based — bounce/scale are banned per
// feedback_no_bounce_animations). Left-aligned via `self-start` and lives
// in the ScrollArea so the existing auto-scroll-to-bottom picks it up.
//
// Kept inline here (not a new file) because it's small and only ever used
// by ChatPanel. If a second consumer shows up, extract to its own file.
// ---------------------------------------------------------------------------
function ThinkingIndicator() {
  return (
    <div
      className="flex flex-col max-w-[80%] self-start items-start mt-3"
      data-testid="chat-thinking-indicator"
      aria-label="Assistant is thinking"
      role="status"
    >
      <div className="rounded-lg px-3 py-2 text-sm bg-card text-card-foreground border border-border">
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
