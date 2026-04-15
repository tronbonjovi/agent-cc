// tests/chat-store.test.ts
//
// Tests for the chat store after the unified-capture task006 rewire.
//
// Before M2, the store held both persisted history (`messages`) and live
// streaming chunks in the same buffer. Task006 splits those two layers:
// React Query owns conversation history (via `useChatHistory`), and this
// Zustand store now holds only the in-flight `liveEvents` buffer — the
// chunks streaming in from the active SSE connection that have not yet been
// flushed to the server's persisted store.
//
// The store's contract is intentionally tiny: a buffer, three mutators, a
// streaming flag, and a setter. No more optimistic user messages, no more
// conversationId-keyed message coalescing across conversations — live events
// are always for the currently active stream.
//
// Zustand stores are module-scoped singletons; we re-import in `beforeEach`
// and hard-reset state to keep tests order-independent.

import { describe, it, expect, beforeEach } from 'vitest';
import type { InteractionEvent } from '../shared/types';

let useChatStore: typeof import('../client/src/stores/chat-store').useChatStore;

beforeEach(async () => {
  const mod = await import('../client/src/stores/chat-store');
  useChatStore = mod.useChatStore;
  useChatStore.setState({
    liveEvents: [],
    conversationId: 'default',
    isStreaming: false,
  });
});

// Helper: build a minimal InteractionEvent of a given variant.
function makeTextEvent(overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    id: 'e1',
    conversationId: 'default',
    parentEventId: null,
    timestamp: '2026-04-15T00:00:00.000Z',
    source: 'chat-ai',
    role: 'assistant',
    content: { type: 'text', text: 'hello' },
    cost: null,
    ...overrides,
  };
}

describe('useChatStore (live-events layer)', () => {
  it('1. has correct initial state', () => {
    const state = useChatStore.getState();
    expect(state.liveEvents).toEqual([]);
    expect(state.conversationId).toBe('default');
    expect(state.isStreaming).toBe(false);
  });

  it('2. appendLiveEvent adds an event to the buffer', () => {
    const event = makeTextEvent({ id: 'a1', content: { type: 'text', text: 'hi there' } });
    useChatStore.getState().appendLiveEvent(event);
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0]).toEqual(event);
  });

  it('3. coalesceAssistantText appends to the last assistant text event', () => {
    const store = useChatStore.getState();
    // Seed a streaming assistant bubble.
    store.appendLiveEvent(
      makeTextEvent({ id: 'a1', role: 'assistant', content: { type: 'text', text: 'hello' } }),
    );
    // Second chunk arrives — should merge into the existing bubble.
    store.coalesceAssistantText(' world');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0].role).toBe('assistant');
    expect(liveEvents[0].content).toEqual({ type: 'text', text: 'hello world' });
  });

  it('4. coalesceAssistantText creates a new assistant event when none exists', () => {
    // No prior assistant bubble in the buffer — the coalesce call must
    // materialise one rather than silently dropping the chunk.
    useChatStore.getState().coalesceAssistantText('fresh start');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents).toHaveLength(1);
    expect(liveEvents[0].role).toBe('assistant');
    expect(liveEvents[0].content).toEqual({ type: 'text', text: 'fresh start' });
    // New events should carry a non-empty id and timestamp so the renderer
    // can key off them without clashes.
    expect(liveEvents[0].id).toBeTruthy();
    expect(liveEvents[0].timestamp).toBeTruthy();
  });

  it('5. clearLive empties the live event buffer', () => {
    const store = useChatStore.getState();
    store.appendLiveEvent(makeTextEvent({ id: 'a' }));
    store.appendLiveEvent(makeTextEvent({ id: 'b' }));
    expect(useChatStore.getState().liveEvents).toHaveLength(2);
    useChatStore.getState().clearLive();
    expect(useChatStore.getState().liveEvents).toEqual([]);
  });

  it('6. setStreaming toggles the flag', () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});
