/**
 * Route tests for POST /api/chat/workflow (task004 — chat-workflows-tabs).
 *
 * These tests enforce the contract with the task003 client dispatcher:
 *   - 400 on malformed body
 *   - 404 on unknown workflow (falls through to AI on the client)
 *   - 202 + async persist+broadcast on a known workflow
 *
 * interactions-repo and server/routes/chat are both mocked so we can assert
 * on the persistence + broadcast side effects without starting a real SSE
 * stream or touching the interactions DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../server/interactions-repo', () => {
  return {
    insertEvent: vi.fn(),
  };
});

vi.mock('../server/routes/chat', () => {
  return {
    // The router itself is unused in these tests — we mount the workflows
    // router directly — but chat-workflows.ts imports `broadcastChatEvent`
    // from this module and we need the mock factory to expose it.
    default: {},
    broadcastChatEvent: vi.fn(),
    shutdownChatStreams: vi.fn(),
  };
});

import chatWorkflowsRouter from '../server/routes/chat-workflows';
import { insertEvent } from '../server/interactions-repo';
import { broadcastChatEvent } from '../server/routes/chat';
import type { InteractionEvent } from '../shared/types';

const mockedInsertEvent =
  insertEvent as unknown as ReturnType<typeof vi.fn>;
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
 * async runner inside the route has a chance to drain. `setImmediate` alone
 * is not always enough when the runner awaits across multiple microtask
 * boundaries, so we drain a generous handful.
 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe('POST /api/chat/workflow — validation', () => {
  beforeEach(() => {
    mockedInsertEvent.mockReset();
    mockedInsertEvent.mockImplementation(() => {});
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
    mockedInsertEvent.mockReset();
    mockedInsertEvent.mockImplementation(() => {});
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
    // No persistence or broadcast should happen on a 404.
    await flushAsync();
    expect(mockedInsertEvent).not.toHaveBeenCalled();
    expect(mockedBroadcast).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat/workflow — echo happy path', () => {
  beforeEach(() => {
    mockedInsertEvent.mockReset();
    mockedInsertEvent.mockImplementation(() => {});
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

  it('persists every yielded event via insertEvent with source=chat-workflow', async () => {
    const app = buildApp();
    await request(app).post('/api/chat/workflow').send({
      conversationId: 'c1',
      workflow: 'echo',
      args: 'hi',
      raw: '/echo hi',
    });
    await flushAsync();

    expect(mockedInsertEvent).toHaveBeenCalledTimes(3);
    for (const call of mockedInsertEvent.mock.calls) {
      const ev = call[0] as InteractionEvent;
      expect(ev.source).toBe('chat-workflow');
      expect(ev.conversationId).toBe('c1');
      expect(ev.role).toBe('system');
      expect(ev.cost).toBeNull();
    }
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

  it('insertEvent failure does NOT crash the runner — later events are still broadcast', async () => {
    // Make the FIRST insertEvent call throw. Per the route, we log + keep
    // going, so the second and third events still get through both paths.
    mockedInsertEvent.mockReset();
    let call = 0;
    mockedInsertEvent.mockImplementation(() => {
      call += 1;
      if (call === 1) throw new Error('simulated DB failure');
    });

    const app = buildApp();
    await request(app).post('/api/chat/workflow').send({
      conversationId: 'c1',
      workflow: 'echo',
      args: 'hi',
      raw: '/echo hi',
    });
    await flushAsync();

    // All three events attempted — first threw, second+third succeeded.
    expect(mockedInsertEvent).toHaveBeenCalledTimes(3);
    // Broadcast still fired for all three events (broadcast happens after
    // the try/catch around insertEvent in the runner).
    expect(mockedBroadcast).toHaveBeenCalledTimes(3);
  });
});
