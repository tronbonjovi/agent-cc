// tests/chat-panel.test.ts
//
// Tests for the ChatPanel component — chat-skeleton task005.
//
// Follows the repo convention: client/ is excluded from vitest, so React
// components can't be rendered here. Instead we use:
//   1. Source-text guardrails on chat-panel.tsx to verify structure, imports,
//      SSE + fetch wiring, and generic placeholder text.
//   2. Pure-logic tests that exercise the chat store directly (the same store
//      the component consumes) to prove the state transitions the component
//      relies on actually work end-to-end.
//
// See tests/layout.test.ts and tests/chat-store.test.ts for the same pattern.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { ChatMessage } from '../shared/types';

const ROOT = path.resolve(__dirname, '..');
const CHAT_PANEL_PATH = path.resolve(ROOT, 'client/src/components/chat/chat-panel.tsx');

// ---------------------------------------------------------------------------
// chat-panel.tsx — source-text guardrails
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — source guardrails', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('exports a ChatPanel component', () => {
    expect(src).toMatch(/export\s+function\s+ChatPanel/);
  });

  it('renders the chat-panel test id (mount hook for task006 wiring)', () => {
    expect(src).toContain('data-testid="chat-panel"');
  });

  it('imports the chat store', () => {
    expect(src).toMatch(/from ['"]@\/stores\/chat-store['"]/);
    expect(src).toContain('useChatStore');
  });

  it('imports the shadcn ScrollArea, Button, and Input UI primitives', () => {
    expect(src).toMatch(/from ['"]@\/components\/ui\/scroll-area['"]/);
    expect(src).toMatch(/from ['"]@\/components\/ui\/button['"]/);
    expect(src).toMatch(/from ['"]@\/components\/ui\/input['"]/);
  });

  it('opens an EventSource against the relative /api/chat/stream/:id path', () => {
    expect(src).toContain('new EventSource(');
    expect(src).toMatch(/\/api\/chat\/stream\//);
  });

  it('closes the EventSource on unmount (cleanup return)', () => {
    // The useEffect cleanup must call .close() on the stored ref.
    expect(src).toMatch(/\.close\(\)/);
  });

  it('posts to the relative /api/chat/prompt path via fetch', () => {
    expect(src).toContain('/api/chat/prompt');
    expect(src).toMatch(/fetch\(/);
    expect(src).toContain("method: 'POST'");
  });

  it('sends conversationId and text in the POST body', () => {
    expect(src).toMatch(/JSON\.stringify\(\s*\{\s*conversationId\s*,\s*text\s*\}/);
  });

  it('dispatches text chunks via appendAssistantChunk', () => {
    expect(src).toContain('appendAssistantChunk');
    // Guard: the text-chunk branch actually calls it.
    expect(src).toMatch(/chunk\.type\s*===\s*['"]text['"]/);
  });

  it('flips streaming off when the stream finishes or errors', () => {
    expect(src).toContain('setStreaming(false)');
    expect(src).toMatch(/chunk\.type\s*===\s*['"]done['"]/);
    expect(src).toMatch(/onerror/);
  });

  it('has an Enter-key submit handler on the input', () => {
    expect(src).toMatch(/onKeyDown/);
    expect(src).toMatch(/e\.key\s*===\s*['"]Enter['"]/);
  });

  it('uses a generic placeholder (no user-specific project names)', () => {
    expect(src).toMatch(/placeholder=["']Message Claude/);
    // Negative guard: no hardcoded project-specific strings in placeholder.
    expect(src).not.toMatch(/placeholder=["'][^"']*(Nicora|findash|pii-washer)/i);
  });

  it('uses no hardcoded absolute URLs (relative paths only, reverse-proxy safe)', () => {
    expect(src).not.toMatch(/https?:\/\/localhost/);
    expect(src).not.toMatch(/https?:\/\/127\.0\.0\.1/);
  });

  it('has no bounce/scale cartoonish animations', () => {
    // Matches the safety-test spirit: no animate-bounce or scale-on-click transforms.
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/active:scale-/);
  });
});

// ---------------------------------------------------------------------------
// chat store behavior — the exact transitions ChatPanel relies on
// ---------------------------------------------------------------------------

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

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversationId: 'default',
  role: 'user',
  text: 'hello',
  timestamp: '2026-04-14T00:00:00.000Z',
  ...overrides,
});

describe('ChatPanel store contract', () => {
  it('starts empty so ChatPanel renders an empty message list initially', () => {
    const { messages } = useChatStore.getState();
    expect(messages).toEqual([]);
  });

  it('seed messages are visible to ChatPanel via the store selector', () => {
    const m1 = makeMessage({ id: 'u1', text: 'first' });
    const m2 = makeMessage({ id: 'a1', role: 'assistant', text: 'second' });
    useChatStore.getState().appendMessage(m1);
    useChatStore.getState().appendMessage(m2);
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('appending a user message (the submit path) stores it with role=user', () => {
    // Mirrors what ChatPanel.handleSubmit does before POSTing to /api/chat/prompt.
    useChatStore.getState().appendMessage(
      makeMessage({ id: 'u1', role: 'user', text: 'hi there' })
    );
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].text).toBe('hi there');
  });

  it('setStreaming toggles isStreaming (submit → true, done/error → false)', () => {
    useChatStore.getState().setStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);
    useChatStore.getState().setStreaming(false);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('appendAssistantChunk accumulates streamed SSE text into one assistant bubble', () => {
    // Mirrors the SSE onmessage path in ChatPanel.
    const { appendAssistantChunk } = useChatStore.getState();
    appendAssistantChunk('default', 'Hel');
    appendAssistantChunk('default', 'lo ');
    appendAssistantChunk('default', 'world');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].text).toBe('Hello world');
  });

  it('appendAssistantChunk after a user message creates a new assistant bubble', () => {
    // Typical flow: user submits → user msg appended → SSE starts → first
    // text chunk arrives → new assistant bubble appears underneath.
    useChatStore.getState().appendMessage(
      makeMessage({ id: 'u1', role: 'user', text: 'ping' })
    );
    useChatStore.getState().appendAssistantChunk('default', 'pong');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].text).toBe('pong');
  });
});
