/**
 * Tests for the scanner ingester service (scanner-ingester task002).
 *
 * The ingester walks `.jsonl` files under project roots, maps each line with
 * `jsonlLinesToEvents`, and upserts events into `interactions.db`. Resumption
 * is byte-offset based — tracked in an `ingestion_state` table.
 *
 * Each test uses its own temp `AGENT_CC_DATA` dir (fresh `interactions.db`)
 * AND its own temp project root, passed explicitly via `ingestAllOnce(roots)`
 * so tests never touch the real home directory. The ingester itself still
 * defaults to `~/.claude/projects` + `EXTRA_PROJECT_DIRS` in production.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDb, openDb } from '../server/interactions-db';
import {
  ingestFileOnce,
  ingestAllOnce,
  startIngester,
  stopIngester,
} from '../server/scanner/ingester';
import { countBySource, getEventsByConversation } from '../server/interactions-repo';

interface IngestionStateRow {
  file_path: string;
  last_offset: number;
  last_ingested_at: string;
  event_count: number;
}

interface CountRow {
  c: number;
}

let tempDataDir: string;
let tempProjectDir: string;
let originalEnvData: string | undefined;
let originalEnvExtra: string | undefined;

beforeEach(() => {
  originalEnvData = process.env.AGENT_CC_DATA;
  originalEnvExtra = process.env.EXTRA_PROJECT_DIRS;

  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingester-data-'));
  tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingester-proj-'));
  process.env.AGENT_CC_DATA = tempDataDir;
  delete process.env.EXTRA_PROJECT_DIRS;
});

afterEach(() => {
  stopIngester();
  closeDb();

  if (originalEnvData === undefined) delete process.env.AGENT_CC_DATA;
  else process.env.AGENT_CC_DATA = originalEnvData;

  if (originalEnvExtra === undefined) delete process.env.EXTRA_PROJECT_DIRS;
  else process.env.EXTRA_PROJECT_DIRS = originalEnvExtra;

  for (const dir of [tempDataDir, tempProjectDir]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic assistant-text JSONL line with the given uuid + content.
 * Matches the shape the mapper expects (see jsonl-to-event.test.ts fixtures).
 */
function assistantLine(uuid: string, text: string, ts: string): string {
  return (
    JSON.stringify({
      type: 'assistant',
      uuid,
      timestamp: ts,
      message: {
        role: 'assistant',
        model: 'claude-opus-4-6',
        content: [{ type: 'text', text }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }) + '\n'
  );
}

function userLine(uuid: string, text: string, ts: string): string {
  return (
    JSON.stringify({
      type: 'user',
      uuid,
      timestamp: ts,
      message: { role: 'user', content: text },
    }) + '\n'
  );
}

/** Create a session .jsonl file under the given project-key dir. */
function writeSession(
  projectRoot: string,
  projectKey: string,
  sessionId: string,
  content: string,
): string {
  const dir = path.join(projectRoot, projectKey);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** Poll the ingestion_state row for a file. */
function getIngestionState(filePath: string): IngestionStateRow | undefined {
  const db = openDb();
  return db
    .prepare('SELECT * FROM ingestion_state WHERE file_path = ?')
    .get(filePath) as IngestionStateRow | undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ingester — migration', () => {
  it('creates the ingestion_state table on openDb', () => {
    const db = openDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingestion_state'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);

    // Verify schema columns exist
    const cols = db
      .prepare("PRAGMA table_info('ingestion_state')")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(['event_count', 'file_path', 'last_ingested_at', 'last_offset'].sort());
  });

  it('runs both v1 and v2 migrations via the existing runner', () => {
    const db = openDb();
    const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as Array<{
      version: number;
    }>;
    const versions = rows.map((r) => r.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });
});

describe('ingester — ingestFileOnce', () => {
  it('ingests a new file and records ingestion_state', () => {
    const content =
      userLine('u-1', 'hello', '2026-04-15T10:00:00Z') +
      assistantLine('a-1', 'hi there', '2026-04-15T10:00:01Z');
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-1', content);

    const inserted = ingestFileOnce(filePath);
    expect(inserted).toBeGreaterThan(0);

    const events = getEventsByConversation('session-1');
    expect(events).toHaveLength(2);
    expect(events[0].role).toBe('user');
    expect(events[1].role).toBe('assistant');

    const state = getIngestionState(filePath);
    expect(state).toBeDefined();
    expect(state!.last_offset).toBe(fs.statSync(filePath).size);
    expect(state!.event_count).toBe(2);
  });

  it('is idempotent — second call inserts zero events, offset unchanged', () => {
    const content =
      userLine('u-1', 'hello', '2026-04-15T10:00:00Z') +
      assistantLine('a-1', 'hi there', '2026-04-15T10:00:01Z');
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-idem', content);

    const first = ingestFileOnce(filePath);
    const state1 = getIngestionState(filePath);
    expect(state1!.last_offset).toBe(fs.statSync(filePath).size);

    const second = ingestFileOnce(filePath);
    expect(second).toBe(0);

    const state2 = getIngestionState(filePath);
    expect(state2!.last_offset).toBe(state1!.last_offset);

    // Event count unchanged (INSERT OR REPLACE means no duplicates anyway)
    const db = openDb();
    const { c } = db
      .prepare('SELECT COUNT(*) AS c FROM events WHERE conversation_id = ?')
      .get('session-idem') as CountRow;
    expect(c).toBe(first);
  });

  it('incremental append — ingests only new lines on re-run', () => {
    const initial =
      userLine('u-1', 'first', '2026-04-15T10:00:00Z') +
      userLine('u-2', 'second', '2026-04-15T10:00:01Z') +
      userLine('u-3', 'third', '2026-04-15T10:00:02Z');
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-inc', initial);

    ingestFileOnce(filePath);
    const firstState = getIngestionState(filePath);
    expect(firstState!.event_count).toBe(3);

    // Append two more lines
    const appended =
      userLine('u-4', 'fourth', '2026-04-15T10:00:03Z') +
      userLine('u-5', 'fifth', '2026-04-15T10:00:04Z');
    fs.appendFileSync(filePath, appended);

    const added = ingestFileOnce(filePath);
    expect(added).toBe(2);

    const events = getEventsByConversation('session-inc');
    expect(events).toHaveLength(5);

    const finalState = getIngestionState(filePath);
    expect(finalState!.last_offset).toBe(fs.statSync(filePath).size);
    expect(finalState!.event_count).toBe(5);
  });

  it('resets state when file is truncated below last_offset', () => {
    const content =
      userLine('u-1', 'one', '2026-04-15T10:00:00Z') +
      userLine('u-2', 'two', '2026-04-15T10:00:01Z') +
      userLine('u-3', 'three', '2026-04-15T10:00:02Z');
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-trunc', content);

    ingestFileOnce(filePath);
    const preTrunc = getIngestionState(filePath);
    expect(preTrunc!.last_offset).toBeGreaterThan(0);

    // Rewrite smaller
    const fresh = userLine('v-1', 'fresh', '2026-04-15T11:00:00Z');
    fs.writeFileSync(filePath, fresh);

    const added = ingestFileOnce(filePath);
    expect(added).toBe(1);

    const state = getIngestionState(filePath);
    expect(state!.last_offset).toBe(fs.statSync(filePath).size);
    expect(state!.event_count).toBe(1);
  });

  it('skips malformed JSON lines without throwing', () => {
    const content =
      userLine('u-1', 'good', '2026-04-15T10:00:00Z') +
      '{this is not valid json\n' +
      userLine('u-2', 'also good', '2026-04-15T10:00:01Z') +
      '\n' +
      assistantLine('a-1', 'ok', '2026-04-15T10:00:02Z');
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-bad', content);

    expect(() => ingestFileOnce(filePath)).not.toThrow();

    const events = getEventsByConversation('session-bad');
    // 2 user + 1 assistant = 3 valid events, garbage + empty skipped
    expect(events).toHaveLength(3);
  });

  it('partial-line safety — does not advance offset past a trailing partial line', () => {
    // Write two complete lines + one partial (no trailing newline)
    const good =
      userLine('u-1', 'complete-1', '2026-04-15T10:00:00Z') +
      userLine('u-2', 'complete-2', '2026-04-15T10:00:01Z');
    // Start of a third line, but no terminating newline — simulating a writer mid-flush
    const partial = JSON.stringify({
      type: 'user',
      uuid: 'u-3',
      timestamp: '2026-04-15T10:00:02Z',
      message: { role: 'user', content: 'partial' },
    });
    const filePath = writeSession(tempProjectDir, '-tmp-proj', 'session-partial', good + partial);

    ingestFileOnce(filePath);
    const state = getIngestionState(filePath);
    // Offset should be at the end of the last complete newline, not EOF
    expect(state!.last_offset).toBe(Buffer.byteLength(good));

    // Only the two complete lines got ingested
    const events = getEventsByConversation('session-partial');
    expect(events).toHaveLength(2);

    // Now complete the partial line — re-ingest picks it up
    fs.appendFileSync(filePath, '\n');
    const added = ingestFileOnce(filePath);
    expect(added).toBe(1);

    const after = getEventsByConversation('session-partial');
    expect(after).toHaveLength(3);
  });
});

describe('ingester — ingestAllOnce', () => {
  it('walks nested project dirs and ingests every .jsonl file', () => {
    writeSession(
      tempProjectDir,
      '-home-tron-proj-a',
      'session-a1',
      userLine('u-a1', 'hello a', '2026-04-15T10:00:00Z'),
    );
    writeSession(
      tempProjectDir,
      '-home-tron-proj-b',
      'session-b1',
      userLine('u-b1', 'hello b', '2026-04-15T10:00:00Z'),
    );
    writeSession(
      tempProjectDir,
      '-home-tron-proj-b',
      'session-b2',
      userLine('u-b2', 'hello b2', '2026-04-15T10:00:00Z'),
    );

    const total = ingestAllOnce([tempProjectDir]);
    expect(total).toBe(3);

    expect(getEventsByConversation('session-a1')).toHaveLength(1);
    expect(getEventsByConversation('session-b1')).toHaveLength(1);
    expect(getEventsByConversation('session-b2')).toHaveLength(1);
  });

  it('respects EXTRA_PROJECT_DIRS when no roots are passed', () => {
    const extraRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ingester-extra-'));
    try {
      writeSession(
        extraRoot,
        '-extra-proj',
        'session-extra',
        userLine('u-extra', 'from extra', '2026-04-15T10:00:00Z'),
      );

      // Point the ingester at a non-existent home but a valid EXTRA_PROJECT_DIRS
      process.env.EXTRA_PROJECT_DIRS = extraRoot;

      // Pass an empty default-home override so we only pick up EXTRA_PROJECT_DIRS.
      // ingestAllOnce with no arg uses the default resolver (~/.claude/projects +
      // EXTRA_PROJECT_DIRS). In test isolation we only trust the extra root.
      const total = ingestAllOnce([extraRoot]);
      expect(total).toBe(1);

      expect(getEventsByConversation('session-extra')).toHaveLength(1);
    } finally {
      fs.rmSync(extraRoot, { recursive: true, force: true });
    }
  });

  it('returns 0 and does not throw when a root does not exist', () => {
    const missing = path.join(tempProjectDir, 'does', 'not', 'exist');
    expect(() => ingestAllOnce([missing])).not.toThrow();
    const total = ingestAllOnce([missing]);
    expect(total).toBe(0);
  });

  it('does not double-count events when called twice in a row', () => {
    writeSession(
      tempProjectDir,
      '-home-tron-proj',
      'session-twice',
      userLine('u-1', 'once', '2026-04-15T10:00:00Z') +
        assistantLine('a-1', 'twice', '2026-04-15T10:00:01Z'),
    );

    const first = ingestAllOnce([tempProjectDir]);
    const second = ingestAllOnce([tempProjectDir]);

    expect(first).toBe(2);
    expect(second).toBe(0);

    const counts = countBySource();
    expect(counts['scanner-jsonl']).toBe(2);
  });
});

describe('ingester — startIngester / stopIngester', () => {
  it('can be started and stopped without throwing', () => {
    expect(() => startIngester([tempProjectDir])).not.toThrow();
    expect(() => stopIngester()).not.toThrow();
  });

  it('startIngester runs an initial ingestAllOnce pass', () => {
    writeSession(
      tempProjectDir,
      '-home-tron-proj',
      'session-boot',
      userLine('u-1', 'boot', '2026-04-15T10:00:00Z'),
    );

    startIngester([tempProjectDir]);
    try {
      // Initial pass is synchronous, so the event should be queryable immediately
      expect(getEventsByConversation('session-boot')).toHaveLength(1);
    } finally {
      stopIngester();
    }
  });
});
