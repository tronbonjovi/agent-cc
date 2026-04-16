/**
 * Tests for the chat-import module and HTTP route (task002 — chat-import-platforms).
 *
 * Two surfaces:
 *   1. `importConversationAsChat()` pure function — clones all events from a
 *      source conversation into a new one, reclassifies them as `chat-ai`,
 *      stamps `importedFrom` + `importedAt` provenance metadata, and assigns
 *      fresh IDs. Throws on unknown source ids. Original events stay put.
 *
 *   2. `POST /api/chat/import` — thin HTTP wrapper. 200 + `{ newConversationId, eventCount }`
 *      on success; 400 when `sourceConversationId` is missing; 404 when the
 *      source has no events.
 *
 * Isolation mirrors `tests/interactions-repo.test.ts`: each test points
 * `AGENT_CC_DATA` at a fresh temp dir so the real SQLite DB is untouched.
 * We go through the real repo layer end-to-end — the point of the test is
 * that metadata JSON round-trips, fresh IDs are emitted, and the read-back
 * shows what the UI will see.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../server/interactions-db';
import {
  insertEvent,
  insertEventsBatch,
  getEventsByConversation,
} from '../server/interactions-repo';
import { importConversationAsChat } from '../server/chat-import';
import chatImportRouter from '../server/routes/chat-import';
import type { InteractionEvent } from '../shared/types';

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGENT_CC_DATA;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-import-'));
  process.env.AGENT_CC_DATA = tempDir;
});

afterEach(() => {
  closeDb();
  if (originalEnv === undefined) {
    delete process.env.AGENT_CC_DATA;
  } else {
    process.env.AGENT_CC_DATA = originalEnv;
  }
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a scanner-jsonl event with a deterministic id suffix. */
function makeScannerEvent(
  conversationId: string,
  suffix: string,
  overrides: Partial<InteractionEvent> = {},
): InteractionEvent {
  return {
    id: `scanner-${conversationId}-${suffix}`,
    conversationId,
    parentEventId: null,
    timestamp: `2026-04-15T10:00:0${suffix}.000Z`,
    source: 'scanner-jsonl',
    role: 'assistant',
    content: { type: 'text', text: `message ${suffix}` },
    cost: null,
    metadata: { sessionPath: '/some/jsonl/path.jsonl', seq: Number(suffix) },
    ...overrides,
  };
}

/** Seed N scanner events for a conversation. */
function seedScannerConversation(
  conversationId: string,
  n: number,
): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  for (let i = 0; i < n; i++) {
    events.push(makeScannerEvent(conversationId, String(i)));
  }
  insertEventsBatch(events);
  return events;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatImportRouter);
  return app;
}

// ---------------------------------------------------------------------------
// importConversationAsChat — function-level tests
// ---------------------------------------------------------------------------

describe('importConversationAsChat', () => {
  it('imports scanner events into a new conversation with source chat-ai', () => {
    const srcId = 'src-conv-1';
    seedScannerConversation(srcId, 5);

    const result = importConversationAsChat(srcId);

    expect(result.eventCount).toBe(5);
    expect(typeof result.newConversationId).toBe('string');
    expect(result.newConversationId.length).toBeGreaterThan(0);
    expect(result.newConversationId).not.toBe(srcId);

    const cloned = getEventsByConversation(result.newConversationId);
    expect(cloned).toHaveLength(5);
    for (const ev of cloned) {
      expect(ev.source).toBe('chat-ai');
      expect(ev.conversationId).toBe(result.newConversationId);
    }
  });

  it('assigns fresh event IDs that do not collide with the source events', () => {
    const srcId = 'src-conv-2';
    const seeded = seedScannerConversation(srcId, 3);
    const seededIds = new Set(seeded.map((e) => e.id));

    const result = importConversationAsChat(srcId);
    const cloned = getEventsByConversation(result.newConversationId);

    for (const ev of cloned) {
      expect(seededIds.has(ev.id)).toBe(false);
    }
    // All fresh ids are unique among themselves as well.
    const freshIds = new Set(cloned.map((e) => e.id));
    expect(freshIds.size).toBe(cloned.length);
  });

  it('leaves the original scanner events untouched after import', () => {
    const srcId = 'src-conv-3';
    const seeded = seedScannerConversation(srcId, 4);

    importConversationAsChat(srcId);

    const original = getEventsByConversation(srcId);
    expect(original).toHaveLength(seeded.length);
    for (const ev of original) {
      expect(ev.source).toBe('scanner-jsonl');
      expect(ev.conversationId).toBe(srcId);
    }
    // Ids match what was seeded — the import did not overwrite them.
    const originalIds = new Set(original.map((e) => e.id));
    for (const seededEv of seeded) {
      expect(originalIds.has(seededEv.id)).toBe(true);
    }
  });

  it('throws when the source conversation has no events', () => {
    expect(() => importConversationAsChat('does-not-exist')).toThrow();
  });

  it('stamps importedFrom and importedAt provenance metadata on every clone', () => {
    const srcId = 'src-conv-4';
    // Seed one event with pre-existing metadata so we can also verify the
    // existing keys are preserved and not clobbered by the merge.
    const pre = makeScannerEvent(srcId, '0', {
      metadata: { existing: 'value', sessionPath: '/preserved.jsonl' },
    });
    insertEvent(pre);

    const beforeIso = new Date().toISOString();
    const result = importConversationAsChat(srcId);
    const afterIso = new Date().toISOString();

    const cloned = getEventsByConversation(result.newConversationId);
    expect(cloned).toHaveLength(1);

    const meta = cloned[0].metadata as Record<string, unknown>;
    expect(meta.importedFrom).toBe(srcId);
    expect(typeof meta.importedAt).toBe('string');
    expect(Number.isNaN(Date.parse(meta.importedAt as string))).toBe(false);
    // Sanity: importedAt sits inside the window the test spans.
    expect((meta.importedAt as string) >= beforeIso).toBe(true);
    expect((meta.importedAt as string) <= afterIso).toBe(true);
    // Pre-existing metadata survives.
    expect(meta.existing).toBe('value');
    expect(meta.sessionPath).toBe('/preserved.jsonl');
  });
});

// ---------------------------------------------------------------------------
// POST /api/chat/import — HTTP surface
// ---------------------------------------------------------------------------

describe('POST /api/chat/import', () => {
  it('returns 200 with newConversationId on success', async () => {
    const srcId = 'http-src-1';
    seedScannerConversation(srcId, 2);

    const app = buildApp();
    const res = await request(app)
      .post('/api/chat/import')
      .send({ sourceConversationId: srcId });

    expect(res.status).toBe(200);
    expect(typeof res.body.newConversationId).toBe('string');
    expect(res.body.newConversationId.length).toBeGreaterThan(0);
    expect(res.body.eventCount).toBe(2);

    // Round-trip: the new conversation is readable with chat-ai source.
    const cloned = getEventsByConversation(res.body.newConversationId);
    expect(cloned).toHaveLength(2);
    for (const ev of cloned) {
      expect(ev.source).toBe('chat-ai');
    }
  });

  it('returns 400 when sourceConversationId is missing', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/chat/import').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
