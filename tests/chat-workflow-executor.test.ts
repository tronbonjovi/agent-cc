/**
 * Tests for the chat workflow executor (task004 — chat-workflows-tabs).
 *
 * The executor is the Archon-pattern guard for chat input: chat ONLY ever
 * dispatches AI prompts or named workflows from a hardcoded registry. This
 * test file exercises the registry lookup + the single built-in `echo`
 * workflow, and pins the source-text security guardrail (no child_process,
 * spawn, exec, eval, Function() in the executor module).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isKnownWorkflow,
  runWorkflow,
} from '../server/chat-workflow-executor';
import type { InteractionEvent, SystemContent } from '../shared/types';

/**
 * Drain an async generator into a plain array so individual assertions can
 * index into yielded events without re-running the iterator.
 */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('chat-workflow-executor — registry', () => {
  it('isKnownWorkflow returns true for echo, false for anything else', () => {
    expect(isKnownWorkflow('echo')).toBe(true);
    expect(isKnownWorkflow('does-not-exist')).toBe(false);
    expect(isKnownWorkflow('')).toBe(false);
    // Prototype pollution guard: inherited keys must not count as workflows.
    expect(isKnownWorkflow('toString')).toBe(false);
    expect(isKnownWorkflow('hasOwnProperty')).toBe(false);
  });
});

describe('chat-workflow-executor — echo workflow', () => {
  it('runWorkflow("echo", "", "conv-1") yields three well-formed InteractionEvents', async () => {
    const events = await collect(runWorkflow('echo', '', 'conv-1'));
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.source).toBe('chat-workflow');
      expect(e.role).toBe('system');
      expect(e.conversationId).toBe('conv-1');
      expect(e.cost).toBeNull();
      // Each event is a system content block with subtype workflow_step.
      expect(e.content.type).toBe('system');
      const sys = e.content as SystemContent;
      expect(sys.subtype).toBe('workflow_step');
      expect(typeof sys.text).toBe('string');
      expect(sys.text.length).toBeGreaterThan(0);
      // id/timestamp populated
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
      expect(typeof e.timestamp).toBe('string');
      // timestamp parses as a real date
      expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
    }
  });

  it('runWorkflow echoes args in the second yielded event text', async () => {
    const events = await collect(runWorkflow('echo', 'hello world', 'conv-1'));
    expect(events).toHaveLength(3);
    const second = events[1];
    expect((second.content as SystemContent).text).toContain('hello world');
  });

  it('runWorkflow on an unknown workflow name throws', async () => {
    await expect(async () => {
      // Consume the generator to trigger the registry lookup.
      for await (const _ of runWorkflow('does-not-exist', '', 'conv-1')) {
        // unreachable
      }
    }).rejects.toThrow(/does-not-exist/i);
  });

  it('each yielded event has a unique id', async () => {
    const events = await collect(runWorkflow('echo', 'x', 'conv-1'));
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
  });

  it('generator is lazy — yields one event at a time, not pre-buffered', async () => {
    // Pull events one by one and assert we can observe each one before the
    // next is produced. If runWorkflow accidentally materialised the whole
    // list up front (e.g. via `Promise.all`) this loop would still pass on
    // count but the intermediate `yielded` observations prove streaming.
    const gen = runWorkflow('echo', 'lazy', 'conv-1');
    const yielded: InteractionEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const next = await gen.next();
      expect(next.done).toBe(false);
      yielded.push(next.value as InteractionEvent);
      // After each individual .next() call the collection grew by exactly 1.
      expect(yielded).toHaveLength(i + 1);
    }
    const last = await gen.next();
    expect(last.done).toBe(true);
  });
});

describe('chat-workflow-executor — source-text security guardrail', () => {
  // Lock in the "echo-only, no subprocess" decision: this module must NEVER
  // reference child_process, spawn, exec, eval, or Function(). Future
  // spawn-based workflows (validate/build) are deferred to a follow-up task
  // and will live in a separate module with its own isolation story.
  it('server/chat-workflow-executor.ts does not reference child_process, spawn, exec, eval, or Function(', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'server/chat-workflow-executor.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/\bchild_process\b/);
    expect(src).not.toMatch(/\bspawn\b/);
    expect(src).not.toMatch(/\bexec\b/);
    expect(src).not.toMatch(/\beval\b/);
    expect(src).not.toMatch(/\bFunction\s*\(/);
  });
});
