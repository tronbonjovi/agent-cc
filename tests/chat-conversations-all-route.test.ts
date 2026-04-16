// tests/chat-conversations-all-route.test.ts
//
// Verifies that the conversation listing routes (GET /conversations,
// GET /conversations/all, GET /conversations/:id/events) have been removed
// from the chat router as part of the chat-scanner-unification milestone.
// These routes were backed by SQLite which is being phased out in favor of
// JSONL-based scanning.

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/scanner/claude-runner', () => ({
  isClaudeAvailable: vi.fn(async () => true),
  runClaudeStreaming: vi.fn(),
  resetClaudeAvailabilityCache: vi.fn(),
}));

vi.mock('../server/db', () => ({
  getDB: vi.fn(() => ({
    chatSessions: {},
    chatUIState: { openTabs: [], activeTabId: null, tabOrder: [] },
  })),
  save: vi.fn(),
}));

import chatRouter from '../server/routes/chat';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
}

describe('removed conversation listing routes', () => {
  it('GET /conversations returns 404 (route removed)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations');
    expect(res.status).toBe(404);
  });

  it('GET /conversations/all returns 404 (route removed)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations/all');
    expect(res.status).toBe(404);
  });

  it('GET /conversations/:id/events returns 404 (route removed)', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/chat/conversations/some-id/events');
    expect(res.status).toBe(404);
  });
});
