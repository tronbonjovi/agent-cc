// tests/chat-conversations-all-route.test.ts
//
// Route-level tests for GET /api/chat/conversations/all (chat-import-platforms
// task004). Unlike GET /api/chat/conversations (which filters to chat-*
// sources for the chat history list), this endpoint returns every
// conversation in the store so the sidebar can group by source and offer
// scanner-jsonl imports alongside native chat conversations.
//
// We mock listConversations so the test doesn't touch SQLite — the
// endpoint is pure pass-through and the repo layer has its own isolation
// tests in tests/interactions-repo.test.ts and tests/chat-import.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the claude-runner so importing the route module doesn't try to spawn
// or verify Claude anywhere — chat.ts only calls it inside POST /prompt, but
// module-import side effects can still touch it via the registration path.
vi.mock('../server/scanner/claude-runner', () => ({
  isClaudeAvailable: vi.fn(async () => true),
  runClaudeStreaming: vi.fn(),
  resetClaudeAvailabilityCache: vi.fn(),
}));

vi.mock('../server/interactions-repo', () => ({
  insertEvent: vi.fn(),
  listConversations: vi.fn(() => []),
  getEventsByConversation: vi.fn(() => []),
}));

import chatRouter from '../server/routes/chat';
import { listConversations } from '../server/interactions-repo';

const mockedListConversations = listConversations as unknown as ReturnType<
  typeof vi.fn
>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
}

describe('GET /api/chat/conversations/all', () => {
  beforeEach(() => {
    mockedListConversations.mockReset();
    mockedListConversations.mockReturnValue([]);
  });

  it('returns an empty list when the store has no conversations', async () => {
    mockedListConversations.mockReturnValue([]);
    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations/all');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversations: [] });
    expect(mockedListConversations).toHaveBeenCalledTimes(1);
  });

  it('returns ALL conversations unfiltered — including scanner-jsonl', async () => {
    // Mixed bag: chat-ai, scanner-jsonl, planned external. The chat history
    // endpoint filters scanner-jsonl out; this one must not.
    mockedListConversations.mockReturnValue([
      {
        conversationId: 'conv-chat-ai',
        source: 'chat-ai',
        eventCount: 3,
        lastEvent: '2026-04-15T10:00:00.000Z',
      },
      {
        conversationId: 'conv-scanner',
        source: 'scanner-jsonl',
        eventCount: 10,
        lastEvent: '2026-04-15T09:00:00.000Z',
      },
      {
        conversationId: 'conv-slash',
        source: 'chat-slash',
        eventCount: 1,
        lastEvent: '2026-04-15T08:00:00.000Z',
      },
    ]);

    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations/all');
    expect(res.status).toBe(200);

    const conversations = res.body.conversations as Array<{
      conversationId: string;
      source: string;
    }>;
    expect(conversations).toHaveLength(3);

    const bySource = new Map(conversations.map((c) => [c.conversationId, c.source]));
    expect(bySource.get('conv-chat-ai')).toBe('chat-ai');
    expect(bySource.get('conv-scanner')).toBe('scanner-jsonl');
    expect(bySource.get('conv-slash')).toBe('chat-slash');
  });

  it('preserves the repo ordering (lastEvent DESC) without re-sorting', async () => {
    mockedListConversations.mockReturnValue([
      {
        conversationId: 'newest',
        source: 'chat-ai',
        eventCount: 1,
        lastEvent: '2026-04-15T12:00:00.000Z',
      },
      {
        conversationId: 'middle',
        source: 'chat-ai',
        eventCount: 1,
        lastEvent: '2026-04-15T11:00:00.000Z',
      },
      {
        conversationId: 'oldest',
        source: 'scanner-jsonl',
        eventCount: 1,
        lastEvent: '2026-04-15T10:00:00.000Z',
      },
    ]);

    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations/all');
    expect(res.status).toBe(200);

    const ids = (res.body.conversations as Array<{ conversationId: string }>).map(
      (c) => c.conversationId,
    );
    expect(ids).toEqual(['newest', 'middle', 'oldest']);
  });
});
