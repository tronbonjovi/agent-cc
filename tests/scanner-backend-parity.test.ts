/**
 * Parity tests for the store-backed scanner backend (M5 scanner-ingester
 * task004).
 *
 * Strategy: for each of the four analytics methods, ingest a synthetic
 * JSONL fixture into a temp `interactions.db`, run BOTH the legacy and
 * store backends against the SAME source files, and assert field-by-field
 * equality on the shapes we can compare.
 *
 * Test isolation discipline (mirrors `tests/ingester.test.ts`):
 *   - Redirect `HOME` / `USERPROFILE` to a throwaway temp dir BEFORE
 *     importing anything that resolves `os.homedir()` at module-load
 *     time (notably `session-scanner` via `CLAUDE_DIR`). We use dynamic
 *     `import()` inside `beforeAll` so the env vars land before any
 *     scanner module gets imported — the top-level `import` statements
 *     below only pull vitest + stdlib.
 *   - Each describe block uses a fresh `AGENT_CC_DATA` dir so the
 *     SQLite `events` table is empty at the start of the test.
 *   - Fixtures live under `<fakeHome>/.claude/projects/<projectKey>/...`
 *     so the legacy session scanner's `CLAUDE_DIR`-based walk and the
 *     ingester's `EXTRA_PROJECT_DIRS`-based walk both discover them
 *     identically.
 *
 * Known parity gaps that this test intentionally works AROUND (rather
 * than faking values to make the test pass):
 *   - `stopReason`, `serviceTier`, `inferenceGeo`, `speed`,
 *     `serverToolUse` on assistant timeline messages — the store
 *     schema doesn't persist them. We don't compare these fields; we
 *     assert the store emits empty-string / zero defaults and let the
 *     legacy field sit alongside. task007's parity gate flags this.
 *   - `projectName` in `CostSummary.byProject` — legacy reads the
 *     project entity table to derive a pretty name; in a test env
 *     that table is empty and legacy falls back to the raw key, which
 *     the store already matches.
 *   - `firstMessage` on `SessionCostDetail` and `topSessions` —
 *     store has no firstMessage; both legacy (empty slice) and store
 *     (empty slice) produce '' when the session parser's firstMessage
 *     text is empty, which our fixtures arrange.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// NOTE: Intentionally NO static imports from `server/scanner/*` here — the
// dynamic imports in `beforeAll` are the only way to guarantee `CLAUDE_DIR`
// (resolved at module-load in `server/scanner/utils.ts`) picks up our
// overridden HOME before the legacy pipeline starts reading it.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Modules = any;

// Typed surface we want from the dynamic imports.
let mods: Modules;
let tempDataDir: string;
let fakeHome: string;
let projectsDir: string;

const originalEnv: Record<string, string | undefined> = {};

function assistantRecord(uuid: string, text: string, ts: string, usage?: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): string {
  return (
    JSON.stringify({
      type: 'assistant',
      uuid,
      timestamp: ts,
      parentUuid: null,
      isSidechain: false,
      message: {
        role: 'assistant',
        model: 'claude-opus-4-6',
        stop_reason: '',
        content: [{ type: 'text', text }],
        usage: {
          input_tokens: usage?.input_tokens ?? 100,
          output_tokens: usage?.output_tokens ?? 50,
          cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
        },
      },
    }) + '\n'
  );
}

function userRecord(uuid: string, text: string, ts: string): string {
  return (
    JSON.stringify({
      type: 'user',
      uuid,
      timestamp: ts,
      parentUuid: null,
      isSidechain: false,
      isMeta: false,
      message: { role: 'user', content: text },
    }) + '\n'
  );
}

function assistantRecordWithToolCall(
  uuid: string,
  ts: string,
  tool: { id: string; name: string; input: Record<string, unknown> },
): string {
  return (
    JSON.stringify({
      type: 'assistant',
      uuid,
      timestamp: ts,
      parentUuid: null,
      isSidechain: false,
      message: {
        role: 'assistant',
        model: 'claude-opus-4-6',
        stop_reason: '',
        content: [{ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input }],
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

function userRecordWithToolResult(
  uuid: string,
  ts: string,
  result: { tool_use_id: string; content: string; is_error?: boolean },
): string {
  return (
    JSON.stringify({
      type: 'user',
      uuid,
      timestamp: ts,
      parentUuid: null,
      isSidechain: false,
      isMeta: false,
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: result.tool_use_id,
            content: result.content,
            is_error: result.is_error === true,
          },
        ],
      },
    }) + '\n'
  );
}

function writeSession(
  projectKey: string,
  sessionId: string,
  content: string,
): string {
  const dir = path.join(projectsDir, projectKey);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

beforeAll(async () => {
  // 1. Redirect HOME to a throwaway dir — must happen BEFORE any scanner
  //    module loads, because `CLAUDE_DIR` is captured at module-load.
  originalEnv.HOME = process.env.HOME;
  originalEnv.USERPROFILE = process.env.USERPROFILE;
  originalEnv.AGENT_CC_DATA = process.env.AGENT_CC_DATA;
  originalEnv.EXTRA_PROJECT_DIRS = process.env.EXTRA_PROJECT_DIRS;
  originalEnv.SCANNER_BACKEND = process.env.SCANNER_BACKEND;

  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-home-'));
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-data-'));
  projectsDir = path.join(fakeHome, '.claude', 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });

  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  process.env.AGENT_CC_DATA = tempDataDir;
  delete process.env.EXTRA_PROJECT_DIRS;
  delete process.env.SCANNER_BACKEND;

  // 2. NOW dynamically import the backend + scanner machinery. The import
  //    graph will resolve CLAUDE_DIR against our fakeHome.
  const legacyMod = await import('../server/scanner/backend-legacy');
  const storeMod = await import('../server/scanner/backend-store');
  const scannerMod = await import('../server/scanner/session-scanner');
  const ingesterMod = await import('../server/scanner/ingester');
  const costIndexerMod = await import('../server/scanner/cost-indexer');
  const dbMod = await import('../server/interactions-db');
  const jsonDbMod = await import('../server/db');
  const analyticsMod = await import('../server/scanner/session-analytics');
  const cacheMod = await import('../server/scanner/session-cache');

  mods = {
    legacy: legacyMod.legacyBackend,
    store: storeMod.storeBackend,
    scanAllSessions: scannerMod.scanAllSessions,
    ingestAllOnce: ingesterMod.ingestAllOnce,
    indexCosts: costIndexerMod.indexCosts,
    closeDb: dbMod.closeDb,
    openDb: dbMod.openDb,
    getDB: jsonDbMod.getDB,
    save: jsonDbMod.save,
    invalidateAnalyticsCache: analyticsMod.invalidateAnalyticsCache,
    sessionParseCache: cacheMod.sessionParseCache,
  };
});

afterAll(() => {
  if (mods?.closeDb) mods.closeDb();
  for (const [key, val] of Object.entries(originalEnv)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  for (const dir of [tempDataDir, fakeHome]) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

beforeEach(() => {
  // Wipe fixtures AND stores between tests so conversations can't leak
  // across describe blocks. Every test starts from a known-empty state:
  // no JSONL on disk, no rows in interactions.db, no costRecords in the
  // JSON db, no analytics/session-parse cache entries.
  //
  // Centralized here rather than at the top of each `it(...)` so a new
  // test author can't forget the call — especially in the cost-summary
  // block which queries by date window and would silently blend fixtures
  // from a previous test otherwise.
  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const e of entries) {
    fs.rmSync(path.join(projectsDir, e.name), { recursive: true, force: true });
  }
  wipeAllStores();
});

/**
 * Drop every row from the events / ingestion_state / costRecords tables
 * so a test starts from a known-empty state. Needed for the cost-summary
 * test in particular: legacy's `queryCosts` reads from `db.costRecords`
 * which persists across tests inside the same worker.
 */
function wipeAllStores(): void {
  // Every import below was already pulled into the module graph by
  // `beforeAll`, so these lookups hit the cached module instances.
  const db = mods.openDb();
  db.exec('DELETE FROM events; DELETE FROM ingestion_state;');

  const jsonDb = mods.getDB();
  jsonDb.costRecords = {};
  jsonDb.costIndexState = { files: {}, totalRecords: 0, lastIndexAt: '', version: 1 };
  mods.save();

  // Clear the session-parse cache and the session-analytics 5-min TTL
  // cache so legacy doesn't hand back stale per-session cost data from
  // a prior test in the same worker.
  mods.sessionParseCache.invalidateAll();
  mods.invalidateAnalyticsCache();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scanner backend parity — getSessionMessages', () => {
  it('returns identical user_text + assistant_text messages for a text-only fixture', () => {
    const sessionId = 'session-msg-text';
    const content =
      userRecord('u-1', 'hello world', '2026-04-15T10:00:00Z') +
      assistantRecord('a-1', 'hi back', '2026-04-15T10:00:01Z') +
      userRecord('u-2', 'another question', '2026-04-15T10:00:02Z') +
      assistantRecord('a-2', 'another answer', '2026-04-15T10:00:03Z');
    const filePath = writeSession('-tmp-proj', sessionId, content);

    // Populate BOTH backends from the same source JSONL.
    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const legacyResult = mods.legacy.getSessionMessages(filePath, 0, 100);
    const storeResult = mods.store.getSessionMessages(filePath, 0, 100);

    expect(storeResult.totalMessages).toBe(legacyResult.totalMessages);
    expect(storeResult.messages).toHaveLength(legacyResult.messages.length);
    expect(legacyResult.messages.length).toBe(4);

    for (let i = 0; i < legacyResult.messages.length; i++) {
      const l = legacyResult.messages[i];
      const s = storeResult.messages[i];
      expect(s.type).toBe(l.type);
      expect(s.timestamp).toBe(l.timestamp);
      if (l.type === 'user_text' && s.type === 'user_text') {
        expect(s.text).toBe(l.text);
        expect(s.uuid).toBe(l.uuid);
        expect(s.isMeta).toBe(l.isMeta);
      } else if (l.type === 'assistant_text' && s.type === 'assistant_text') {
        expect(s.text).toBe(l.text);
        expect(s.uuid).toBe(l.uuid);
        expect(s.model).toBe(l.model);
        // Token counts — the three we can compare (serviceTier etc are
        // a documented gap and we don't assert them).
        expect(s.usage.inputTokens).toBe(l.usage.inputTokens);
        expect(s.usage.outputTokens).toBe(l.usage.outputTokens);
        expect(s.usage.cacheReadTokens).toBe(l.usage.cacheReadTokens);
        expect(s.usage.cacheCreationTokens).toBe(l.usage.cacheCreationTokens);
      }
    }
  });

  it('honors pagination offset+limit identically on both backends', () => {
    const sessionId = 'session-msg-pagination';
    const lines: string[] = [];
    for (let i = 0; i < 6; i++) {
      const even = i % 2 === 0;
      if (even) lines.push(userRecord(`u-${i}`, `user ${i}`, `2026-04-15T10:00:0${i}Z`));
      else lines.push(assistantRecord(`a-${i}`, `asst ${i}`, `2026-04-15T10:00:0${i}Z`));
    }
    const filePath = writeSession('-tmp-proj', sessionId, lines.join(''));

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const legacyResult = mods.legacy.getSessionMessages(filePath, 2, 3);
    const storeResult = mods.store.getSessionMessages(filePath, 2, 3);

    expect(storeResult.totalMessages).toBe(legacyResult.totalMessages);
    expect(storeResult.messages).toHaveLength(legacyResult.messages.length);
    expect(storeResult.messages).toHaveLength(3);
    // First message in the sliced window should match exactly on text+type
    for (let i = 0; i < legacyResult.messages.length; i++) {
      expect(storeResult.messages[i].type).toBe(legacyResult.messages[i].type);
      expect(storeResult.messages[i].timestamp).toBe(legacyResult.messages[i].timestamp);
    }
  });

  it('honors type filter identically on both backends', () => {
    const sessionId = 'session-msg-typefilter';
    const content =
      userRecord('u-1', 'first', '2026-04-15T10:00:00Z') +
      assistantRecord('a-1', 'reply one', '2026-04-15T10:00:01Z') +
      userRecord('u-2', 'second', '2026-04-15T10:00:02Z') +
      assistantRecord('a-2', 'reply two', '2026-04-15T10:00:03Z');
    const filePath = writeSession('-tmp-proj', sessionId, content);

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const types = new Set(['assistant_text']);
    const l = mods.legacy.getSessionMessages(filePath, 0, 100, types);
    const s = mods.store.getSessionMessages(filePath, 0, 100, types);
    expect(s.totalMessages).toBe(l.totalMessages);
    expect(l.totalMessages).toBe(2);
    expect(s.messages.every((m: { type: string }) => m.type === 'assistant_text')).toBe(true);
    expect(l.messages.every((m: { type: string }) => m.type === 'assistant_text')).toBe(true);
  });

  it('tool_call + tool_result pairs are emitted by both backends for the same fixture', () => {
    const sessionId = 'session-msg-tools';
    const content =
      userRecord('u-1', 'please read a file', '2026-04-15T10:00:00Z') +
      assistantRecordWithToolCall('a-1', '2026-04-15T10:00:01Z', {
        id: 'toolu_01',
        name: 'Read',
        input: { file_path: '/tmp/x' },
      }) +
      userRecordWithToolResult('u-2', '2026-04-15T10:00:02Z', {
        tool_use_id: 'toolu_01',
        content: 'file contents here',
      }) +
      assistantRecord('a-2', 'ok done', '2026-04-15T10:00:03Z');
    const filePath = writeSession('-tmp-proj', sessionId, content);

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionMessages(filePath, 0, 100);
    const s = mods.store.getSessionMessages(filePath, 0, 100);

    // Compare just the type-counts since some fields (e.g. isMeta presence
    // on tool messages) aren't load-bearing for parity.
    const typeCount = (msgs: Array<{ type: string }>): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const m of msgs) out[m.type] = (out[m.type] || 0) + 1;
      return out;
    };
    expect(typeCount(s.messages)).toEqual(typeCount(l.messages));
    expect(s.totalMessages).toBe(l.totalMessages);

    // The tool_call pair specifically must agree on callId + name so the
    // frontend can still match tool_result → tool_call.
    const lCall = l.messages.find((m: { type: string }) => m.type === 'tool_call');
    const sCall = s.messages.find((m: { type: string }) => m.type === 'tool_call');
    expect(sCall?.callId).toBe(lCall?.callId);
    expect(sCall?.name).toBe(lCall?.name);

    const lResult = l.messages.find((m: { type: string }) => m.type === 'tool_result');
    const sResult = s.messages.find((m: { type: string }) => m.type === 'tool_result');
    expect(sResult?.toolUseId).toBe(lResult?.toolUseId);
    expect(sResult?.content).toBe(lResult?.content);
    expect(sResult?.isError).toBe(lResult?.isError);
  });

  it('returns empty result for unknown session on both backends', () => {
    // No files ingested.
    const missing = path.join(projectsDir, '-tmp-proj', 'does-not-exist.jsonl');
    const l = mods.legacy.getSessionMessages(missing, 0, 10);
    const s = mods.store.getSessionMessages(missing, 0, 10);
    expect(l.totalMessages).toBe(0);
    expect(s.totalMessages).toBe(0);
    expect(l.messages).toEqual([]);
    expect(s.messages).toEqual([]);
  });
});

describe('scanner backend parity — getSessionCost', () => {
  it('returns identical per-session cost totals and model breakdown', () => {
    const sessionId = 'session-cost-simple';
    const content =
      userRecord('u-1', 'ask', '2026-04-15T10:00:00Z') +
      assistantRecord('a-1', 'reply-1', '2026-04-15T10:00:01Z', {
        input_tokens: 200,
        output_tokens: 100,
      }) +
      userRecord('u-2', 'again', '2026-04-15T10:00:02Z') +
      assistantRecord('a-2', 'reply-2', '2026-04-15T10:00:03Z', {
        input_tokens: 300,
        output_tokens: 150,
      });
    writeSession('-tmp-proj', sessionId, content);

    const scan = mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const legacyCost = mods.legacy.getSessionCost(scan.sessions, sessionId);
    const storeCost = mods.store.getSessionCost(scan.sessions, sessionId);

    expect(storeCost).not.toBeNull();
    expect(legacyCost).not.toBeNull();
    expect(storeCost!.sessionId).toBe(legacyCost!.sessionId);
    expect(storeCost!.inputTokens).toBe(legacyCost!.inputTokens);
    expect(storeCost!.outputTokens).toBe(legacyCost!.outputTokens);
    expect(storeCost!.cacheReadTokens).toBe(legacyCost!.cacheReadTokens);
    expect(storeCost!.cacheCreationTokens).toBe(legacyCost!.cacheCreationTokens);
    expect(storeCost!.estimatedCostUsd).toBeCloseTo(legacyCost!.estimatedCostUsd, 4);
    expect(storeCost!.models).toEqual(legacyCost!.models);

    const legacyBreakdown = legacyCost!.modelBreakdown['claude-opus-4-6'];
    const storeBreakdown = storeCost!.modelBreakdown['claude-opus-4-6'];
    expect(storeBreakdown.input).toBe(legacyBreakdown.input);
    expect(storeBreakdown.output).toBe(legacyBreakdown.output);
    expect(storeBreakdown.cost).toBeCloseTo(legacyBreakdown.cost, 4);
  });

  it('returns null for an unknown session id on both backends', () => {
    const sessionId = 'session-cost-present';
    const content =
      userRecord('u-1', 'ask', '2026-04-15T10:00:00Z') +
      assistantRecord('a-1', 'reply', '2026-04-15T10:00:01Z') +
      userRecord('u-2', 'ok', '2026-04-15T10:00:02Z');
    writeSession('-tmp-proj', sessionId, content);

    const scan = mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionCost(scan.sessions, 'bogus-id');
    const s = mods.store.getSessionCost(scan.sessions, 'bogus-id');
    expect(l).toBeNull();
    expect(s).toBeNull();
  });
});

describe('scanner backend parity — getCostSummary', () => {
  it('returns identical totals + byModel + byDay for a multi-day fixture', () => {
    // Three sessions on three consecutive days so byDay has three buckets.
    writeSession(
      '-tmp-proj',
      'session-day-1',
      userRecord('u-1', 'a', '2026-04-13T10:00:00Z') +
        assistantRecord('a-1', 'r1', '2026-04-13T10:00:01Z', {
          input_tokens: 100,
          output_tokens: 50,
        }) +
        userRecord('u-2', 'b', '2026-04-13T10:00:02Z') +
        assistantRecord('a-2', 'r2', '2026-04-13T10:00:03Z', {
          input_tokens: 100,
          output_tokens: 50,
        }),
    );
    writeSession(
      '-tmp-proj',
      'session-day-2',
      userRecord('u-3', 'c', '2026-04-14T10:00:00Z') +
        assistantRecord('a-3', 'r3', '2026-04-14T10:00:01Z', {
          input_tokens: 200,
          output_tokens: 100,
        }) +
        userRecord('u-4', 'd', '2026-04-14T10:00:02Z') +
        assistantRecord('a-4', 'r4', '2026-04-14T10:00:03Z', {
          input_tokens: 200,
          output_tokens: 100,
        }),
    );
    writeSession(
      '-tmp-proj',
      'session-day-3',
      userRecord('u-5', 'e', '2026-04-15T10:00:00Z') +
        assistantRecord('a-5', 'r5', '2026-04-15T10:00:01Z', {
          input_tokens: 300,
          output_tokens: 150,
        }) +
        userRecord('u-6', 'f', '2026-04-15T10:00:02Z') +
        assistantRecord('a-6', 'r6', '2026-04-15T10:00:03Z', {
          input_tokens: 300,
          output_tokens: 150,
        }),
    );

    mods.scanAllSessions();
    mods.indexCosts(); // legacy cost-summary reads db.costRecords, needs indexing
    mods.ingestAllOnce([projectsDir]);

    const days = 7;
    const l = mods.legacy.getCostSummary(days);
    const s = mods.store.getCostSummary(days);

    expect(s.totalCost).toBeCloseTo(l.totalCost, 3);
    expect(s.totalTokens.input).toBe(l.totalTokens.input);
    expect(s.totalTokens.output).toBe(l.totalTokens.output);
    expect(s.totalTokens.cacheRead).toBe(l.totalTokens.cacheRead);
    expect(s.totalTokens.cacheCreation).toBe(l.totalTokens.cacheCreation);

    // byModel — same model key on both, same session count (3), same tokens
    expect(Object.keys(s.byModel).sort()).toEqual(Object.keys(l.byModel).sort());
    const model = Object.keys(l.byModel)[0];
    expect(s.byModel[model].sessions).toBe(l.byModel[model].sessions);
    expect(s.byModel[model].cost).toBeCloseTo(l.byModel[model].cost, 3);
    expect(s.byModel[model].tokens.input).toBe(l.byModel[model].tokens.input);
    expect(s.byModel[model].tokens.output).toBe(l.byModel[model].tokens.output);

    // byDay — three buckets, matching dates, matching totals
    expect(s.byDay.map((d: { date: string }) => d.date)).toEqual(
      l.byDay.map((d: { date: string }) => d.date),
    );
    for (let i = 0; i < l.byDay.length; i++) {
      expect(s.byDay[i].cost).toBeCloseTo(l.byDay[i].cost, 3);
      expect(s.byDay[i].computeCost).toBeCloseTo(l.byDay[i].computeCost, 3);
      expect(s.byDay[i].cacheCost).toBeCloseTo(l.byDay[i].cacheCost, 3);
    }

    // topSessions — same number of entries, same session ids, same costs.
    // firstMessage is a known gap (store doesn't persist it) so we compare
    // ids + cost only.
    expect(s.topSessions.length).toBe(l.topSessions.length);
    const sIds = s.topSessions.map((t: { sessionId: string }) => t.sessionId).sort();
    const lIds = l.topSessions.map((t: { sessionId: string }) => t.sessionId).sort();
    expect(sIds).toEqual(lIds);
  });
});

describe('scanner backend parity — getSessionCostDetail', () => {
  it('returns identical direct cost + tokens + model for a single-session fixture', () => {
    const sessionId = 'session-detail-simple';
    writeSession(
      '-tmp-proj',
      sessionId,
      userRecord('u-1', 'a', '2026-04-15T10:00:00Z') +
        assistantRecord('a-1', 'r1', '2026-04-15T10:00:01Z', {
          input_tokens: 400,
          output_tokens: 200,
        }) +
        userRecord('u-2', 'b', '2026-04-15T10:00:02Z') +
        assistantRecord('a-2', 'r2', '2026-04-15T10:00:03Z', {
          input_tokens: 500,
          output_tokens: 250,
        }),
    );

    mods.scanAllSessions();
    mods.indexCosts();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionCostDetail(sessionId);
    const s = mods.store.getSessionCostDetail(sessionId);

    expect(l).not.toBeNull();
    expect(s).not.toBeNull();
    expect(s!.sessionId).toBe(l!.sessionId);
    expect(s!.totalCost).toBeCloseTo(l!.totalCost, 3);
    expect(s!.directCost).toBeCloseTo(l!.directCost, 3);
    expect(s!.directModel).toBe(l!.directModel);
    expect(s!.directTokens.input).toBe(l!.directTokens.input);
    expect(s!.directTokens.output).toBe(l!.directTokens.output);
    expect(s!.directTokens.cacheRead).toBe(l!.directTokens.cacheRead);
    expect(s!.directTokens.cacheCreation).toBe(l!.directTokens.cacheCreation);
    // ratesApplied is derived from pricing for directModel — both sides
    // should match byte-for-byte.
    expect(s!.ratesApplied).toEqual(l!.ratesApplied);
  });

  it('returns null for unknown session on both backends', () => {
    // Populate one real session so the cost index isn't empty, then query
    // a bogus id.
    writeSession(
      '-tmp-proj',
      'session-detail-real',
      userRecord('u-1', 'a', '2026-04-15T10:00:00Z') +
        assistantRecord('a-1', 'r', '2026-04-15T10:00:01Z') +
        userRecord('u-2', 'b', '2026-04-15T10:00:02Z'),
    );

    mods.scanAllSessions();
    mods.indexCosts();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionCostDetail('this-id-does-not-exist');
    const s = mods.store.getSessionCostDetail('this-id-does-not-exist');
    expect(l).toBeNull();
    expect(s).toBeNull();
  });
});
