/**
 * Route-level tests for the task005 settings passthrough — chat-composer-controls.
 *
 * POST /api/chat/prompt now accepts `effort`, `thinking`, `webSearch`, and
 * `systemPrompt` alongside `model`. This file verifies the handler reads
 * each field from the request body and forwards it into the
 * `runClaudeStreaming(...)` options object.
 *
 * Runner-side CLI-arg tests (and the source-text + store tests) live in
 * `chat-popover-controls.test.ts`. Split into two files because
 * `vi.mock('child_process')` (runner test) collides with
 * `vi.mock('../server/scanner/claude-runner')` (route test) — same pattern
 * as chat-model-dropdown-route.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/scanner/claude-runner', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../server/scanner/claude-runner')
  >();
  return {
    ...actual,
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

import chatRouter from '../server/routes/chat';
import {
  isClaudeAvailable,
  runClaudeStreaming,
} from '../server/scanner/claude-runner';
import { getDB } from '../server/db';

const mockedIsClaudeAvailable =
  isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming =
  runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;

async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
}

describe('POST /api/chat/prompt — task005 settings passthrough', () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    const db = getDB();
    db.chatSessions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards effort from the request body into runClaudeStreaming', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-effort',
      text: 'hi',
      effort: 'high',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.effort).toBe('high');
  });

  it('forwards systemPrompt from the request body', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-sys',
      text: 'hi',
      systemPrompt: 'Be terse.',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.systemPrompt).toBe('Be terse.');
  });

  it('forwards thinking and webSearch booleans from the request body', async () => {
    // Runner currently drops these on the floor (no CLI flag), but the
    // handler must still accept and forward them so a future runner
    // implementation can pick them up without a route change.
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-bools',
      text: 'hi',
      thinking: true,
      webSearch: true,
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.thinking).toBe(true);
    expect(opts.webSearch).toBe(true);
  });

  it('forwards all task005 settings alongside model + sessionId on a resumed conversation', async () => {
    const db = getDB();
    db.chatSessions['c-all'] = {
      sessionId: 'sess-uuid',
      title: 't',
      createdAt: new Date().toISOString(),
    };

    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-all',
      text: 'hi',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      thinking: true,
      webSearch: false,
      systemPrompt: 'context',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.sessionId).toBe('sess-uuid');
    expect(opts.model).toBe('claude-sonnet-4-6');
    expect(opts.effort).toBe('medium');
    expect(opts.thinking).toBe(true);
    expect(opts.webSearch).toBe(false);
    expect(opts.systemPrompt).toBe('context');
  });

  it('omits task005 fields from runner opts when request body lacks them (back-compat)', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-legacy',
      text: 'hi',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.effort).toBeUndefined();
    expect(opts.thinking).toBeUndefined();
    expect(opts.webSearch).toBeUndefined();
    expect(opts.systemPrompt).toBeUndefined();
  });
});
