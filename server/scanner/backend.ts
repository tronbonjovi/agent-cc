/**
 * Scanner backend interface.
 *
 * Agent CC's data-read layer for Sessions / Messages / Costs. A background
 * ingester writes JSONL into `interactions.db` once, and route handlers
 * read through this interface against the store.
 *
 * Historically (through M5 Phase 4) a dual-path legacy backend that parsed
 * JSONL on every request lived alongside the store backend, gated by the
 * `SCANNER_BACKEND` env var, so parity could be verified fixture-by-fixture
 * before cutover. Task008 (M5 Phase 5) promoted `store` to the default,
 * and the follow-up cutover deleted `backend-legacy.ts` and the env var
 * entirely. Only one backend now ships.
 */

import type {
  SessionData,
  SessionStats,
  CostSummary,
  SessionCostDetail,
  SessionCostData,
} from '../../shared/types';
import type {
  TimelineMessage,
  TimelineMessageType,
} from '../../shared/session-types';

/** Result shape of `getSessionMessages` — mirrors `parseSessionMessages`. */
export interface SessionMessagesResult {
  messages: TimelineMessage[];
  totalMessages: number;
}

/**
 * The read surface routes call into for scanner-sourced data. Analytics
 * helpers that purely transform a `SessionData[]` list (heatmaps, health,
 * weekly digest, bash knowledge, etc.) stay outside the interface and keep
 * taking whatever `listSessions` returns.
 */
export interface IScannerBackend {
  /** Backend identity — convenient for diagnostics, tests, and logs. */
  readonly name: 'store';

  /**
   * Return the cached session list that powers Sessions list, Costs, and
   * most analytics pages.
   */
  listSessions(): SessionData[];

  /** Session-list aggregate stats (counts + size totals). */
  getStats(): SessionStats;

  /**
   * Single-session lookup by session id. Returns `undefined` when the id
   * is unknown — same contract as `Array.prototype.find`.
   */
  getSessionById(id: string): SessionData | undefined;

  /**
   * Typed, paginated message timeline for a session. `filePath` is the
   * session JSONL path (ignored by the store backend, which looks up by
   * conversation id derived from the basename). `types` filters the seven
   * timeline variants — empty means all.
   */
  getSessionMessages(
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>
  ): SessionMessagesResult;

  /**
   * Per-session cost breakdown (rolled up across every record) used by
   * `GET /api/sessions/:id/costs`. `sessions` is accepted for call-site
   * symmetry with earlier iterations; the store backend ignores it.
   */
  getSessionCost(sessions: SessionData[], sessionId: string): SessionCostData | null;

  /**
   * Cost summary over the last `days` days — drives the Costs tab overview.
   */
  getCostSummary(days: number): CostSummary;

  /**
   * Detailed cost breakdown for a single session — drives the per-session
   * drill-down on the Costs tab.
   */
  getSessionCostDetail(sessionId: string): SessionCostDetail | null;
}

/** Keys of `IScannerBackend` that must be present on every implementation.
 *  Exported for the runtime guard in `tests/scanner-backend.test.ts`. */
export const SCANNER_BACKEND_METHODS: ReadonlyArray<keyof IScannerBackend> = [
  'name',
  'listSessions',
  'getStats',
  'getSessionById',
  'getSessionMessages',
  'getSessionCost',
  'getCostSummary',
  'getSessionCostDetail',
];

import { storeBackend } from './backend-store';

/** Resolve the active scanner backend. There is only one; the factory is
 *  kept so test doubles and future migrations can still intercept it. */
export function getScannerBackend(): IScannerBackend {
  return storeBackend;
}
