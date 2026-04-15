/**
 * Tests for the interactions data access layer (task003 — unified-capture).
 *
 * Each test points `AGENT_CC_DATA` at a unique temp dir so the suite never
 * touches the real `~/.agent-cc/interactions.db`. Mirrors the pattern from
 * `tests/interactions-db.test.ts`: env override + `fs.mkdtempSync` per test,
 * `closeDb()` + env restore + recursive cleanup in `afterEach`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDb } from '../server/interactions-db';
import {
  insertEvent,
  insertEventsBatch,
  getEventsByConversation,
  getEventsBySource,
  listConversations,
  countBySource,
} from '../server/interactions-repo';
import type { InteractionEvent } from '../shared/types';

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGENT_CC_DATA;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interactions-repo-'));
  process.env.AGENT_CC_DATA = tempDir;
});

afterEach(() => {
  closeDb();
  if (originalEnv === undefined) {
    delete process.env.AGENT_CC_DATA;
  } else {
    process.env.AGENT_CC_DATA = originalEnv;
  }
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fully-populated chat-ai event for round-trip tests. */
function makeAiEvent(overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    id: 'evt-001',
    conversationId: 'conv-001',
    parentEventId: 'parent-001',
    timestamp: '2026-04-15T10:00:00.000Z',
    source: 'chat-ai',
    role: 'assistant',
    content: { type: 'text', text: 'hello world' },
    cost: {
      usd: 0.0123,
      tokensIn: 100,
      tokensOut: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
      durationMs: 1234,
      model: 'claude-opus-4-6',
    },
    metadata: { sessionId: 'sess-1', custom: { nested: true } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('interactions-repo', () => {
  it('insertEvent round-trips an event with all fields preserved', () => {
    const event = makeAiEvent();
    insertEvent(event);

    const out = getEventsByConversation('conv-001');
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(event);
  });

  it('insertEvent preserves nullable / optional fields', () => {
    // Deterministic event: cost null, no parentEventId, no metadata.
    const event: InteractionEvent = {
      id: 'evt-null-001',
      conversationId: 'conv-null',
      timestamp: '2026-04-15T11:00:00.000Z',
      source: 'chat-slash',
      role: 'system',
      content: {
        type: 'system',
        subtype: 'workflow_step',
        text: '/work-task started',
      },
      cost: null,
    };

    insertEvent(event);
    const out = getEventsByConversation('conv-null');

    expect(out.length).toBe(1);
    const fetched = out[0];

    expect(fetched.cost).toBeNull();
    expect(fetched.parentEventId).toBeNull(); // schema column is null when omitted
    expect(fetched.metadata).toBeUndefined();
    expect(fetched.content).toEqual({
      type: 'system',
      subtype: 'workflow_step',
      text: '/work-task started',
    });
  });

  it('insertEventsBatch is atomic and inserts all 100 events', () => {
    const events: InteractionEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        id: `batch-${i.toString().padStart(3, '0')}`,
        conversationId: 'conv-batch',
        timestamp: `2026-04-15T12:00:${(i % 60).toString().padStart(2, '0')}.000Z`,
        source: 'scanner-jsonl',
        role: 'user',
        content: { type: 'text', text: `message ${i}` },
        cost: null,
      });
    }

    insertEventsBatch(events);

    const out = getEventsByConversation('conv-batch');
    expect(out.length).toBe(100);
    // Spot-check a few ids made the round trip.
    const ids = new Set(out.map((e) => e.id));
    expect(ids.has('batch-000')).toBe(true);
    expect(ids.has('batch-050')).toBe(true);
    expect(ids.has('batch-099')).toBe(true);
  });

  it('getEventsByConversation returns events in ascending timestamp order', () => {
    // Insert deliberately out of chronological order.
    insertEvent({
      id: 'evt-c',
      conversationId: 'conv-order',
      timestamp: '2026-04-15T10:00:30.000Z',
      source: 'chat-ai',
      role: 'assistant',
      content: { type: 'text', text: 'third' },
      cost: null,
    });
    insertEvent({
      id: 'evt-a',
      conversationId: 'conv-order',
      timestamp: '2026-04-15T10:00:10.000Z',
      source: 'chat-ai',
      role: 'assistant',
      content: { type: 'text', text: 'first' },
      cost: null,
    });
    insertEvent({
      id: 'evt-b',
      conversationId: 'conv-order',
      timestamp: '2026-04-15T10:00:20.000Z',
      source: 'chat-ai',
      role: 'assistant',
      content: { type: 'text', text: 'second' },
      cost: null,
    });

    const out = getEventsByConversation('conv-order');
    expect(out.map((e) => e.id)).toEqual(['evt-a', 'evt-b', 'evt-c']);
  });

  it('getEventsBySource filters by source and respects the limit', () => {
    insertEventsBatch([
      {
        id: 'mix-1',
        conversationId: 'conv-mix',
        timestamp: '2026-04-15T13:00:00.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: 'ai 1' },
        cost: null,
      },
      {
        id: 'mix-2',
        conversationId: 'conv-mix',
        timestamp: '2026-04-15T13:00:01.000Z',
        source: 'scanner-jsonl',
        role: 'user',
        content: { type: 'text', text: 'jsonl 1' },
        cost: null,
      },
      {
        id: 'mix-3',
        conversationId: 'conv-mix',
        timestamp: '2026-04-15T13:00:02.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: 'ai 2' },
        cost: null,
      },
    ]);

    const aiOnly = getEventsBySource('chat-ai');
    expect(aiOnly.length).toBe(2);
    expect(aiOnly.every((e) => e.source === 'chat-ai')).toBe(true);
    // Newest first.
    expect(aiOnly[0].id).toBe('mix-3');
    expect(aiOnly[1].id).toBe('mix-1');

    const jsonlOnly = getEventsBySource('scanner-jsonl');
    expect(jsonlOnly.length).toBe(1);
    expect(jsonlOnly[0].id).toBe('mix-2');

    // Limit clamps the result set.
    const limited = getEventsBySource('chat-ai', 1);
    expect(limited.length).toBe(1);
    expect(limited[0].id).toBe('mix-3');
  });

  it('listConversations groups by conversation_id with counts and lastEvent', () => {
    insertEventsBatch([
      // conv-A: 2 events, last at 14:00:10
      {
        id: 'a-1',
        conversationId: 'conv-A',
        timestamp: '2026-04-15T14:00:00.000Z',
        source: 'chat-ai',
        role: 'user',
        content: { type: 'text', text: 'A1' },
        cost: null,
      },
      {
        id: 'a-2',
        conversationId: 'conv-A',
        timestamp: '2026-04-15T14:00:10.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: 'A2' },
        cost: null,
      },
      // conv-B: 3 events, last at 14:05:00
      {
        id: 'b-1',
        conversationId: 'conv-B',
        timestamp: '2026-04-15T14:01:00.000Z',
        source: 'scanner-jsonl',
        role: 'user',
        content: { type: 'text', text: 'B1' },
        cost: null,
      },
      {
        id: 'b-2',
        conversationId: 'conv-B',
        timestamp: '2026-04-15T14:02:00.000Z',
        source: 'scanner-jsonl',
        role: 'assistant',
        content: { type: 'text', text: 'B2' },
        cost: null,
      },
      {
        id: 'b-3',
        conversationId: 'conv-B',
        timestamp: '2026-04-15T14:05:00.000Z',
        source: 'scanner-jsonl',
        role: 'assistant',
        content: { type: 'text', text: 'B3' },
        cost: null,
      },
      // conv-C: 1 event, last at 14:03:00
      {
        id: 'c-1',
        conversationId: 'conv-C',
        timestamp: '2026-04-15T14:03:00.000Z',
        source: 'chat-slash',
        role: 'system',
        content: { type: 'system', subtype: 'info', text: 'C1' },
        cost: null,
      },
    ]);

    const groups = listConversations();
    expect(groups.length).toBe(3);

    const byId = new Map(groups.map((g) => [g.conversationId, g]));

    expect(byId.get('conv-A')!.eventCount).toBe(2);
    expect(byId.get('conv-A')!.lastEvent).toBe('2026-04-15T14:00:10.000Z');

    expect(byId.get('conv-B')!.eventCount).toBe(3);
    expect(byId.get('conv-B')!.lastEvent).toBe('2026-04-15T14:05:00.000Z');
    expect(byId.get('conv-B')!.source).toBe('scanner-jsonl');

    expect(byId.get('conv-C')!.eventCount).toBe(1);
    expect(byId.get('conv-C')!.lastEvent).toBe('2026-04-15T14:03:00.000Z');

    // Newest conversation first (conv-B at 14:05, conv-C at 14:03, conv-A at 14:00).
    expect(groups[0].conversationId).toBe('conv-B');
    expect(groups[1].conversationId).toBe('conv-C');
    expect(groups[2].conversationId).toBe('conv-A');
  });

  it('countBySource returns per-source totals', () => {
    insertEventsBatch([
      {
        id: 's-1',
        conversationId: 'conv-s',
        timestamp: '2026-04-15T15:00:00.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: '1' },
        cost: null,
      },
      {
        id: 's-2',
        conversationId: 'conv-s',
        timestamp: '2026-04-15T15:00:01.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: '2' },
        cost: null,
      },
      {
        id: 's-3',
        conversationId: 'conv-s',
        timestamp: '2026-04-15T15:00:02.000Z',
        source: 'chat-ai',
        role: 'assistant',
        content: { type: 'text', text: '3' },
        cost: null,
      },
      {
        id: 's-4',
        conversationId: 'conv-s',
        timestamp: '2026-04-15T15:00:03.000Z',
        source: 'scanner-jsonl',
        role: 'user',
        content: { type: 'text', text: '4' },
        cost: null,
      },
    ]);

    const counts = countBySource();
    expect(counts['chat-ai']).toBe(3);
    expect(counts['scanner-jsonl']).toBe(1);
  });

  it('insertEvent is upsert — same id with new content overwrites', () => {
    const original: InteractionEvent = {
      id: 'evt-upsert',
      conversationId: 'conv-upsert',
      timestamp: '2026-04-15T16:00:00.000Z',
      source: 'chat-ai',
      role: 'assistant',
      content: { type: 'text', text: 'original text' },
      cost: null,
    };
    insertEvent(original);

    const updated: InteractionEvent = {
      ...original,
      content: { type: 'text', text: 'updated text' },
    };
    insertEvent(updated);

    const out = getEventsByConversation('conv-upsert');
    expect(out.length).toBe(1);
    expect(out[0].content).toEqual({ type: 'text', text: 'updated text' });
  });
});
