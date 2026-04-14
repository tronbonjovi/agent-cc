// client/src/components/chat/chat-panel.tsx
//
// Walking-skeleton chat UI for the integrated chat system (chat-skeleton
// milestone, task005). Renders a scrollable message list on top and a
// prompt input + submit button on the bottom. On submit, POSTs to
// /api/chat/prompt and relies on a long-lived EventSource against
// /api/chat/stream/:conversationId (opened once on mount) to receive
// streamed chunks from the server's runClaudeStreaming() helper.
//
// Text chunks are dispatched into the Zustand chat store via
// appendAssistantChunk, which coalesces consecutive assistant chunks into
// a single bubble. The component itself is ephemeral — no persistence;
// that's a later milestone.
//
// Mounting this component into the layout shell is task006's job — this
// file only provides the standalone component.

import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/stores/chat-store';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const appendAssistantChunk = useChatStore((s) => s.appendAssistantChunk);
  const setStreaming = useChatStore((s) => s.setStreaming);

  const [input, setInput] = useState('');
  const esRef = useRef<EventSource | null>(null);

  // Open the SSE stream once on mount and tear it down on unmount. The
  // server route (task003) keeps the connection open across prompts, so
  // we do NOT re-open it per submit.
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
          appendAssistantChunk(conversationId, chunk.raw.text);
        } else if (chunk.type === 'done') {
          setStreaming(false);
        }
      } catch {
        // Malformed chunk — skip it rather than killing the stream.
      }
    };

    es.onerror = () => setStreaming(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [conversationId, appendAssistantChunk, setStreaming]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    appendMessage({
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    });
    setStreaming(true);

    try {
      await fetch('/api/chat/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
      });
    } catch {
      // Network error — drop streaming state so the UI is not stuck.
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="chat-panel">
      <ScrollArea className="flex-1 p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`mb-3 ${m.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div className="inline-block rounded-lg px-3 py-2 bg-muted max-w-[80%] whitespace-pre-wrap">
              {m.text}
            </div>
          </div>
        ))}
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
