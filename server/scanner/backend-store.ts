/**
 * Store-backed scanner backend — queries `interactions.db` via
 * `interactions-repo` instead of re-parsing JSONL on every request.
 *
 * Scope at task004 (this file's current state):
 *   - `listSessions`, `getStats`, `getSessionById` (task003) are implemented
 *     from `listConversationRollups`.
 *   - `getSessionMessages`, `getSessionCost`, `getCostSummary`, and
 *     `getSessionCostDetail` are now implemented via `event-reductions.ts`
 *     + the per-session `listEventsBySessionId` and windowed
 *     `listEventsBetween` repo helpers added in task004. `getCostSummary`
 *     uses two bounded range queries (days-window + 30-day rollup) so it
 *     never pulls the full `events` table into memory.
 *
 * Task005 adds a `bySource: Record<InteractionSource, number>` breakdown
 * on `CostSummary` (both summary-level and per-day). Store backend groups
 * events by `event.source` in `reduceCostSummary`; legacy backend emits a
 * degenerate single-key `scanner-jsonl` breakdown (its `CostRecord` rows
 * don't carry a source). Both shapes are fully keyed over every
 * `InteractionSource` variant — no new parity gap introduced.
 *
 * Parity with legacy is within the store's recordable surface:
 *   - Cost / token / model-breakdown reductions match legacy's
 *     `getSessionCost` / `getCostSummary` / `getSessionCostDetail` on
 *     fixtures that only use assistant text + tool_use + user tool_result
 *     blocks (the three shapes the JSONL mapper records as events).
 *   - `getSessionMessages` produces the same `user_text` / `assistant_text`
 *     / `tool_call` / `tool_result` timeline variants for the same inputs,
 *     with legitimate gaps called out inline below:
 *       - `thinking` blocks are always empty in persisted JSONL — dropped.
 *       - `system_event` / `skill_invocation` records are not persisted
 *         by the current mapper (jsonl-to-event.ts skips type !== assistant/user),
 *         so any fixture that depends on those variants would fail
 *         parity — task007 flags this as a known gap.
 *       - `stopReason` on assistant_text is always '' from the store
 *         because `InteractionCost` doesn't carry it.
 *
 * The legacy backend stays the default throughout M5 — any user setting
 * `SCANNER_BACKEND=store` today is opting into the gaps above; task008
 * only promotes the default once those are either closed or documented.
 *
 * Design notes (from task003, still current):
 *   - `listConversations` groups by `conversation_id`; sessions and
 *     conversations are 1:1 for parents but subagents carry
 *     `<sessionId>:sub:<agentId>`. `listParentRollups` filters sidechains
 *     out of the session listing; the cost + message queries explicitly
 *     pull BOTH via `listEventsBySessionId` so subagent events still roll
 *     up into their parent's totals.
 *   - `SessionData` fields we can't populate from rollups (`slug`,
 *     `firstMessage`, `sizeBytes`, `isActive`, `cwd`, `version`,
 *     `gitBranch`) keep their safe defaults — task007's parity gate
 *     catches the divergence and task008 decides whether to widen the
 *     ingester's metadata.
 */

import path from 'path';
import type {
  SessionData,
  SessionStats,
  CostSummary,
  SessionCostDetail,
  SessionCostData,
  InteractionEvent,
  TextContent,
  ToolCallContent,
  ToolResultContent,
} from '../../shared/types';
import type {
  TimelineMessage,
  TimelineMessageType,
  TokenUsage,
} from '../../shared/session-types';
import type { IScannerBackend, SessionMessagesResult } from './backend';
import {
  listConversationRollups,
  listEventsBySessionId,
  listEventsBetween,
  type ConversationRollupRow,
} from '../interactions-repo';
import {
  reduceSessionCost,
  reduceSessionCostDetail,
  reduceCostSummary,
} from './event-reductions';

/** Subagent conversationIds carry this separator (see ingester task002). */
const SUBAGENT_ID_SEPARATOR = ':sub:';

/** Distinctive error thrown by any future unsupported methods — the
 *  parity gate (task007) greps for this prefix. After task004 every
 *  method on the store backend is implemented, but keep the constant
 *  exported so a regression would still show the expected string. */
const PARITY_GAP_PREFIX = 'backend-store: parity gap';

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
    filePath: string,
    offset: number,
    limit: number,
    types?: Set<TimelineMessageType>
  ): SessionMessagesResult {
    // Session id is the JSONL basename — matches the ingester's
    // `conversationId = basename(filePath, '.jsonl')` convention so the
    // store lookup keys line up without needing the filesystem.
    const sessionId = deriveSessionIdFromFilePath(filePath);
    if (!sessionId) return { messages: [], totalMessages: 0 };

    const events = listEventsBySessionId(sessionId);

    // Map each InteractionEvent to its corresponding TimelineMessage
    // variant. One event yields at most one message (the JSONL mapper
    // already split multi-block assistant records into one event per
    // block, so we don't need a second fan-out here).
    const messages: TimelineMessage[] = [];
    for (const e of events) {
      const msg = eventToTimelineMessage(e);
      if (msg) messages.push(msg);
    }

    // Sort chronologically — parent + sidechain ids interleave by
    // timestamp, matching what `parseSessionMessages` does for the
    // legacy path. ISO-8601 strings sort lexicographically.
    messages.sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return 0;
    });

    const filtered = types ? messages.filter((m) => types.has(m.type)) : messages;
    const totalMessages = filtered.length;
    const sliced = filtered.slice(offset, offset + limit);
    return { messages: sliced, totalMessages };
  },

  getSessionCost(
    _sessions: SessionData[],
    sessionId: string
  ): SessionCostData | null {
    // Legacy's `getSessionCost` takes the sessions list only to match
    // the id against a pre-cached map; we look up events directly and
    // ignore `_sessions` (the interface carries it for legacy shape
    // compatibility). Returns null when no cost-bearing events exist,
    // matching legacy's "no entry in cachedSessionCosts" behavior.
    const events = listEventsBySessionId(sessionId);
    return reduceSessionCost(events, sessionId);
  },

  getCostSummary(days: number): CostSummary {
    // Two BOUNDED range queries: one for the days-window (totals /
    // breakdowns / byModel / byDay / topSessions) and one for the
    // extended 30-day window (weeklyComparison + monthlyTotalCost).
    //
    // The extended query deliberately caps at 30 days even though the
    // reducer's weekly comparison only looks at the last 14 days — 30d
    // is the widest window either rollup needs, so a single query
    // feeds both. Critically, this avoids `listAllEvents()` and its
    // unbounded full-table scan on every Costs page request: on a
    // user db with months of history we'd otherwise pull everything
    // just to compute a 7-day comparison.
    //
    // The reducer (`reduceCostSummary`) already date-filters its
    // "extended" input by ISO string comparison, so passing a pre-
    // windowed 30-day slice produces the same weeklyComparison /
    // monthlyTotalCost values it would on the full history — anything
    // older than 30 days contributes zero to either rollup anyway.
    const now = new Date();
    const endIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyAgoIso = thirtyAgo.toISOString();

    const windowEvents = listEventsBetween(cutoffIso, endIso);
    const extendedEvents = listEventsBetween(thirtyAgoIso, endIso);
    return reduceCostSummary(windowEvents, extendedEvents);
  },

  getSessionCostDetail(sessionId: string): SessionCostDetail | null {
    const events = listEventsBySessionId(sessionId);
    if (events.length === 0) return null;
    // firstMessage isn't in the store schema — pass an empty string and
    // the reducer slices it to the same `.slice(0, 200)` legacy applies.
    // task007 will flag the mismatch if any UI reads this field.
    return reduceSessionCostDetail(events, sessionId, '');
  },
};

// ---------------------------------------------------------------------------
// Helpers — InteractionEvent → TimelineMessage
// ---------------------------------------------------------------------------

/**
 * Derive the session id from a session JSONL path. Matches the ingester's
 * `conversationId = basename(filePath, '.jsonl')` convention.
 */
function deriveSessionIdFromFilePath(filePath: string): string {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized);
  return base.replace(/\.jsonl$/, '');
}

/**
 * Build an empty `TokenUsage` — store events don't carry all the fields
 * the legacy parser sets (serviceTier, inferenceGeo, speed, serverToolUse).
 * Those are absent from `InteractionCost`, so the store backend always
 * returns empty strings / zeroed web-tool counts. For parity-testable
 * fixtures this matches what legacy returns when the JSONL usage block
 * omits those fields (the common case).
 */
function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    serviceTier: '',
    inferenceGeo: '',
    speed: '',
    serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
  };
}

function usageFromCost(event: InteractionEvent): TokenUsage {
  const usage = emptyUsage();
  if (event.cost === null) return usage;
  usage.inputTokens = event.cost.tokensIn || 0;
  usage.outputTokens = event.cost.tokensOut || 0;
  usage.cacheReadTokens = event.cost.cacheReadTokens || 0;
  usage.cacheCreationTokens = event.cost.cacheCreationTokens || 0;
  return usage;
}

/**
 * Map one `InteractionEvent` to the TimelineMessage variant it represents.
 * Returns null for events the store doesn't have a timeline variant for
 * (e.g. deterministic system events that the mapper currently drops).
 *
 * The `uuid` on the timeline message is the source JSONL record's uuid,
 * pulled from `metadata.sourceUuid` that the ingester stamps on every
 * event. When the metadata is missing we fall back to the event id,
 * which preserves uniqueness even if the value doesn't match what the
 * legacy parser would have emitted (task007 will catch that).
 */
function eventToTimelineMessage(event: InteractionEvent): TimelineMessage | null {
  const sourceUuid =
    (event.metadata?.sourceUuid as string | undefined) || event.id;
  const isSidechain = event.conversationId.includes(':sub:');
  const timestamp = event.timestamp;

  const content = event.content;
  const role = event.role;

  if (content.type === 'text') {
    const text = (content as TextContent).text;
    if (role === 'user') {
      return {
        type: 'user_text',
        uuid: sourceUuid,
        timestamp,
        text,
        isMeta: false,
        isSidechain,
      };
    }
    if (role === 'assistant') {
      return {
        type: 'assistant_text',
        uuid: sourceUuid,
        timestamp,
        model: event.cost?.model || '',
        text,
        stopReason: '',
        usage: usageFromCost(event),
        isSidechain,
      };
    }
    return null;
  }

  if (content.type === 'tool_call') {
    const tc = content as ToolCallContent;
    // Tool calls in the store are emitted with role 'assistant' (see
    // jsonl-to-event's assistant handler). Preserve the callId so the
    // frontend can pair it with its result.
    const input =
      tc.input && typeof tc.input === 'object' && !Array.isArray(tc.input)
        ? (tc.input as Record<string, unknown>)
        : {};
    return {
      type: 'tool_call',
      uuid: sourceUuid,
      timestamp,
      callId: tc.toolUseId || '',
      name: tc.toolName || '',
      input,
      isSidechain,
    };
  }

  if (content.type === 'tool_result') {
    const tr = content as ToolResultContent;
    let text = '';
    if (typeof tr.output === 'string') {
      text = tr.output;
    } else if (Array.isArray(tr.output)) {
      // Legacy's `extractText` walks an array of blocks and concatenates
      // `.text` fields — replicate just enough to stay in parity on
      // text-only array forms.
      text = tr.output
        .map((block) => {
          if (
            block &&
            typeof block === 'object' &&
            !Array.isArray(block) &&
            typeof (block as Record<string, unknown>).text === 'string'
          ) {
            return (block as Record<string, unknown>).text as string;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return {
      type: 'tool_result',
      uuid: sourceUuid,
      timestamp,
      toolUseId: tr.toolUseId || '',
      content: text,
      isError: tr.isError === true,
      isSidechain,
    };
  }

  // thinking / system content — not emitted as timeline messages by the
  // store backend. See module header for the parity gap rationale.
  return null;
}

/** Exported for tests and for the parity gate to introspect which
 *  methods still throw the distinctive error string. */
export { PARITY_GAP_PREFIX };

// Unused-suppression — `TimelineMessage` is imported purely for the type
// position in `SessionMessagesResult`'s return shape; TS elides it at
// runtime but we still want the import line visible so future
// implementers can trace the type chain from this file.
export type _TimelineMessageRef = TimelineMessage;
