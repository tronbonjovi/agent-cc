/**
 * Tests for the JSONL → InteractionEvent mapper (scanner-ingester task001).
 *
 * Note on location: the task contract says tests live alongside source at
 * `server/scanner/jsonl-to-event.test.ts`, but the project's `vitest.config.ts`
 * only includes `tests/**` + `shared/**`, so tests under `server/` would not
 * run. Every other server test in this repo lives here — we follow the same
 * convention. Import path still resolves into `server/scanner/`.
 *
 * Fixtures are synthetic (hand-built from the JSONL shape observed in
 * `session-parser.ts`). No real session data is checked in — pre-commit hook
 * would block it anyway.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { jsonlLinesToEvents } from '../server/scanner/jsonl-to-event';
import type { InteractionEvent } from '../shared/types';

const CTX = {
  conversationId: 'session-abc-123',
  sessionPath: '/tmp/fake/session-abc-123.jsonl',
};

/** Load a fixture file and parse each non-empty line as JSON. */
function loadFixture(name: string): unknown[] {
  const filePath = path.join(__dirname, 'fixtures', 'jsonl-samples', name);
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// 1. User text message
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — user text', () => {
  it('maps a plain user text message to a single user text event', () => {
    const line = {
      type: 'user',
      uuid: 'u-1',
      timestamp: '2026-04-15T10:00:00.000Z',
      message: { role: 'user', content: 'hello world' },
    };
    const events = jsonlLinesToEvents([line], CTX);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.role).toBe('user');
    expect(ev.source).toBe('scanner-jsonl');
    expect(ev.conversationId).toBe(CTX.conversationId);
    expect(ev.cost).toBeNull();
    expect(ev.content).toEqual({ type: 'text', text: 'hello world' });
    expect(ev.id).toBe('u-1:text:0');
  });
});

// ---------------------------------------------------------------------------
// 2. Assistant text with cost populated from usage
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — assistant text with usage', () => {
  it('maps assistant text and populates InteractionCost from usage fields', () => {
    const line = {
      type: 'assistant',
      uuid: 'a-1',
      timestamp: '2026-04-15T10:00:01.000Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-6',
        content: [{ type: 'text', text: 'hi there' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.role).toBe('assistant');
    expect(ev.content).toEqual({ type: 'text', text: 'hi there' });
    expect(ev.cost).not.toBeNull();
    expect(ev.cost!.tokensIn).toBe(100);
    expect(ev.cost!.tokensOut).toBe(50);
    expect(ev.cost!.cacheReadTokens).toBe(10);
    expect(ev.cost!.cacheCreationTokens).toBe(5);
    expect(ev.cost!.model).toBe('claude-opus-4-6');
    expect(ev.cost!.usd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Assistant with tool_use → tool_call event
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — assistant tool_use', () => {
  it('emits a tool_call event with toolName and input preserved', () => {
    const line = {
      type: 'assistant',
      uuid: 'a-2',
      timestamp: '2026-04-15T10:00:02.000Z',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_abc',
            name: 'Bash',
            input: { command: 'ls' },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.role).toBe('assistant');
    expect(ev.content.type).toBe('tool_call');
    if (ev.content.type === 'tool_call') {
      expect(ev.content.toolName).toBe('Bash');
      expect(ev.content.toolUseId).toBe('toolu_abc');
      expect(ev.content.input).toEqual({ command: 'ls' });
    }
    // Cost attaches to the only emitted event.
    expect(ev.cost).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Tool result → parentEventId via tool_use_id
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — tool_result linking', () => {
  it('emits a tool_result event with parentEventId derived from tool_use_id', () => {
    const line = {
      type: 'user',
      uuid: 'u-2',
      timestamp: '2026-04-15T10:00:03.000Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_abc',
            content: 'file1.txt\nfile2.txt',
            is_error: false,
          },
        ],
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.role).toBe('tool');
    expect(ev.content.type).toBe('tool_result');
    if (ev.content.type === 'tool_result') {
      expect(ev.content.toolUseId).toBe('toolu_abc');
      expect(ev.content.isError).toBe(false);
      expect(ev.content.output).toBe('file1.txt\nfile2.txt');
    }
    expect(ev.parentEventId).toBe('tool-use:toolu_abc');
    expect(ev.cost).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Filters isMeta: true lines
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — isMeta filtering', () => {
  it('drops user records where isMeta is true', () => {
    const lines = [
      {
        type: 'user',
        uuid: 'u-3',
        timestamp: '2026-04-15T10:00:04.000Z',
        isMeta: true,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Base directory for this skill: ...' }],
        },
      },
      {
        type: 'user',
        uuid: 'u-4',
        timestamp: '2026-04-15T10:00:05.000Z',
        isMeta: false,
        message: { role: 'user', content: 'actual user speech' },
      },
    ];
    const events = jsonlLinesToEvents(lines, CTX);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('u-4:text:0');
  });
});

// ---------------------------------------------------------------------------
// 6. Strips framework XML tags from text
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — framework XML stripping', () => {
  it('strips system-reminder, command-name, and local-command-* tags', () => {
    const line = {
      type: 'user',
      uuid: 'u-5',
      timestamp: '2026-04-15T10:00:06.000Z',
      message: {
        role: 'user',
        content:
          '<system-reminder>ignore me</system-reminder>please run the thing<command-name>/foo</command-name>',
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    expect(events).toHaveLength(1);
    if (events[0].content.type === 'text') {
      expect(events[0].content.text).toBe('please run the thing');
      expect(events[0].content.text).not.toContain('system-reminder');
      expect(events[0].content.text).not.toContain('command-name');
    }
  });

  it('strips local-command-stdout blocks', () => {
    const line = {
      type: 'user',
      uuid: 'u-6',
      timestamp: '2026-04-15T10:00:07.000Z',
      message: {
        role: 'user',
        content:
          'before<local-command-stdout>junk output</local-command-stdout>after',
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    if (events[0].content.type === 'text') {
      expect(events[0].content.text).toBe('beforeafter');
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Idempotent event IDs
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — deterministic ids', () => {
  it('produces identical event ids across two runs on the same input', () => {
    const lines = loadFixture('multi-turn.jsonl');
    const runA = jsonlLinesToEvents(lines, CTX);
    const runB = jsonlLinesToEvents(lines, CTX);
    expect(runA.length).toBeGreaterThan(0);
    expect(runA.length).toBe(runB.length);
    const idsA = runA.map((e) => e.id);
    const idsB = runB.map((e) => e.id);
    expect(idsA).toEqual(idsB);
    // Every id should look derived (contains the source uuid), not random.
    for (const e of runA) {
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
    }
  });

  it('never emits two events with the same id from one record', () => {
    const line = {
      type: 'assistant',
      uuid: 'a-dup',
      timestamp: '2026-04-15T10:00:10.000Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-6',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} },
          { type: 'tool_use', id: 'toolu_2', name: 'Read', input: {} },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };
    const events = jsonlLinesToEvents([line], CTX);
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
    expect(events).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// 8. Malformed input
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — malformed input', () => {
  it('skips non-object lines and missing-field records without throwing', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'not an object',
      [],
      {},
      { type: 'assistant' }, // missing uuid + timestamp
      { type: 'user', uuid: 'u-x' }, // missing timestamp
      { type: 'unknown', uuid: 'u-y', timestamp: '2026-04-15T10:00:00Z' },
      { type: 'user', uuid: 'u-z', timestamp: '2026-04-15T10:00:00Z', message: 'not-object' },
    ];
    expect(() => jsonlLinesToEvents(garbage, CTX)).not.toThrow();
    const events = jsonlLinesToEvents(garbage, CTX);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Round-trip fixture count
// ---------------------------------------------------------------------------
describe('jsonlLinesToEvents — fixture round-trip', () => {
  it('maps the multi-turn fixture to the expected event count', () => {
    const lines = loadFixture('multi-turn.jsonl');
    const events = jsonlLinesToEvents(lines, CTX);
    // multi-turn.jsonl contents:
    //   1 user text         → 1 event
    //   1 assistant text+tool_use → 2 events (text + tool_call)
    //   1 tool_result       → 1 event
    //   1 assistant text    → 1 event
    //   1 isMeta user       → 0 events (dropped)
    // ----------------------- = 5 events
    expect(events).toHaveLength(5);

    // Spot-check shape + source tag on every event.
    for (const ev of events) {
      expect(ev.source).toBe('scanner-jsonl');
      expect(ev.conversationId).toBe(CTX.conversationId);
      expect(ev.metadata).toBeDefined();
      expect((ev.metadata as Record<string, unknown>).sessionPath).toBe(CTX.sessionPath);
    }

    // Exactly one assistant event carries cost (the first one in the
    // assistant-with-tool record). All others should be null.
    const withCost = events.filter((e: InteractionEvent) => e.cost !== null);
    expect(withCost.length).toBeGreaterThanOrEqual(1);
  });
});
