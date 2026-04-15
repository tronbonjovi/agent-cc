// tests/chat-store.test.ts
//
// Tests for the chat store after task007's per-tab conversation retarget.
//
// The store's contract evolved across milestones:
//
//   - Unified-capture task006 split history (React Query) from live events
//     (this store). `liveEvents` was a flat `InteractionEvent[]`.
//   - chat-workflows-tabs task007 keyed `liveEvents` by conversationId so
//     two open tabs can stream simultaneously without cross-contamination.
//     It also added the in-memory `drafts: Record<string, string>` map so
//     the tab bar can decide whether to show the close-confirm dialog.
//
// This file exercises the store directly — no React, no RTL. Zustand stores
// are module-scoped singletons; we re-import in `beforeEach` and hard-reset
// state to keep tests order-independent.
//
// Additional tab-scoping coverage (leak, dedup, draft isolation) lives in
// `tests/chat-panel.test.ts` alongside the ChatPanel contract tests.

import { describe, it, expect, beforeEach } from 'vitest';
import type { InteractionEvent } from '../shared/types';

let useChatStore: typeof import('../client/src/stores/chat-store').useChatStore;

const CONV = 'default';

beforeEach(async () => {
  const mod = await import('../client/src/stores/chat-store');
  useChatStore = mod.useChatStore;
  useChatStore.setState({
    liveEvents: {},
    drafts: {},
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

describe('useChatStore (per-conversation live-events layer)', () => {
  it('1. has correct initial state', () => {
    const state = useChatStore.getState();
    expect(state.liveEvents).toEqual({});
    expect(state.drafts).toEqual({});
    expect(state.isStreaming).toBe(false);
  });

  it('2. appendLiveEvent adds an event to the conversation buffer', () => {
    const event = makeTextEvent({ id: 'a1', content: { type: 'text', text: 'hi there' } });
    useChatStore.getState().appendLiveEvent(CONV, event);
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0]).toEqual(event);
  });

  it('3. coalesceAssistantText appends to the last assistant text event', () => {
    const store = useChatStore.getState();
    // Seed a streaming assistant bubble.
    store.appendLiveEvent(
      CONV,
      makeTextEvent({ id: 'a1', role: 'assistant', content: { type: 'text', text: 'hello' } }),
    );
    // Second chunk arrives — should merge into the existing bubble.
    store.coalesceAssistantText(CONV, ' world');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0].role).toBe('assistant');
    expect(liveEvents[CONV][0].content).toEqual({
      type: 'text',
      text: 'hello world',
    });
  });

  it('4. coalesceAssistantText creates a new assistant event when none exists', () => {
    // No prior assistant bubble in the buffer — the coalesce call must
    // materialise one rather than silently dropping the chunk.
    useChatStore.getState().coalesceAssistantText(CONV, 'fresh start');
    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(1);
    expect(liveEvents[CONV][0].role).toBe('assistant');
    expect(liveEvents[CONV][0].content).toEqual({ type: 'text', text: 'fresh start' });
    // New events should carry a non-empty id and timestamp so the renderer
    // can key off them without clashes.
    expect(liveEvents[CONV][0].id).toBeTruthy();
    expect(liveEvents[CONV][0].timestamp).toBeTruthy();
  });

  it('5. coalesceAssistantText creates a new event when the tail is not an assistant text bubble', () => {
    // Branch (c): the buffer's tail is a non-text event (here a tool_call)
    // rather than an assistant text bubble. The coalesce path must NOT mutate
    // the tool_call — it has to materialise a fresh assistant text event
    // alongside it so the tool_call stays intact in the transcript.
    const toolCallEvent: InteractionEvent = {
      id: 'tc1',
      conversationId: 'default',
      parentEventId: null,
      timestamp: '2026-04-15T00:00:00.000Z',
      source: 'chat-ai',
      role: 'assistant',
      content: {
        type: 'tool_call',
        toolName: 'Read',
        input: { file_path: '/tmp/x' },
        toolUseId: 'tu_1',
      },
      cost: null,
    };
    const store = useChatStore.getState();
    store.appendLiveEvent(CONV, toolCallEvent);
    store.coalesceAssistantText(CONV, 'hello');

    const { liveEvents } = useChatStore.getState();
    expect(liveEvents[CONV]).toHaveLength(2);
    // Original tool_call event must be untouched.
    expect(liveEvents[CONV][0]).toEqual(toolCallEvent);
    // New tail is a fresh assistant text bubble carrying the chunk.
    expect(liveEvents[CONV][1].role).toBe('assistant');
    expect(liveEvents[CONV][1].content).toEqual({ type: 'text', text: 'hello' });
    expect(liveEvents[CONV][1].id).toBeTruthy();
    expect(liveEvents[CONV][1].id).not.toBe('tc1');
  });

  it('6. clearLive empties the live event buffer for that conversation', () => {
    const store = useChatStore.getState();
    store.appendLiveEvent(CONV, makeTextEvent({ id: 'a' }));
    store.appendLiveEvent(CONV, makeTextEvent({ id: 'b' }));
    expect(useChatStore.getState().liveEvents[CONV]).toHaveLength(2);
    useChatStore.getState().clearLive(CONV);
    expect(useChatStore.getState().liveEvents[CONV] ?? []).toEqual([]);
  });

  it('7. setStreaming toggles the flag', () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});
