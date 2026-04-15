// tests/chat-event-merge.test.ts
//
// Pure-helper tests for mergeChatEvents, shipped in chat-workflows-tabs-task006.
//
// The helper is the primary dedup point for the two-layer chat rendering
// model: history (React Query) is the source of truth for any event the
// server has persisted, and live events (Zustand store) carry in-flight
// SSE chunks. When a workflow_event or hook_event SSE chunk is appended to
// live AND the subsequent history revalidation pulls the same event back
// from the store, the merge helper drops the live copy so the event does
// not render twice. History order is preserved verbatim; live events are
// appended in order after any non-duplicate live entries.

import { describe, it, expect } from 'vitest';
import { mergeChatEvents } from '../client/src/lib/chat-event-merge';
import type { InteractionEvent } from '../shared/types';

function makeEvent(id: string, overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    id,
    conversationId: 'default',
    parentEventId: null,
    timestamp: '2026-04-15T00:00:00.000Z',
    source: 'chat-ai',
    role: 'assistant',
    content: { type: 'text', text: `event ${id}` },
    cost: null,
    ...overrides,
  };
}

describe('mergeChatEvents', () => {
  it('returns an empty array when both history and live are empty', () => {
    expect(mergeChatEvents([], [])).toEqual([]);
  });

  it('returns history unchanged when live is empty', () => {
    const history = [makeEvent('h1'), makeEvent('h2'), makeEvent('h3')];
    const result = mergeChatEvents(history, []);
    expect(result.map((e) => e.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('returns live unchanged when history is empty', () => {
    const live = [makeEvent('l1'), makeEvent('l2')];
    const result = mergeChatEvents([], live);
    expect(result.map((e) => e.id)).toEqual(['l1', 'l2']);
  });

  it('appends disjoint live events after history, preserving both orders', () => {
    const history = [makeEvent('h1'), makeEvent('h2')];
    const live = [makeEvent('l1'), makeEvent('l2')];
    const result = mergeChatEvents(history, live);
    expect(result.map((e) => e.id)).toEqual(['h1', 'h2', 'l1', 'l2']);
  });

  it('drops a live event whose id is already in history (history copy wins)', () => {
    const history = [
      makeEvent('h1'),
      makeEvent('dup', { content: { type: 'text', text: 'persisted' } }),
    ];
    const live = [
      makeEvent('dup', { content: { type: 'text', text: 'live' } }),
      makeEvent('l2'),
    ];
    const result = mergeChatEvents(history, live);
    expect(result.map((e) => e.id)).toEqual(['h1', 'dup', 'l2']);
    // The dup event in the merged list must be the history copy, not live.
    const dup = result.find((e) => e.id === 'dup')!;
    expect(dup.content).toEqual({ type: 'text', text: 'persisted' });
  });

  it('drops a second live event that collides with an earlier live event (seen accumulates)', () => {
    const history: InteractionEvent[] = [];
    const live = [
      makeEvent('l1', { content: { type: 'text', text: 'first' } }),
      makeEvent('l1', { content: { type: 'text', text: 'second' } }),
      makeEvent('l2'),
    ];
    const result = mergeChatEvents(history, live);
    expect(result.map((e) => e.id)).toEqual(['l1', 'l2']);
    const first = result.find((e) => e.id === 'l1')!;
    expect(first.content).toEqual({ type: 'text', text: 'first' });
  });

  it('never re-sorts history, even when history ids are out of order', () => {
    const history = [makeEvent('z'), makeEvent('a'), makeEvent('m')];
    const live = [makeEvent('l1')];
    const result = mergeChatEvents(history, live);
    expect(result.map((e) => e.id)).toEqual(['z', 'a', 'm', 'l1']);
  });

  it('does not mutate the input history array', () => {
    const history = [makeEvent('h1'), makeEvent('h2')];
    const live = [makeEvent('h1'), makeEvent('l1')];
    const historySnapshot = history.slice();
    const liveSnapshot = live.slice();
    mergeChatEvents(history, live);
    expect(history).toEqual(historySnapshot);
    expect(history).toHaveLength(2);
    expect(live).toEqual(liveSnapshot);
    expect(live).toHaveLength(2);
  });

  it('returns a fresh array instance (caller can safely mutate the result)', () => {
    const history = [makeEvent('h1')];
    const live = [makeEvent('l1')];
    const result = mergeChatEvents(history, live);
    expect(result).not.toBe(history);
    expect(result).not.toBe(live);
  });
});
