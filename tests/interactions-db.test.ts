/**
 * Tests for the unified-capture SQLite store.
 *
 * Each test points `AGENT_CC_DATA` at a unique temp dir so we never touch
 * the real `~/.agent-cc/interactions.db`. The module under test reads the
 * env var lazily on every `openDb()` call (a deliberate departure from the
 * task contract pseudocode, which cached the path at import time) so this
 * works without monkey-patching internals.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openDb, closeDb, getDbPath } from '../server/interactions-db';

interface ColumnRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface IndexListRow {
  name: string;
  unique: number;
}

interface MigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

interface CountRow {
  c: number;
}

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGENT_CC_DATA;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interactions-db-'));
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

describe('interactions-db', () => {
  it('opens a fresh DB and runs all registered migrations', () => {
    const db = openDb();
    const rows = db
      .prepare('SELECT version, name, applied_at FROM migrations ORDER BY version')
      .all() as MigrationRow[];

    // Migration v1 must exist and be the events table.
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const v1 = rows.find((r) => r.version === 1);
    expect(v1).toBeDefined();
    expect(v1!.name).toBe('create_events_table');
    expect(v1!.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent on reopen — migrations are not re-applied', () => {
    const db1 = openDb();
    const beforeRows = db1.prepare('SELECT applied_at FROM migrations WHERE version = 1').get() as
      | { applied_at: string }
      | undefined;
    expect(beforeRows).toBeDefined();
    const firstAppliedAt = beforeRows!.applied_at;

    const initialCount = (
      db1.prepare('SELECT COUNT(*) AS c FROM migrations').get() as CountRow
    ).c;

    closeDb();

    // Reopen — should hit the cache check and skip re-running migrations.
    const db2 = openDb();
    const afterRows = db2
      .prepare('SELECT version, applied_at FROM migrations ORDER BY version')
      .all() as MigrationRow[];

    expect(afterRows.length).toBe(initialCount);
    const v1After = afterRows.find((r) => r.version === 1);
    expect(v1After!.applied_at).toBe(firstAppliedAt);
  });

  it('creates the events table with the InteractionEvent column shape', () => {
    const db = openDb();
    const cols = db.prepare('PRAGMA table_info(events)').all() as ColumnRow[];
    const byName = new Map(cols.map((c) => [c.name, c]));

    expect(byName.has('id')).toBe(true);
    expect(byName.get('id')!.pk).toBe(1);

    expect(byName.get('conversation_id')!.notnull).toBe(1);
    expect(byName.get('timestamp')!.notnull).toBe(1);
    expect(byName.get('source')!.notnull).toBe(1);
    expect(byName.get('role')!.notnull).toBe(1);
    expect(byName.get('content_json')!.notnull).toBe(1);

    // Optional columns — nullable
    expect(byName.get('parent_event_id')!.notnull).toBe(0);
    expect(byName.get('cost_json')!.notnull).toBe(0);
    expect(byName.get('metadata_json')!.notnull).toBe(0);

    // Exactly the expected column set, no surprises
    expect(new Set(cols.map((c) => c.name))).toEqual(
      new Set([
        'id',
        'conversation_id',
        'parent_event_id',
        'timestamp',
        'source',
        'role',
        'content_json',
        'cost_json',
        'metadata_json',
      ])
    );
  });

  it('creates indexes on conversation_id, timestamp, and source', () => {
    const db = openDb();
    const indexes = db.prepare('PRAGMA index_list(events)').all() as IndexListRow[];
    const names = new Set(indexes.map((i) => i.name));

    expect(names.has('idx_events_conversation_id')).toBe(true);
    expect(names.has('idx_events_timestamp')).toBe(true);
    expect(names.has('idx_events_source')).toBe(true);
  });

  it('enables WAL journal mode', () => {
    const db = openDb();
    const mode = db.pragma('journal_mode', { simple: true });
    expect(String(mode).toLowerCase()).toBe('wal');
  });

  it('respects AGENT_CC_DATA — DB lives at the configured temp dir', () => {
    const db = openDb();
    const expectedPath = path.join(tempDir, 'interactions.db');

    expect(getDbPath()).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);

    // Sanity: writing through the handle persists at the configured location.
    db.exec("CREATE TABLE _probe (id INTEGER); INSERT INTO _probe VALUES (1);");
    const row = db.prepare('SELECT COUNT(*) AS c FROM _probe').get() as CountRow;
    expect(row.c).toBe(1);
  });

  it('closeDb releases the handle and openDb works afterward', () => {
    const db1 = openDb();
    db1.exec('CREATE TABLE _probe (id INTEGER)');
    closeDb();

    // Reopening must succeed without throwing — and the schema persists
    // because we wrote to disk before closing.
    const db2 = openDb();
    const tables = db2
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_probe'")
      .all() as { name: string }[];
    expect(tables.length).toBe(1);
  });
});
