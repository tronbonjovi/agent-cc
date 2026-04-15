/**
 * Scanner backend interface (M5 scanner-ingester task003).
 *
 * Agent CC's data-read layer for Sessions / Messages / Costs historically
 * parsed JSONL directly on every request. Milestone 5 inverts that: a
 * background ingester writes JSONL into `interactions.db` once, and route
 * handlers read through a single backend interface with two implementations
 * sitting behind it:
 *
 *   - `backend-legacy.ts`  — the original "parse JSONL on every request"
 *                            pipeline, lifted behind this interface with
 *                            zero behavior change.
 *   - `backend-store.ts`   — queries the `events` table via
 *                            `interactions-repo.ts`.
 *
 * Only one is active at a time. The active implementation is selected by the
 * `SCANNER_BACKEND` env var (values: `legacy` | `store`, default `legacy`).
 * During M5 the default stays `legacy` until task008 promotes `store` after
 * parity tests (task007) sign off.
 *
 * This module intentionally contains ZERO logic beyond the factory — keeping
 * the interface and the selector in one file makes it trivial to grep for
 * every method the routes need to bridge during the migration.
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
 * The read surface routes call into for scanner-sourced data. Any future
 * data-read helper that could reasonably swap from JSONL-parse to
 * store-query lives here; analytics helpers that purely transform a
 * `SessionData[]` list (heatmaps, health, weekly digest, bash knowledge,
 * etc.) stay outside the interface and keep taking whatever `listSessions`
 * returns — they don't care which backend produced it.
 */
export interface IScannerBackend {
  /** Backend identity — convenient for diagnostics, tests, and logs. */
  readonly name: 'legacy' | 'store';

  /**
   * Return the cached session list that powers Sessions list, Costs, and
   * most analytics pages. Legacy: module-level `cachedSessions`. Store:
   * grouped query against `events`.
   */
  listSessions(): SessionData[];

  /**
   * Session-list aggregate stats (counts + size totals). Legacy: module
   * cache. Store: recomputed from the store.
   */
  getStats(): SessionStats;

  /**
   * Single-session lookup by session id. Returns `undefined` when the id
   * is unknown — same contract as `Array.prototype.find`.
   */
  getSessionById(id: string): SessionData | undefined;

  /**
   * Typed, paginated message timeline for a session. `filePath` is the
   * session JSONL path (legacy reads it directly; store ignores it and
   * uses conversation-id lookups keyed by session id derived from the
   * basename). `types` filters the seven timeline variants — empty means
   * all.
   */
  getSessionMessages(
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>
  ): SessionMessagesResult;

  /**
   * Per-session cost breakdown (rolled up across every record) used by
   * `GET /api/sessions/:id/costs`. `sessions` is passed because the
   * legacy helper needs the pre-resolved list to match the session by
   * id — the store backend ignores it.
   */
  getSessionCost(sessions: SessionData[], sessionId: string): SessionCostData | null;

  /**
   * Cost summary over the last `days` days — drives the Costs tab
   * overview. Legacy: cost-indexer read. Store: aggregate query.
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

import { legacyBackend } from './backend-legacy';
import { storeBackend } from './backend-store';

/**
 * Resolve the active scanner backend from `SCANNER_BACKEND`. Unknown or
 * missing values fall back to `legacy` so an accidental typo doesn't
 * silently flip production onto an experimental path.
 *
 * Intentionally NOT memoized — tests flip the env var between calls, and
 * the lookup is just an env-var read. If that ever becomes a hot-path
 * concern, memoize against the string value so a mid-process env change
 * still takes effect.
 *
 * Both implementations are imported statically rather than lazy-required
 * so vitest's `vi.mock(...)` hoisting sees the full dependency graph at
 * module-load time — any test that mocks `scanner/session-scanner` or
 * `scanner/cost-indexer` transparently intercepts calls made through
 * the legacy backend without extra wiring. If the store backend ever
 * grows a heavyweight startup (e.g. opening the sqlite file on import),
 * move its import back behind a lazy loader.
 */
export function getScannerBackend(): IScannerBackend {
  const raw = process.env.SCANNER_BACKEND?.toLowerCase().trim();
  if (raw === 'store') return storeBackend;
  return legacyBackend;
}
