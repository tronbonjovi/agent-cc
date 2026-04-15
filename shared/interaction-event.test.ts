import { describe, it, expect } from 'vitest';
import {
  isAiEvent,
  isDeterministicEvent,
  type InteractionEvent,
  type InteractionContent,
  type TextContent,
  type ToolCallContent,
  type InteractionCost,
} from './types';

// Helper to build a minimal InteractionEvent for tests
function makeEvent(overrides: Partial<InteractionEvent> & Pick<InteractionEvent, 'source' | 'role' | 'content' | 'cost'>): InteractionEvent {
  return {
    id: 'evt_test_1',
    conversationId: 'conv_test_1',
    timestamp: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

const sampleCost: InteractionCost = {
  usd: 0.001,
  tokensIn: 100,
  tokensOut: 50,
  durationMs: 250,
  model: 'claude-opus-4-6',
};

describe('InteractionContent discriminated union', () => {
  it('narrows TextContent by type discriminant', () => {
    const c: InteractionContent = { type: 'text', text: 'hello world' };
    if (c.type === 'text') {
      // TypeScript narrows to TextContent here; runtime-assert the field is accessible
      expect(c.text).toBe('hello world');
    } else {
      throw new Error('expected TextContent narrowing');
    }
  });

  it('narrows ToolCallContent by type discriminant', () => {
    const c: InteractionContent = {
      type: 'tool_call',
      toolName: 'Bash',
      input: { command: 'ls' },
      toolUseId: 'tool_abc',
    };
    if (c.type === 'tool_call') {
      expect(c.toolName).toBe('Bash');
      expect(c.toolUseId).toBe('tool_abc');
      expect((c.input as { command: string }).command).toBe('ls');
    } else {
      throw new Error('expected ToolCallContent narrowing');
    }
  });
});

describe('isAiEvent', () => {
  it('returns true for a chat-ai event with cost', () => {
    const textContent: TextContent = { type: 'text', text: 'hi' };
    const event = makeEvent({
      source: 'chat-ai',
      role: 'assistant',
      content: textContent,
      cost: sampleCost,
    });
    expect(isAiEvent(event)).toBe(true);
  });

  it('returns true for a scanner-jsonl event', () => {
    const textContent: TextContent = { type: 'text', text: 'imported' };
    const event = makeEvent({
      source: 'scanner-jsonl',
      role: 'assistant',
      content: textContent,
      cost: sampleCost,
    });
    expect(isAiEvent(event)).toBe(true);
  });
});

describe('isDeterministicEvent', () => {
  it('returns true for a chat-slash event', () => {
    const event = makeEvent({
      source: 'chat-slash',
      role: 'system',
      content: { type: 'system', subtype: 'info', text: '/help invoked' },
      cost: null,
    });
    expect(isDeterministicEvent(event)).toBe(true);
  });

  it('returns false for a chat-ai event', () => {
    const event = makeEvent({
      source: 'chat-ai',
      role: 'assistant',
      content: { type: 'text', text: 'hello' },
      cost: sampleCost,
    });
    expect(isDeterministicEvent(event)).toBe(false);
  });
});
