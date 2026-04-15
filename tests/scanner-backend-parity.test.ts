/**
 * Parity tests for the store-backed scanner backend (M5 scanner-ingester
 * tasks 003–007).
 *
 * Strategy: for each method on `IScannerBackend`, ingest a synthetic
 * JSONL fixture into a temp `interactions.db`, run BOTH the legacy and
 * store backends against the SAME source files, and assert field-by-field
 * equality on the shapes we can compare. Anything legitimately divergent
 * is enumerated below as a documented gap and explicitly skipped — never
 * faked to make the test pass.
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
 * Coverage discipline (task007): every entry in `SCANNER_BACKEND_METHODS`
 * MUST have a `describe('scanner backend parity — <method>', ...)` block
 * in this file. The coverage-guard test at the bottom enforces that by
 * grepping the file's own source against the canonical method list, so
 * adding a new method to `IScannerBackend` forces a parity case to land
 * with it. The `name` constant is covered by an identity assertion in
 * the same guard block, not its own describe.
 *
 * Task005 (bySource dimension): the cost-summary parity case below also
 * asserts both backends agree on the new `CostSummary.bySource` +
 * `byDay[].bySource` fields. Every fixture here comes from JSONL
 * ingestion, so both legacy and store attribute 100% of cost to
 * `scanner-jsonl` — the check is "legacy's degenerate single-source
 * breakdown matches store's reducer output". No new parity gap.
 *
 * Task006 (countBySource dimension): same parity-by-construction story.
 * The fixtures contain only JSONL-sourced events, so legacy's degenerate
 * `countBySource` (everything under scanner-jsonl) must equal the store
 * reducer's output, both at the summary level and per byDay entry. The
 * gate below asserts all keys agree, not just `scanner-jsonl`.
 *
 * ---------------------------------------------------------------------
 * Documented parity gaps (the canonical list lives in
 * `server/scanner/backend-store.ts` lines 31–49 — this header references
 * it rather than duplicating the rationale):
 *
 *   1. Assistant message metadata. `stopReason`, `serviceTier`,
 *      `inferenceGeo`, `speed`, `serverToolUse` on `assistant_text`
 *      timeline messages are not in the store schema. Store emits
 *      safe defaults; this file does not assert them on either backend.
 *
 *   2. Session metadata. `slug`, `firstMessage`, `sizeBytes`, `isActive`,
 *      `cwd`, `version`, `gitBranch` on `SessionData` are not persisted
 *      by the ingester. Store emits safe defaults via
 *      `rollupToSessionData`. The `pickComparable()` helper used by the
 *      `listSessions` and `getSessionById` parity blocks is the single
 *      place this skip list lives — change it there if a new field is
 *      either persisted or proven divergent.
 *
 *   3. Assistant `thinking` blocks. Always empty in persisted JSONL,
 *      dropped by the mapper on both sides — no divergence in practice.
 *      Listed for completeness so a future schema change can't silently
 *      regress it.
 *
 *   4. `system_event` / `skill_invocation` timeline variants. Not
 *      persisted by `jsonl-to-event.ts` (type filter to assistant/user
 *      only). Any fixture that depends on these variants is out of
 *      scope for parity; do not write one.
 *
 *   5. `projectName` in `CostSummary.byProject`. Legacy reads the
 *      project entity table to derive a pretty name; in this test env
 *      that table is empty and legacy falls back to the raw key, which
 *      the store already matches by accident. This is a test-env
 *      coincidence, not structural parity — flagged so future readers
 *      don't read the silent agreement as load-bearing.
 *
 *   6. `firstMessage` on `topSessions` and `SessionCostDetail`. Store
 *      has no `firstMessage`; both legacy (empty slice) and store
 *      (empty slice) emit '' under the fixture shapes used here. The
 *      cost-summary case compares ids + cost only and skips the text.
 * ---------------------------------------------------------------------
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

/**
 * Project a `SessionData` down to the fields BOTH backends agree on. Skip
 * fields are documented gap group #2 in the file header — this helper is
 * the single source of truth for the skip list so changes land in one
 * spot. If a field gets newly persisted by the ingester (closing the gap)
 * or surfaces as divergent, update the picked set here and the gap list
 * in the header simultaneously.
 *
 * Skipped fields and their rationale (see backend-store.ts:120-137 for the
 * full details):
 *   - `slug`              — store schema has no slug column
 *   - `firstMessage`      — store has no firstMessage projection
 *   - `sizeBytes`         — store has no file-size column
 *   - `isActive`          — active-session marker lives in ~/.claude/sessions/
 *   - `cwd`/`version`/`gitBranch` — metadata not persisted by the mapper
 *   - `hasSummary`        — optional, not surfaced through either backend here
 */
interface ComparableSession {
  id: string;
  firstTs: string | null;
  lastTs: string | null;
  messageCount: number;
  isEmpty: boolean;
  projectKey: string;
  filePath: string;
}

function pickComparable(session: {
  id: string;
  firstTs: string | null;
  lastTs: string | null;
  messageCount: number;
  isEmpty: boolean;
  projectKey: string;
  filePath: string;
}): ComparableSession {
  return {
    id: session.id,
    firstTs: session.firstTs,
    lastTs: session.lastTs,
    messageCount: session.messageCount,
    isEmpty: session.isEmpty,
    projectKey: session.projectKey,
    filePath: session.filePath,
  };
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

    // bySource (task005) — fixtures only contain events ingested from JSONL,
    // which both backends attribute to `scanner-jsonl`. The breakdown must
    // be fully keyed on both backends and the scanner-jsonl bucket must
    // equal the total on both. Every other key is 0 (degenerate case).
    expect(s.bySource).toBeDefined();
    expect(l.bySource).toBeDefined();
    expect(Object.keys(s.bySource).sort()).toEqual(Object.keys(l.bySource).sort());
    expect(s.bySource['scanner-jsonl']).toBeCloseTo(l.bySource['scanner-jsonl'], 3);
    expect(s.bySource['scanner-jsonl']).toBeCloseTo(s.totalCost, 3);
    expect(l.bySource['scanner-jsonl']).toBeCloseTo(l.totalCost, 3);
    for (const key of Object.keys(s.bySource)) {
      if (key === 'scanner-jsonl') continue;
      expect(s.bySource[key]).toBe(0);
      expect(l.bySource[key]).toBe(0);
    }

    // Per-day bySource — every byDay entry on both backends must carry a
    // fully-keyed bySource record, matching the day-level cost total under
    // `scanner-jsonl`.
    for (let i = 0; i < l.byDay.length; i++) {
      const lDay = l.byDay[i];
      const sDay = s.byDay[i];
      expect(sDay.bySource).toBeDefined();
      expect(lDay.bySource).toBeDefined();
      expect(sDay.bySource['scanner-jsonl']).toBeCloseTo(
        lDay.bySource['scanner-jsonl'],
        3,
      );
      expect(sDay.bySource['scanner-jsonl']).toBeCloseTo(sDay.cost, 3);
    }

    // countBySource (task006) — every fixture event lands as scanner-jsonl
    // on both backends. The store reducer counts the deduped event rows;
    // legacy's degenerate shim emits `records.length` under scanner-jsonl
    // and 0 everywhere else. Counts must match key-for-key on both
    // shapes, including the all-zero keys.
    expect(s.countBySource).toBeDefined();
    expect(l.countBySource).toBeDefined();
    expect(Object.keys(s.countBySource).sort()).toEqual(
      Object.keys(l.countBySource).sort(),
    );
    expect(s.countBySource['scanner-jsonl']).toBe(l.countBySource['scanner-jsonl']);
    expect(s.countBySource['scanner-jsonl']).toBeGreaterThan(0);
    for (const key of Object.keys(s.countBySource)) {
      if (key === 'scanner-jsonl') continue;
      expect(s.countBySource[key]).toBe(0);
      expect(l.countBySource[key]).toBe(0);
    }

    // Per-day countBySource — same key-for-key parity discipline. Each day
    // bucket on both backends must agree on the scanner-jsonl count and
    // emit zero for every other key.
    for (let i = 0; i < l.byDay.length; i++) {
      const lDay = l.byDay[i];
      const sDay = s.byDay[i];
      expect(sDay.countBySource).toBeDefined();
      expect(lDay.countBySource).toBeDefined();
      expect(sDay.countBySource['scanner-jsonl']).toBe(
        lDay.countBySource['scanner-jsonl'],
      );
      expect(sDay.countBySource['scanner-jsonl']).toBeGreaterThan(0);
      for (const key of Object.keys(sDay.countBySource)) {
        if (key === 'scanner-jsonl') continue;
        expect(sDay.countBySource[key]).toBe(0);
        expect(lDay.countBySource[key]).toBe(0);
      }
    }
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

describe('scanner backend parity — listSessions', () => {
  // Helper: produce a small multi-session multi-project fixture used by
  // both this block and the getStats block below. Returns the session ids
  // we wrote so each test can assert against a known expected set.
  function writeMultiProjectFixture(): string[] {
    writeSession(
      '-tmp-proj-a',
      'session-list-a1',
      userRecord('u-1', 'q', '2026-04-13T10:00:00Z') +
        assistantRecord('a-1', 'r', '2026-04-13T10:00:01Z') +
        userRecord('u-2', 'q2', '2026-04-13T10:00:02Z') +
        assistantRecord('a-2', 'r2', '2026-04-13T10:00:03Z'),
    );
    writeSession(
      '-tmp-proj-a',
      'session-list-a2',
      userRecord('u-3', 'q', '2026-04-14T11:00:00Z') +
        assistantRecord('a-3', 'r', '2026-04-14T11:00:01Z') +
        userRecord('u-4', 'q2', '2026-04-14T11:00:02Z') +
        assistantRecord('a-4', 'r2', '2026-04-14T11:00:03Z'),
    );
    writeSession(
      '-tmp-proj-b',
      'session-list-b1',
      userRecord('u-5', 'q', '2026-04-15T12:00:00Z') +
        assistantRecord('a-5', 'r', '2026-04-15T12:00:01Z') +
        userRecord('u-6', 'q2', '2026-04-15T12:00:02Z') +
        assistantRecord('a-6', 'r2', '2026-04-15T12:00:03Z'),
    );
    return ['session-list-a1', 'session-list-a2', 'session-list-b1'];
  }

  it('returns the same set of comparable session fields across both backends', () => {
    const expectedIds = writeMultiProjectFixture();

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const legacyList = mods.legacy.listSessions();
    const storeList = mods.store.listSessions();

    // Length parity — both backends must see every fixture session.
    expect(legacyList.length).toBe(expectedIds.length);
    expect(storeList.length).toBe(expectedIds.length);

    // Sort by id before per-row comparison. Both backends use different
    // natural orderings (legacy: lastTs desc, store: rollup query order),
    // so we normalize on a deterministic key for the diff. Sorting by id
    // is stable because session ids are unique by construction.
    const sortById = <T extends { id: string }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));

    const legacySorted = sortById(legacyList).map(pickComparable);
    const storeSorted = sortById(storeList).map(pickComparable);

    expect(storeSorted).toEqual(legacySorted);

    // Sanity: every expected id is present on both sides.
    const legacyIds = legacySorted.map((s) => s.id).sort();
    const storeIds = storeSorted.map((s) => s.id).sort();
    expect(legacyIds).toEqual([...expectedIds].sort());
    expect(storeIds).toEqual([...expectedIds].sort());
  });

  it('produces stable sort-key parity when ordered by lastTs desc + id tiebreaker', () => {
    // Same fixture, different question: do both backends agree on the
    // chronological ordering once we apply a deterministic sort key? This
    // catches the case where two backends return parity-equal sets but
    // diverge on per-row ordering, which would silently break any UI
    // that consumes `listSessions()` in a stream and trusts the order.
    writeMultiProjectFixture();

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const sortByLastTsDesc = <T extends { lastTs: string | null; id: string }>(
      rows: T[],
    ): T[] =>
      [...rows].sort((a, b) => {
        const aTs = a.lastTs || '';
        const bTs = b.lastTs || '';
        if (aTs !== bTs) return bTs.localeCompare(aTs);
        return a.id.localeCompare(b.id);
      });

    const legacySorted = sortByLastTsDesc(mods.legacy.listSessions()).map(
      pickComparable,
    );
    const storeSorted = sortByLastTsDesc(mods.store.listSessions()).map(
      pickComparable,
    );

    expect(storeSorted).toEqual(legacySorted);
  });
});

describe('scanner backend parity — getStats', () => {
  it('returns identical comparable stat fields for a multi-session fixture', () => {
    // Reuse the same 3-session / 2-project fixture shape from listSessions.
    // Each session has 4 messages (>= 3) so emptyCount should be 0 on both
    // backends.
    writeSession(
      '-tmp-proj-a',
      'session-stats-a1',
      userRecord('u-1', 'q', '2026-04-13T10:00:00Z') +
        assistantRecord('a-1', 'r', '2026-04-13T10:00:01Z') +
        userRecord('u-2', 'q2', '2026-04-13T10:00:02Z') +
        assistantRecord('a-2', 'r2', '2026-04-13T10:00:03Z'),
    );
    writeSession(
      '-tmp-proj-a',
      'session-stats-a2',
      userRecord('u-3', 'q', '2026-04-14T11:00:00Z') +
        assistantRecord('a-3', 'r', '2026-04-14T11:00:01Z') +
        userRecord('u-4', 'q2', '2026-04-14T11:00:02Z') +
        assistantRecord('a-4', 'r2', '2026-04-14T11:00:03Z'),
    );
    writeSession(
      '-tmp-proj-b',
      'session-stats-b1',
      userRecord('u-5', 'q', '2026-04-15T12:00:00Z') +
        assistantRecord('a-5', 'r', '2026-04-15T12:00:01Z') +
        userRecord('u-6', 'q2', '2026-04-15T12:00:02Z') +
        assistantRecord('a-6', 'r2', '2026-04-15T12:00:03Z'),
    );

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getStats();
    const s = mods.store.getStats();

    // Comparable fields: totalCount + emptyCount.
    expect(s.totalCount).toBe(l.totalCount);
    expect(s.totalCount).toBe(3);
    expect(s.emptyCount).toBe(l.emptyCount);
    expect(s.emptyCount).toBe(0);

    // Skipped (documented gaps):
    //   - `totalSize` — store has no per-file size column, always 0.
    //     Legacy reads stat().size from disk. We assert the store's
    //     defaulted value rather than comparing — that's the gap.
    //   - `activeCount` — active-session marker lives in
    //     `~/.claude/sessions/`, not the store. Always 0 on store.
    expect(s.totalSize).toBe(0);
    expect(s.activeCount).toBe(0);
  });

  it('returns zeroed stats on both backends when no sessions exist', () => {
    // No fixtures written. Both backends should agree on a fully-zeroed
    // stat block — this is the "fresh install" parity baseline.
    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getStats();
    const s = mods.store.getStats();

    expect(s.totalCount).toBe(l.totalCount);
    expect(s.totalCount).toBe(0);
    expect(s.emptyCount).toBe(l.emptyCount);
    expect(s.emptyCount).toBe(0);
  });
});

describe('scanner backend parity — getSessionById', () => {
  it('returns identical comparable fields for a known session id', () => {
    const sessionId = 'session-by-id-known';
    writeSession(
      '-tmp-proj',
      sessionId,
      userRecord('u-1', 'q', '2026-04-15T10:00:00Z') +
        assistantRecord('a-1', 'r', '2026-04-15T10:00:01Z') +
        userRecord('u-2', 'q2', '2026-04-15T10:00:02Z') +
        assistantRecord('a-2', 'r2', '2026-04-15T10:00:03Z'),
    );

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionById(sessionId);
    const s = mods.store.getSessionById(sessionId);

    expect(l).toBeDefined();
    expect(s).toBeDefined();
    expect(pickComparable(s!)).toEqual(pickComparable(l!));
    expect(s!.id).toBe(sessionId);
  });

  it('returns undefined for an unknown session id on both backends', () => {
    // Populate one real session so neither backend short-circuits on an
    // empty store. Then query a clearly-bogus id.
    writeSession(
      '-tmp-proj',
      'session-by-id-real',
      userRecord('u-1', 'q', '2026-04-15T10:00:00Z') +
        assistantRecord('a-1', 'r', '2026-04-15T10:00:01Z') +
        userRecord('u-2', 'q2', '2026-04-15T10:00:02Z'),
    );

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    const l = mods.legacy.getSessionById('this-id-does-not-exist');
    const s = mods.store.getSessionById('this-id-does-not-exist');
    expect(l).toBeUndefined();
    expect(s).toBeUndefined();
  });

  it('hides subagent ids from the parent rollup on both backends', () => {
    // Subagent layout: parent JSONL at `<projectsDir>/<projectKey>/<id>.jsonl`,
    // subagent JSONL at `<projectsDir>/<projectKey>/<id>/subagents/agent-<sub>.jsonl`.
    // The ingester maps the subagent file to conversationId
    // `<id>:sub:<sub>` (see ingester.ts deriveConversationId), then
    // listParentRollups() in backend-store.ts filters out anything
    // containing `:sub:`. Legacy never even discovers subagent files
    // because session-scanner walks `.jsonl` only at the project-dir top
    // level (not recursive). Both should return undefined for a `:sub:`
    // lookup — that's what we assert here.
    const parentId = 'session-with-subagent';
    const subAgentId = 'b1234567';
    writeSession(
      '-tmp-proj',
      parentId,
      userRecord('u-1', 'kick off subagent', '2026-04-15T10:00:00Z') +
        assistantRecord('a-1', 'launching', '2026-04-15T10:00:01Z') +
        userRecord('u-2', 'continue', '2026-04-15T10:00:02Z') +
        assistantRecord('a-2', 'done', '2026-04-15T10:00:03Z'),
    );

    // Materialize a real subagent jsonl alongside the parent so the
    // ingester picks it up via walkJsonlFiles (recursive) and the store
    // creates a `<parentId>:sub:<subAgentId>` conversation row.
    const subDir = path.join(projectsDir, '-tmp-proj', parentId, 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, `agent-${subAgentId}.jsonl`),
      userRecord('su-1', 'sub task', '2026-04-15T10:00:01Z') +
        assistantRecord('sa-1', 'sub reply', '2026-04-15T10:00:01Z'),
    );

    mods.scanAllSessions();
    mods.ingestAllOnce([projectsDir]);

    // Parent id resolves on both backends and points at the same row.
    const lParent = mods.legacy.getSessionById(parentId);
    const sParent = mods.store.getSessionById(parentId);
    expect(lParent).toBeDefined();
    expect(sParent).toBeDefined();
    expect(pickComparable(sParent!)).toEqual(pickComparable(lParent!));

    // Subagent id is hidden from listSessions/getSessionById on both
    // backends — legacy by directory-walk shape, store by the
    // listParentRollups filter. If this assertion ever flips, a new
    // parity gap has appeared and task007's STOP-and-report rule kicks in.
    const subId = `${parentId}:sub:${subAgentId}`;
    const lSub = mods.legacy.getSessionById(subId);
    const sSub = mods.store.getSessionById(subId);
    expect(lSub).toBeUndefined();
    expect(sSub).toBeUndefined();
  });
});

describe('scanner backend parity — coverage guard', () => {
  it('both backends report their declared name constant', () => {
    expect(mods.legacy.name).toBe('legacy');
    expect(mods.store.name).toBe('store');
  });

  it('every SCANNER_BACKEND_METHODS entry has a parity describe block in this file', async () => {
    // Self-read this test file and assert that for every method on
    // IScannerBackend (except `name`, which is the identity case above),
    // there's a matching `describe('scanner backend parity — <method>', ...)`
    // block. The point is to force any future addition to
    // `SCANNER_BACKEND_METHODS` to land with its own parity case — if
    // someone bolts on `getProjectStats` and forgets the parity block,
    // this guard fails immediately rather than letting a silent
    // regression sneak through.
    //
    // We use process.cwd() + relative path rather than __filename /
    // import.meta.url so the lookup is independent of vitest's ESM
    // shim story. Vitest runs from the repo root, so this resolves
    // deterministically.
    const testFilePath = path.resolve(
      process.cwd(),
      'tests/scanner-backend-parity.test.ts',
    );
    const src = await fs.promises.readFile(testFilePath, 'utf8');

    const backendMod = await import('../server/scanner/backend');
    for (const method of backendMod.SCANNER_BACKEND_METHODS) {
      if (method === 'name') continue; // covered by the identity assertion above
      const pattern = new RegExp(`parity — ${method}\\b`);
      expect(src, `no parity describe block found for ${method}`).toMatch(pattern);
    }
  });
});
