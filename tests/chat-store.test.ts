import { describe, it, expect, beforeEach } from 'vitest';
import type { ChatMessage } from '../shared/types';

// Zustand stores are module-scoped singletons — import fresh and reset per test.
let useChatStore: typeof import('../client/src/stores/chat-store').useChatStore;

beforeEach(async () => {
  const mod = await import('../client/src/stores/chat-store');
  useChatStore = mod.useChatStore;
  useChatStore.setState({
    messages: [],
    conversationId: 'default',
    isStreaming: false,
  });
});

const makeUserMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'u1',
  conversationId: 'default',
  role: 'user',
  text: 'hello',
  timestamp: '2026-04-14T00:00:00.000Z',
  ...overrides,
});

describe('useChatStore', () => {
  it('has correct initial state', () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.conversationId).toBe('default');
    expect(state.isStreaming).toBe(false);
  });

  it('appendMessage adds a message', () => {
    const msg = makeUserMessage({ text: 'hi there' });
    useChatStore.getState().appendMessage(msg);
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it('appendAssistantChunk creates a new assistant message when none exists', () => {
    useChatStore.getState().appendAssistantChunk('default', 'hello');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].conversationId).toBe('default');
    expect(messages[0].text).toBe('hello');
    expect(messages[0].id).toBeTruthy();
    expect(messages[0].timestamp).toBeTruthy();
  });

  it('appendAssistantChunk appends to existing assistant message with same conversationId', () => {
    const store = useChatStore.getState();
    store.appendAssistantChunk('default', 'hello');
    store.appendAssistantChunk('default', ' world');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('hello world');
    expect(messages[0].role).toBe('assistant');
  });

  it('appendAssistantChunk creates a new message for a different conversationId', () => {
    const store = useChatStore.getState();
    store.appendAssistantChunk('default', 'hello');
    store.appendAssistantChunk('other', 'hi');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0].conversationId).toBe('default');
    expect(messages[0].text).toBe('hello');
    expect(messages[1].conversationId).toBe('other');
    expect(messages[1].text).toBe('hi');
  });

  it('clear empties messages', () => {
    const store = useChatStore.getState();
    store.appendMessage(makeUserMessage({ id: 'a' }));
    store.appendMessage(makeUserMessage({ id: 'b' }));
    store.appendMessage(makeUserMessage({ id: 'c' }));
    expect(useChatStore.getState().messages).toHaveLength(3);
    useChatStore.getState().clear();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('setStreaming toggles the flag', () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});
