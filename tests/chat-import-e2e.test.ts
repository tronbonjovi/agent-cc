/**
 * Chat-import E2E integration test (task006 — chat-import-platforms milestone).
 *
 * Stitches together the full server round-trip against a real temp SQLite DB:
 *
 *   1. Seed scanner-jsonl events via the real repo layer
 *   2. POST /api/chat/import → clone into a new chat-ai conversation
 *   3. Read back events via the repo layer directly (the HTTP conversation
 *      listing routes were removed in the chat-scanner-unification milestone)
 *
 * Only the DB and routes are exercised — no mocks. The chat-import route is
 * a synchronous clone so there is no polling/waitFor needed.
 *
 * Isolation: each test gets its own AGENT_CC_DATA temp dir (mirrors the
 * pattern in tests/chat-import.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../server/interactions-db';
import {
  insertEventsBatch,
  getEventsByConversation,
  listConversations,
} from '../server/interactions-repo';
import chatImportRouter from '../server/routes/chat-import';
import type { InteractionEvent } from '../shared/types';

// ---------------------------------------------------------------------------
// Per-test temp DB isolation
// ---------------------------------------------------------------------------

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGENT_CC_DATA;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-import-e2e-'));
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

/** Build a minimal scanner-jsonl InteractionEvent. */
function makeScannerEvent(
  conversationId: string,
  index: number,
  role: 'user' | 'assistant' = index % 2 === 0 ? 'user' : 'assistant',
): InteractionEvent {
  return {
    id: `scanner-${conversationId}-${index}`,
    conversationId,
    parentEventId: null,
    timestamp: `2026-04-15T10:00:0${index}.000Z`,
    source: 'scanner-jsonl',
    role,
    content: { type: 'text', text: `message ${index}` },
    cost: null,
    metadata: { sessionPath: '/fake/session.jsonl', seq: index },
  };
}

/** Seed N scanner-jsonl events for a conversation and return them. */
function seedConversation(conversationId: string, count: number): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(makeScannerEvent(conversationId, i));
  }
  insertEventsBatch(events);
  return events;
}

/** Build an Express app with the chat-import router mounted. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatImportRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat-import E2E', () => {
  it('imports a conversation and loads back events with full content parity', async () => {
    const srcId = 'e2e-import-src';
    const seeded = seedConversation(srcId, 4);
    const app = buildApp();

    // 1. Import via POST
    const importRes = await request(app)
      .post('/api/chat/import')
      .send({ sourceConversationId: srcId });

    expect(importRes.status).toBe(200);
    expect(typeof importRes.body.newConversationId).toBe('string');
    expect(importRes.body.newConversationId).not.toBe(srcId);
    expect(importRes.body.eventCount).toBe(4);

    const newId: string = importRes.body.newConversationId;

    // 2. Load back via the repo layer directly (HTTP routes removed)
    const imported = getEventsByConversation(newId);
    expect(imported).toHaveLength(4);

    // 3. Full parity: content, role, and ordering match the originals.
    for (let i = 0; i < seeded.length; i++) {
      const orig = seeded[i];
      const clone = imported[i];

      expect(clone.content).toEqual(orig.content);
      expect(clone.role).toBe(orig.role);
      expect(clone.timestamp).toBe(orig.timestamp);
      expect(clone.source).toBe('chat-ai');
      expect(clone.conversationId).toBe(newId);
      expect(clone.id).not.toBe(orig.id);
      const meta = clone.metadata as Record<string, unknown>;
      expect(meta.importedFrom).toBe(srcId);
      expect(typeof meta.importedAt).toBe('string');
      expect(meta.sessionPath).toBe('/fake/session.jsonl');
      expect(meta.seq).toBe(i);
    }
  });

  it('leaves the original conversation untouched and both appear in listConversations', async () => {
    const srcId = 'e2e-untouched-src';
    const seeded = seedConversation(srcId, 3);
    const app = buildApp();

    // Import
    const importRes = await request(app)
      .post('/api/chat/import')
      .send({ sourceConversationId: srcId });
    expect(importRes.status).toBe(200);
    const newId: string = importRes.body.newConversationId;

    // Original events unchanged — read via repo directly
    const origEvents = getEventsByConversation(srcId);
    expect(origEvents).toHaveLength(3);
    for (let i = 0; i < seeded.length; i++) {
      expect(origEvents[i].id).toBe(seeded[i].id);
      expect(origEvents[i].source).toBe('scanner-jsonl');
      expect(origEvents[i].conversationId).toBe(srcId);
      expect(origEvents[i].content).toEqual(seeded[i].content);
    }

    // Both conversations appear in the repo's conversation list
    const conversations = listConversations();
    const srcEntry = conversations.find((c) => c.conversationId === srcId);
    const newEntry = conversations.find((c) => c.conversationId === newId);

    expect(srcEntry).toBeTruthy();
    expect(srcEntry!.source).toBe('scanner-jsonl');
    expect(srcEntry!.eventCount).toBe(3);

    expect(newEntry).toBeTruthy();
    expect(newEntry!.source).toBe('chat-ai');
    expect(newEntry!.eventCount).toBe(3);
  });

  it('returns 404 when importing an unknown conversation', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/chat/import')
      .send({ sourceConversationId: 'nonexistent-conversation' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
