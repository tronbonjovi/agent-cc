/**
 * Tests for the JSONL-backed IScannerBackend implementation.
 *
 * This backend reads from JSONL parsers + session cache instead of SQLite.
 * It replaces the store-backed backend (backend-store.ts) as part of the
 * chat-scanner-unification milestone (M8 task001).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { TimelineMessageType } from '../shared/session-types';

// Fixtures live in tests/fixtures/jsonl-samples/
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'jsonl-samples');

// ---------------------------------------------------------------------------
// Helpers — build a fake project dir with JSONL fixtures so scanAllSessions
// can discover them without touching the real ~/.claude/projects/
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpProjectDir(sessionFiles: Record<string, string>): string {
  const projectDir = path.join(tmpDir, 'projects', 'test-project');
  fs.mkdirSync(projectDir, { recursive: true });
  for (const [name, content] of Object.entries(sessionFiles)) {
    fs.writeFileSync(path.join(projectDir, name), content, 'utf-8');
  }
  return tmpDir;
}

// ---------------------------------------------------------------------------
// Module-level mocks — redirect the scanner to our tmp dir instead of
// the real ~/.claude/ so tests are hermetic.
// ---------------------------------------------------------------------------

vi.mock('../server/scanner/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/scanner/utils')>();
  return {
    ...original,
    get CLAUDE_DIR() {
      return tmpDir;
    },
    dirExists: (p: string) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    fileExists: (p: string) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
    normPath: (...parts: string[]) => path.join(...parts),
  };
});

// Mock subagent discovery to return empty — fixture files don't have subagents
vi.mock('../server/scanner/subagent-discovery', () => ({
  discoverSubagents: () => [],
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JSONL scanner backend (IScannerBackend)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-backend-test-'));
    fs.mkdirSync(path.join(tmpDir, 'projects'), { recursive: true });
  });

  afterEach(() => {
    // Invalidate session-scanner caches between tests
    try {
      const { sessionParseCache } = require('../server/scanner/session-cache');
      sessionParseCache.invalidateAll();
    } catch {}
    // Clean up analytics cache
    try {
      const { invalidateAnalyticsCache } = require('../server/scanner/session-analytics');
      invalidateAnalyticsCache();
    } catch {}

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function getBackend() {
    const { getScannerBackend } = await import('../server/scanner/backend');
    return getScannerBackend();
  }

  /** Seed the scanner by running scanAllSessions (populates the module cache) */
  async function seedSessions(sessionFiles: Record<string, string>) {
    createTmpProjectDir(sessionFiles);
    const { scanAllSessions } = await import('../server/scanner/session-scanner');
    return scanAllSessions();
  }

  const multiTurnContent = fs.readFileSync(
    path.join(FIXTURES_DIR, 'multi-turn.jsonl'),
    'utf-8',
  );
  const assistantOnlyContent = fs.readFileSync(
    path.join(FIXTURES_DIR, 'assistant-only.jsonl'),
    'utf-8',
  );

  // ----- listSessions -----

  describe('listSessions()', () => {
    it('returns SessionData[] with correct fields from parsed JSONL', async () => {
      await seedSessions({ 'session-a.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();

      expect(sessions.length).toBe(1);
      const s = sessions[0];
      expect(s.id).toBe('session-a');
      expect(s.filePath).toContain('session-a.jsonl');
      expect(s.projectKey).toBe('test-project');
      expect(s.firstTs).toBeTruthy();
      expect(s.lastTs).toBeTruthy();
      expect(s.messageCount).toBeGreaterThan(0);
    });

    it('returns empty array when no sessions exist', async () => {
      createTmpProjectDir({});
      const { scanAllSessions } = await import('../server/scanner/session-scanner');
      scanAllSessions();
      const backend = await getBackend();
      expect(backend.listSessions()).toEqual([]);
    });

    it('returns multiple sessions sorted newest-first', async () => {
      await seedSessions({
        'session-old.jsonl': assistantOnlyContent, // 09:00
        'session-new.jsonl': multiTurnContent,     // 12:00
      });
      const backend = await getBackend();
      const sessions = backend.listSessions();
      expect(sessions.length).toBe(2);
      // multi-turn has later timestamps, should come first
      expect(sessions[0].id).toBe('session-new');
      expect(sessions[1].id).toBe('session-old');
    });
  });

  // ----- getStats -----

  describe('getStats()', () => {
    it('returns correct aggregate stats', async () => {
      await seedSessions({
        'session-a.jsonl': multiTurnContent,
        'session-b.jsonl': assistantOnlyContent,
      });
      const backend = await getBackend();
      const stats = backend.getStats();

      expect(stats.totalCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      // assistant-only has only 1 message, should be counted as empty
      expect(stats.emptyCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ----- getSessionById -----

  describe('getSessionById()', () => {
    it('returns correct session for known id', async () => {
      await seedSessions({ 'session-abc.jsonl': multiTurnContent });
      const backend = await getBackend();
      const session = backend.getSessionById('session-abc');

      expect(session).toBeDefined();
      expect(session!.id).toBe('session-abc');
      expect(session!.filePath).toContain('session-abc.jsonl');
    });

    it('returns undefined for nonexistent id', async () => {
      await seedSessions({ 'session-abc.jsonl': multiTurnContent });
      const backend = await getBackend();
      expect(backend.getSessionById('nonexistent')).toBeUndefined();
    });
  });

  // ----- getSessionMessages -----

  describe('getSessionMessages()', () => {
    it('returns paginated TimelineMessage[] from parsed JSONL', async () => {
      await seedSessions({ 'session-msg.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();
      const filePath = sessions[0].filePath;

      const result = backend.getSessionMessages(filePath, 0, 100);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.totalMessages).toBe(result.messages.length);

      // multi-turn has user_text, assistant_text, tool_call, tool_result
      const types = new Set(result.messages.map(m => m.type));
      expect(types.has('user_text')).toBe(true);
      expect(types.has('assistant_text')).toBe(true);
      expect(types.has('tool_call')).toBe(true);
      expect(types.has('tool_result')).toBe(true);
    });

    it('respects offset and limit', async () => {
      await seedSessions({ 'session-msg.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();
      const filePath = sessions[0].filePath;

      const all = backend.getSessionMessages(filePath, 0, 100);
      expect(all.totalMessages).toBeGreaterThan(2);

      const page = backend.getSessionMessages(filePath, 1, 2);
      expect(page.messages.length).toBeLessThanOrEqual(2);
      expect(page.totalMessages).toBe(all.totalMessages);
    });

    it('filters by type when types set is provided', async () => {
      await seedSessions({ 'session-msg.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();
      const filePath = sessions[0].filePath;

      const types: Set<TimelineMessageType> = new Set(['tool_call']);
      const result = backend.getSessionMessages(filePath, 0, 100, types);
      for (const m of result.messages) {
        expect(m.type).toBe('tool_call');
      }
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('returns empty for nonexistent file path', async () => {
      await seedSessions({ 'session-msg.jsonl': multiTurnContent });
      const backend = await getBackend();
      const result = backend.getSessionMessages('/nonexistent/path.jsonl', 0, 100);
      expect(result.messages).toEqual([]);
      expect(result.totalMessages).toBe(0);
    });
  });

  // ----- getSessionCost -----

  describe('getSessionCost()', () => {
    it('returns per-session cost breakdown', async () => {
      await seedSessions({ 'session-cost.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();

      const cost = backend.getSessionCost(sessions, 'session-cost');
      expect(cost).not.toBeNull();
      expect(cost!.sessionId).toBe('session-cost');
      expect(cost!.inputTokens).toBeGreaterThan(0);
      expect(cost!.outputTokens).toBeGreaterThan(0);
      expect(cost!.estimatedCostUsd).toBeGreaterThan(0);
      expect(cost!.models.length).toBeGreaterThan(0);
      expect(Object.keys(cost!.modelBreakdown).length).toBeGreaterThan(0);
    });

    it('returns null for nonexistent session', async () => {
      await seedSessions({ 'session-cost.jsonl': multiTurnContent });
      const backend = await getBackend();
      const sessions = backend.listSessions();
      expect(backend.getSessionCost(sessions, 'nonexistent')).toBeNull();
    });
  });

  // ----- getCostSummary -----

  describe('getCostSummary()', () => {
    it('returns windowed cost summary with correct shape', async () => {
      await seedSessions({ 'session-cs.jsonl': multiTurnContent });
      const backend = await getBackend();

      const summary = backend.getCostSummary(30);
      expect(summary).toBeDefined();
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
      expect(summary.totalTokens).toBeDefined();
      expect(summary.byModel).toBeDefined();
      expect(summary.byDay).toBeDefined();
      expect(summary.topSessions).toBeDefined();
      expect(summary.weeklyComparison).toBeDefined();
      expect(summary.planLimits).toBeDefined();
      expect(summary.bySource).toBeDefined();
      expect(summary.countBySource).toBeDefined();
    });
  });

  // ----- getSessionCostDetail -----

  describe('getSessionCostDetail()', () => {
    it('returns detailed cost breakdown for a session', async () => {
      await seedSessions({ 'session-det.jsonl': multiTurnContent });
      const backend = await getBackend();

      const detail = backend.getSessionCostDetail('session-det');
      expect(detail).not.toBeNull();
      expect(detail!.sessionId).toBe('session-det');
      expect(detail!.totalCost).toBeGreaterThanOrEqual(0);
      expect(detail!.directCost).toBeGreaterThanOrEqual(0);
      expect(detail!.directTokens).toBeDefined();
      expect(detail!.ratesApplied).toBeDefined();
    });

    it('returns null for nonexistent session', async () => {
      await seedSessions({ 'session-det.jsonl': multiTurnContent });
      const backend = await getBackend();
      expect(backend.getSessionCostDetail('nonexistent')).toBeNull();
    });
  });

  // ----- Interface completeness -----

  describe('interface compliance', () => {
    it('implements all IScannerBackend methods', async () => {
      const backend = await getBackend();
      const { SCANNER_BACKEND_METHODS } = await import('../server/scanner/backend');
      for (const method of SCANNER_BACKEND_METHODS) {
        expect(backend).toHaveProperty(method);
      }
    });

    it('has name "jsonl"', async () => {
      const backend = await getBackend();
      expect(backend.name).toBe('jsonl');
    });
  });

  // ----- No SQLite imports -----

  describe('no SQLite dependency', () => {
    it('backend.ts does not import from backend-store', async () => {
      const backendSource = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'scanner', 'backend.ts'),
        'utf-8',
      );
      expect(backendSource).not.toContain("from './backend-store'");
      expect(backendSource).not.toContain('from "./backend-store"');
      expect(backendSource).not.toContain("require('./backend-store')");
      expect(backendSource).not.toContain('require("./backend-store")');
    });

    it('backend.ts does not import from interactions-repo', async () => {
      const backendSource = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'scanner', 'backend.ts'),
        'utf-8',
      );
      expect(backendSource).not.toContain('interactions-repo');
    });

    it('backend.ts does not import from event-reductions', async () => {
      const backendSource = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'scanner', 'backend.ts'),
        'utf-8',
      );
      expect(backendSource).not.toContain('event-reductions');
    });
  });
});
