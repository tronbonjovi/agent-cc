/**
 * Route tests for POST /api/chat/workflow (task004 — chat-workflows-tabs).
 *
 * These tests enforce the contract with the task003 client dispatcher:
 *   - 400 on malformed body
 *   - 404 on unknown workflow (falls through to AI on the client)
 *   - 202 + async broadcast on a known workflow
 *
 * server/routes/chat is mocked so we can assert on the broadcast side effects
 * without starting a real SSE stream.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/routes/chat', () => {
  return {
    default: {},
    broadcastChatEvent: vi.fn(),
    shutdownChatStreams: vi.fn(),
  };
});

import chatWorkflowsRouter from '../server/routes/chat-workflows';
import { broadcastChatEvent } from '../server/routes/chat';
import type { InteractionEvent } from '../shared/types';

const mockedBroadcast =
  broadcastChatEvent as unknown as ReturnType<typeof vi.fn>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatWorkflowsRouter);
  return app;
}

/**
 * Yield control back to the event loop several times so the fire-and-forget
 * async runner inside the route has a chance to drain.
 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe('POST /api/chat/workflow — validation', () => {
  beforeEach(() => {
    mockedBroadcast.mockReset();
  });

  it('returns 400 when conversationId is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/workflow')
      .send({ workflow: 'echo', args: '', raw: '/echo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when workflow is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/workflow')
      .send({ conversationId: 'c1', args: '', raw: '/echo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when args is not a string', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/workflow')
      .send({ conversationId: 'c1', workflow: 'echo', args: 123, raw: '/echo' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when raw is not a string', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/workflow')
      .send({ conversationId: 'c1', workflow: 'echo', args: '', raw: null });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat/workflow — unknown workflow', () => {
  beforeEach(() => {
    mockedBroadcast.mockReset();
  });

  it('returns 404 with body { error: "unknown workflow: <name>" } — task003 fall-through contract', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/workflow').send({
      conversationId: 'c1',
      workflow: 'does-not-exist',
      args: '',
      raw: '/does-not-exist',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'unknown workflow: does-not-exist' });
    await flushAsync();
    expect(mockedBroadcast).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat/workflow — echo happy path', () => {
  beforeEach(() => {
    mockedBroadcast.mockReset();
  });

  it('returns 202 + { ok: true } immediately', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/workflow').send({
      conversationId: 'c1',
      workflow: 'echo',
      args: 'hi',
      raw: '/echo hi',
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
  });

  it('broadcasts every yielded event via broadcastChatEvent with type=workflow_event', async () => {
    const app = buildApp();
    await request(app).post('/api/chat/workflow').send({
      conversationId: 'c1',
      workflow: 'echo',
      args: 'hi',
      raw: '/echo hi',
    });
    await flushAsync();

    expect(mockedBroadcast).toHaveBeenCalledTimes(3);
    for (const call of mockedBroadcast.mock.calls) {
      const [convId, chunk] = call as [string, { type: string; event: InteractionEvent }];
      expect(convId).toBe('c1');
      expect(chunk.type).toBe('workflow_event');
      expect(chunk.event.source).toBe('chat-workflow');
    }
  });
});
