/**
 * Legacy scanner backend — parses JSONL on every request.
 *
 * This is a PURE EXTRACTION of the existing scanner read pipeline. Every
 * method delegates to the exact same function routes used to call before
 * the backend interface existed (`getCachedSessions`, `parseSessionMessages`,
 * `getSessionCost`, `getCostSummary`, `getSessionCostDetail`). Zero behavior
 * change — if a regression shows up here, it was already in the helper.
 *
 * All the module-level state the callers depended on
 * (`cachedSessions`/`cachedStats` inside `session-scanner.ts`, the parse
 * cache in `session-cache.ts`) stays where it is — we just thread it
 * through the `IScannerBackend` shape. Nothing about startup order, scan
 * lifecycle, or cache invalidation changes with this extraction.
 */

import type {
  SessionData,
  SessionStats,
  CostSummary,
  SessionCostDetail,
  SessionCostData,
} from '../../shared/types';
import type { TimelineMessageType } from '../../shared/session-types';
import type { IScannerBackend, SessionMessagesResult } from './backend';

import { getCachedSessions, getCachedStats } from './session-scanner';
import { parseSessionMessages } from './session-parser';
import { getSessionCost as legacyGetSessionCost } from './session-analytics';
import {
  getCostSummary as legacyGetCostSummary,
  getSessionCostDetail as legacyGetSessionCostDetail,
} from './cost-indexer';

export const legacyBackend: IScannerBackend = {
  name: 'legacy',

  listSessions(): SessionData[] {
    return getCachedSessions();
  },

  getStats(): SessionStats {
    return getCachedStats();
  },

  getSessionById(id: string): SessionData | undefined {
    // Matches the ad-hoc `.find(s => s.id === id)` scattered across routes
    // today. Centralized here so the store backend can swap in an indexed
    // lookup later without the route code caring.
    return getCachedSessions().find((s) => s.id === id);
  },

  getSessionMessages(
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>
  ): SessionMessagesResult {
    // Direct passthrough — `parseSessionMessages` already returns the
    // `{ messages, totalMessages }` shape the interface expects.
    return parseSessionMessages(filePath, offset, limit, types);
  },

  getSessionCost(sessions: SessionData[], sessionId: string): SessionCostData | null {
    return legacyGetSessionCost(sessions, sessionId);
  },

  getCostSummary(days: number): CostSummary {
    return legacyGetCostSummary(days);
  },

  getSessionCostDetail(sessionId: string): SessionCostDetail | null {
    return legacyGetSessionCostDetail(sessionId);
  },
};
