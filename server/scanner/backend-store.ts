/**
 * Store-backed scanner backend — queries `interactions.db` via
 * `interactions-repo` instead of re-parsing JSONL on every request.
 *
 * Scope at task003:
 *   - `listSessions`, `getStats`, `getSessionById` are implemented from
 *     the `listConversationRollups` helper added to `interactions-repo`.
 *     Enough to drive the Sessions list UI when the flag is flipped.
 *   - `getSessionMessages`, `getSessionCost`, `getCostSummary`, and
 *     `getSessionCostDetail` are intentionally stubbed and throw a
 *     distinctive error. The parity gate (task007) will exercise every
 *     method; anything still throwing at that point is a known gap and
 *     either:
 *       (a) gets a real implementation in task007's follow-up, or
 *       (b) widens `InteractionEvent.metadata` in a dedicated task before
 *           task008 can promote `SCANNER_BACKEND=store` to the default.
 *
 * The legacy backend stays the default throughout M5 — any user setting
 * `SCANNER_BACKEND=store` today is opting into incomplete parity and
 * should expect the stubs below to surface on unsupported pages.
 *
 * Design notes:
 *   - `listConversations` from `interactions-repo` groups by
 *     `conversation_id`; session ids and conversation ids are 1:1 for
 *     parent sessions but subagents carry `<sessionId>:sub:<agentId>`
 *     as their conversationId (see ingester task002). We filter those
 *     out of the session listing so the Sessions page doesn't double-
 *     count.
 *   - `SessionData` fields we can populate from rollups: `id`, `firstTs`,
 *     `lastTs`, `messageCount`, and a reconstructed `filePath` from the
 *     sample metadata. Fields we can't (today) populate accurately:
 *     `slug`, `firstMessage`, `sizeBytes`, `isActive`, `projectKey`,
 *     `cwd`, `version`, `gitBranch`. Those get safe defaults so the
 *     response shape stays byte-compatible, but task007 will catch the
 *     content divergence.
 */

import path from 'path';
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
import type { IScannerBackend, SessionMessagesResult } from './backend';
import {
  listConversationRollups,
  type ConversationRollupRow,
} from '../interactions-repo';

/** Subagent conversationIds carry this separator (see ingester task002). */
const SUBAGENT_ID_SEPARATOR = ':sub:';

/** Distinctive error thrown by unsupported methods — the parity gate
 *  (task007) greps for this prefix to enumerate remaining gaps. */
const PARITY_GAP_PREFIX = 'backend-store: parity gap';

function parityGap(method: string, detail: string): Error {
  return new Error(
    `${PARITY_GAP_PREFIX} — ${method}: ${detail} — see task007 parity gate`
  );
}

/**
 * Reconstruct a `SessionData` from a store rollup. Populates what the
 * store actually has; uses safe defaults for everything else so the
 * response shape matches `SessionData` on the wire. The parity gate
 * (task007) is responsible for catching meaningful divergences from the
 * legacy values.
 */
function rollupToSessionData(rollup: ConversationRollupRow): SessionData {
  // Derive projectKey from the sessionPath when possible. The JSONL layout
  // is `.../<encoded-project>/<sessionId>.jsonl`, so the parent dir name is
  // the encoded project key — matches what the legacy scanner uses.
  let projectKey = '';
  let filePath = '';
  if (rollup.sessionPath) {
    filePath = rollup.sessionPath.replace(/\\/g, '/');
    projectKey = path.basename(path.dirname(filePath));
  }

  return {
    id: rollup.conversationId,
    slug: '', // legacy derives this from parsed meta; not in store schema
    firstMessage: '', // ditto
    firstTs: rollup.firstEvent,
    lastTs: rollup.lastEvent,
    messageCount: rollup.eventCount,
    sizeBytes: 0, // legacy stats the file; store has no file-size column
    isEmpty: rollup.eventCount < 3,
    isActive: false, // active-session marker lives in ~/.claude/sessions/, not the store
    filePath,
    projectKey,
    cwd: '',
    version: '',
    gitBranch: '',
  };
}

function listParentRollups(): ConversationRollupRow[] {
  return listConversationRollups().filter(
    (r) => !r.conversationId.includes(SUBAGENT_ID_SEPARATOR)
  );
}

export const storeBackend: IScannerBackend = {
  name: 'store',

  listSessions(): SessionData[] {
    return listParentRollups().map(rollupToSessionData);
  },

  getStats(): SessionStats {
    const parents = listParentRollups();
    // `isActive` and `isEmpty` shortcuts here mirror what legacy computes
    // from the full `SessionData` list — keep them aligned when the
    // `rollupToSessionData` defaults above change.
    return {
      totalCount: parents.length,
      totalSize: 0, // no file-size info in the store
      activeCount: 0, // no active-session signal in the store
      emptyCount: parents.filter((r) => r.eventCount < 3).length,
    };
  },

  getSessionById(id: string): SessionData | undefined {
    const hit = listParentRollups().find((r) => r.conversationId === id);
    return hit ? rollupToSessionData(hit) : undefined;
  },

  getSessionMessages(
    _filePath: string,
    _offset: number,
    _limit: number,
    _types?: Set<TimelineMessageType>
  ): SessionMessagesResult {
    throw parityGap(
      'getSessionMessages',
      'store has InteractionEvent rows but not TimelineMessage reconstruction (7 variants w/ tool-call/result pairing and tree ancestry)'
    );
  },

  getSessionCost(
    _sessions: SessionData[],
    _sessionId: string
  ): SessionCostData | null {
    throw parityGap(
      'getSessionCost',
      'per-model token breakdown requires parsing cost_json across every event and grouping by InteractionCost.model'
    );
  },

  getCostSummary(_days: number): CostSummary {
    throw parityGap(
      'getCostSummary',
      'day-by-day bucketing + top-model breakdown not yet composed from interactions-repo'
    );
  },

  getSessionCostDetail(_sessionId: string): SessionCostDetail | null {
    throw parityGap(
      'getSessionCostDetail',
      'per-session model drill-down requires the same per-model aggregation as getSessionCost'
    );
  },
};

/** Exported for tests and for the parity gate to introspect which
 *  methods still throw the distinctive error string. */
export { PARITY_GAP_PREFIX };

// Unused-suppression — `TimelineMessage` is imported purely for the type
// position in `SessionMessagesResult`'s return shape; TS elides it at
// runtime but we still want the import line visible so future
// implementers can trace the type chain from this file.
export type _TimelineMessageRef = TimelineMessage;
