/**
 * Tests for the hook event bridge (task005 — chat-workflows-tabs).
 *
 * Covers three surfaces:
 *
 *   1. `recordHookEvent()` pure module behaviour — builds a correctly-typed
 *      event, routes it to the active tab (or the synthetic `hook-background`
 *      conversation when none is set), and broadcasts a `{ type: 'hook_event',
 *      event }` chunk over SSE.
 *
 *   2. POST /api/chat/hook-event HTTP surface — 200 on well-formed payloads,
 *      400 on malformed ones, and payload data survives round-trip into
 *      `content.data`.
 *
 *   3. Source-text guardrail — `server/hooks-bridge.ts` must NEVER import or
 *      reference subprocess APIs. This is an event-adapter, not a command
 *      runner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../server/routes/chat', () => {
  return {
    default: {},
    broadcastChatEvent: vi.fn(),
    shutdownChatStreams: vi.fn(),
  };
});

// Seedable mock for the DB accessor.
vi.mock('../server/db', () => {
  return {
    getDB: vi.fn(),
  };
});

import { recordHookEvent } from '../server/hooks-bridge';
import hookBridgeRouter from '../server/routes/hook-bridge';
import { broadcastChatEvent } from '../server/routes/chat';
import { getDB } from '../server/db';
import type { SystemContent } from '../shared/types';

const mockedBroadcast = broadcastChatEvent as unknown as ReturnType<typeof vi.fn>;
const mockedGetDB = getDB as unknown as ReturnType<typeof vi.fn>;

/** Seed the DB mock with a given activeTabId (or null). */
function seedActiveTab(activeTabId: string | null): void {
  mockedGetDB.mockReturnValue({
    chatUIState: { openTabs: [], activeTabId, tabOrder: [] },
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', hookBridgeRouter);
  return app;
}

beforeEach(() => {
  mockedBroadcast.mockReset();
  mockedGetDB.mockReset();
  seedActiveTab(null);
});

describe('recordHookEvent — event shape', () => {
  it('builds a chat-hook / system / hook_fire event from a minimal payload', () => {
    seedActiveTab('tab-xyz');
    const ev = recordHookEvent({ hook: 'PostToolUse' });

    expect(ev.source).toBe('chat-hook');
    expect(ev.role).toBe('system');
    expect(ev.content.type).toBe('system');
    const sys = ev.content as SystemContent;
    expect(sys.subtype).toBe('hook_fire');
    expect(typeof ev.id).toBe('string');
    expect(ev.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(ev.timestamp))).toBe(false);
  });
});

describe('recordHookEvent — conversation routing', () => {
  it('routes to the active tab when chatUIState.activeTabId is set', () => {
    seedActiveTab('tab-xyz');
    const ev = recordHookEvent({ hook: 'PostToolUse', tool: 'Bash' });
    expect(ev.conversationId).toBe('tab-xyz');
  });

  it('falls back to hook-background when activeTabId is null', () => {
    seedActiveTab(null);
    const ev = recordHookEvent({ hook: 'PostToolUse' });
    expect(ev.conversationId).toBe('hook-background');
  });
});

describe('recordHookEvent — side effects', () => {
  it('broadcasts a { type: "hook_event", event } chunk', () => {
    seedActiveTab('tab-xyz');
    const ev = recordHookEvent({ hook: 'PostToolUse' });

    expect(mockedBroadcast).toHaveBeenCalledTimes(1);
    const [convId, chunk] = mockedBroadcast.mock.calls[0] as [
      string,
      { type: string; event: { id: string; source: string } },
    ];
    expect(convId).toBe('tab-xyz');
    expect(chunk.type).toBe('hook_event');
    expect(chunk.event.id).toBe(ev.id);
    expect(chunk.event.source).toBe('chat-hook');
  });

  it('broadcast targets hook-background when no active tab', () => {
    seedActiveTab(null);
    recordHookEvent({ hook: 'SessionStart' });
    expect(mockedBroadcast).toHaveBeenCalledTimes(1);
    const [convId] = mockedBroadcast.mock.calls[0] as [string, unknown];
    expect(convId).toBe('hook-background');
  });

  it('payload data survives into content.data for arbitrary extra fields', () => {
    seedActiveTab('tab-xyz');
    const ev = recordHookEvent({
      hook: 'PostToolUse',
      tool: 'Bash',
      custom: 42,
    });
    const sys = ev.content as SystemContent;
    expect(sys.data).toBeDefined();
    const data = sys.data as Record<string, unknown>;
    expect(data.hook).toBe('PostToolUse');
    expect(data.tool).toBe('Bash');
    expect(data.custom).toBe(42);
  });
});

describe('POST /api/chat/hook-event — HTTP surface', () => {
  it('accepts an arbitrary valid payload and returns { ok: true, id }', async () => {
    seedActiveTab('tab-xyz');
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/hook-event')
      .send({ hook: 'PostToolUse', tool: 'Bash', custom: 42 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);

    expect(mockedBroadcast).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty body with 400', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/hook-event').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(mockedBroadcast).not.toHaveBeenCalled();
  });

  it('rejects a payload missing the hook field with 400', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/hook-event')
      .send({ tool: 'Bash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects a payload whose hook field is not a non-empty string with 400', async () => {
    const app = buildApp();
    const resNumber = await request(app)
      .post('/api/chat/hook-event')
      .send({ hook: 123 });
    expect(resNumber.status).toBe(400);

    const resEmpty = await request(app)
      .post('/api/chat/hook-event')
      .send({ hook: '' });
    expect(resEmpty.status).toBe(400);
  });
});

describe('hooks-bridge — source-text security guardrail', () => {
  it('server/hooks-bridge.ts does not reference child_process, spawn, exec, eval, or Function(', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'server/hooks-bridge.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/\bchild_process\b/);
    expect(src).not.toMatch(/\bspawn\b/);
    expect(src).not.toMatch(/\bexecSync\b/);
    expect(src).not.toMatch(/\bexecFile\b/);
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/\bFunction\s*\(/);
  });
});
