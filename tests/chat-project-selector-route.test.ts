/**
 * Route-level tests for the task006 projectPath passthrough —
 * chat-composer-controls.
 *
 * POST /api/chat/prompt now accepts `projectPath` alongside the other
 * settings. When present it's forwarded into `runClaudeStreaming(...)` as
 * the `cwd` option, so the Claude CLI spawns with that project's working
 * directory.
 *
 * Runner-side spawn tests (and the source-text + store tests) live in
 * `chat-project-selector.test.ts`. Split into two files because
 * `vi.mock('child_process')` (runner test) collides with
 * `vi.mock('../server/scanner/claude-runner')` (route test) — same pattern
 * as chat-popover-controls-route.test.ts.
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

describe('POST /api/chat/prompt — task006 projectPath passthrough', () => {
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

  it('forwards projectPath as cwd into runClaudeStreaming', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-proj',
      text: 'hi',
      projectPath: '/home/user/projects/app',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBe('/home/user/projects/app');
  });

  it('omits cwd when projectPath is not provided ("General")', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-gen',
      text: 'hi',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBeUndefined();
  });

  it('omits cwd when projectPath is an empty string', async () => {
    // Empty string should not become cwd: "" — treat falsy path as unset.
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-empty',
      text: 'hi',
      projectPath: '',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBeUndefined();
  });

  it('ignores non-string projectPath payloads', async () => {
    // Defense in depth — guard against a malformed client sending a number
    // or object. The handler already narrows each field; regression pin.
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/prompt')
      .send({
        conversationId: 'c-bad',
        text: 'hi',
        projectPath: 42 as any,
      });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBeUndefined();
  });

  it('forwards projectPath alongside all other task005 settings', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/prompt').send({
      conversationId: 'c-all',
      text: 'hi',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      thinking: true,
      webSearch: false,
      systemPrompt: 'ctx',
      projectPath: '/workspace/repo',
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBe('claude-sonnet-4-6');
    expect(opts.effort).toBe('medium');
    expect(opts.thinking).toBe(true);
    expect(opts.webSearch).toBe(false);
    expect(opts.systemPrompt).toBe('ctx');
    expect(opts.cwd).toBe('/workspace/repo');
  });
});
