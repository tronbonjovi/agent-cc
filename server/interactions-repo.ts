/**
 * Interactions data access layer (task003 — unified-capture milestone).
 *
 * Typed CRUD + query helpers over the `events` table created by
 * `server/interactions-db.ts`. All functions are synchronous (better-sqlite3
 * is sync) and operate on `InteractionEvent` values from `shared/types.ts`.
 *
 * Responsibilities:
 *   - Marshal between snake_case DB rows and camelCase `InteractionEvent`
 *     objects.
 *   - Round-trip the discriminated `InteractionContent` union via JSON.
 *   - Preserve nullability: `parentEventId` may be null, `cost` may be null,
 *     `metadata` may be undefined.
 *   - Provide a small set of read queries the rest of the system needs.
 *
 * Out of scope: caching, invalidation, business logic. Callers manage their
 * own lifecycle. Ingestion logic (mapping JSONL or chat events to
 * `InteractionEvent`) lives in later tasks.
 */

import type {
  InteractionEvent,
  InteractionContent,
  InteractionCost,
  InteractionSource,
} from '../shared/types';
import { openDb } from './interactions-db';

// ---------------------------------------------------------------------------
// Row shapes (snake_case, matching the SQLite schema)
// ---------------------------------------------------------------------------

/** Raw row returned by `SELECT * FROM events`. */
export interface EventRow {
  id: string;
  conversation_id: string;
  parent_event_id: string | null;
  timestamp: string;
  source: string;
  role: string;
  content_json: string;
  cost_json: string | null;
  metadata_json: string | null;
}

/** Aggregate row used by `listConversations`. */
interface ConversationSummaryRow {
  conversation_id: string;
  source: string;
  event_count: number;
  last_event: string;
}

/** Aggregate row used by `countBySource`. */
interface SourceCountRow {
  source: string;
  c: number;
}

// ---------------------------------------------------------------------------
// Marshaling
// ---------------------------------------------------------------------------

/**
 * Convert a typed `EventRow` into an `InteractionEvent`, parsing JSON columns
 * back into their structured form.
 *
 * - `content_json` always parses to an `InteractionContent` (the discriminator
 *   `type` field is enough for downstream narrowing).
 * - `cost_json` is null for deterministic events; we preserve the null rather
 *   than coercing to undefined.
 * - `metadata_json` is null when no metadata was attached; we omit the field
 *   entirely on the resulting event so callers can use `?? defaults`.
 * - `parent_event_id` round-trips as `null` when absent, matching the schema.
 */
export function rowToEvent(row: EventRow): InteractionEvent {
  const content = JSON.parse(row.content_json) as InteractionContent;
  const cost = row.cost_json === null ? null : (JSON.parse(row.cost_json) as InteractionCost);

  const event: InteractionEvent = {
    id: row.id,
    conversationId: row.conversation_id,
    parentEventId: row.parent_event_id,
    timestamp: row.timestamp,
    source: row.source as InteractionSource,
    role: row.role as InteractionEvent['role'],
    content,
    cost,
  };

  if (row.metadata_json !== null) {
    event.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  }

  return event;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Canonical upsert SQL for the `events` table. Exported so other modules
 * (notably `server/scanner/ingester.ts`, which needs to run this insert inside
 * its own shared transaction alongside `ingestion_state` updates) can reuse
 * the exact same statement — any future schema change touches one place.
 */
export const INSERT_EVENT_SQL = `
  INSERT OR REPLACE INTO events (
    id, conversation_id, parent_event_id, timestamp, source, role,
    content_json, cost_json, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Bind an `InteractionEvent` to the positional parameter list expected by
 * `INSERT_EVENT_SQL`. Centralized so every caller — single insert, batch
 * insert, ingester transaction — stays in lock-step with the column order.
 *
 * `parentEventId` may be `undefined` on the input shape (TS optional) or
 * `null` (DB-backed); both collapse to `null` for SQLite. Same for `metadata`.
 */
export function eventToParams(e: InteractionEvent): unknown[] {
  return [
    e.id,
    e.conversationId,
    e.parentEventId ?? null,
    e.timestamp,
    e.source,
    e.role,
    JSON.stringify(e.content),
    e.cost === null ? null : JSON.stringify(e.cost),
    e.metadata === undefined ? null : JSON.stringify(e.metadata),
  ];
}

/**
 * Insert (or replace) a single event by primary key. Calling twice with the
 * same `id` overwrites the existing row — useful for upsert flows where the
 * caller regenerates events from a deterministic source.
 */
export function insertEvent(e: InteractionEvent): void {
  const db = openDb();
  const stmt = db.prepare(INSERT_EVENT_SQL);
  stmt.run(...eventToParams(e));
}

/**
 * Transactional batch upsert. All inserts succeed or none do — better-sqlite3's
 * `db.transaction` wraps the function in BEGIN/COMMIT (or ROLLBACK on throw).
 *
 * Empty input is a no-op so callers can pass through unfiltered arrays.
 */
export function insertEventsBatch(events: InteractionEvent[]): void {
  if (events.length === 0) return;

  const db = openDb();
  const stmt = db.prepare(INSERT_EVENT_SQL);

  const insertMany = db.transaction((batch: InteractionEvent[]) => {
    for (const e of batch) {
      stmt.run(...eventToParams(e));
    }
  });

  insertMany(events);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Return every event for a conversation in chronological (ascending) order.
 * Backed by the `idx_events_conversation_id` index plus an in-memory sort on
 * the (small) per-conversation result set.
 */
export function getEventsByConversation(conversationId: string): InteractionEvent[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, parent_event_id, timestamp, source, role,
              content_json, cost_json, metadata_json
       FROM events
       WHERE conversation_id = ?
       ORDER BY timestamp ASC`
    )
    .all(conversationId) as EventRow[];

  return rows.map(rowToEvent);
}

/**
 * Return the most recent `limit` events for a given source, newest first.
 * Useful for "recent activity" panels filtered by stream type.
 */
export function getEventsBySource(
  source: InteractionSource,
  limit = 100
): InteractionEvent[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, parent_event_id, timestamp, source, role,
              content_json, cost_json, metadata_json
       FROM events
       WHERE source = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .all(source, limit) as EventRow[];

  return rows.map(rowToEvent);
}

/**
 * Group events by `conversation_id`, returning one summary row per
 * conversation with its primary source, total event count, and the timestamp
 * of the most recent event. Sorted by `lastEvent` descending so the freshest
 * conversations land first — matches what UI lists need.
 *
 * Note: the `source` column reflects whichever event SQLite picked from the
 * group (effectively non-deterministic for mixed-source conversations). In
 * practice each conversation has a single source, but if that ever changes,
 * callers should treat this field as a hint, not authoritative.
 */
export function listConversations(): Array<{
  conversationId: string;
  source: InteractionSource;
  eventCount: number;
  lastEvent: string;
}> {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT conversation_id,
              source,
              COUNT(*) AS event_count,
              MAX(timestamp) AS last_event
       FROM events
       GROUP BY conversation_id
       ORDER BY last_event DESC`
    )
    .all() as ConversationSummaryRow[];

  return rows.map((r) => ({
    conversationId: r.conversation_id,
    source: r.source as InteractionSource,
    eventCount: r.event_count,
    lastEvent: r.last_event,
  }));
}

// ---------------------------------------------------------------------------
// Helpers added by M5 scanner-ingester task003 (dual-path backend).
// Kept scoped to what `backend-store.ts` needs today. Broader analytics
// queries belong in later tasks (task004/005/006) once the parity gate is
// green — avoid growing this file into a general-purpose query layer.
// ---------------------------------------------------------------------------

/**
 * Per-conversation rollup row returned by `listConversationRollups`. Enough
 * fields to build a coarse `SessionData` shape from scanner-ingested data:
 * count, boundary timestamps, a representative `sessionPath` (metadata),
 * and total cost + token sums. Anything richer (firstMessage text, git
 * branch, cwd) is not in the store schema and stays as a gap for task007
 * to flag and task008 to decide on widening metadata vs keeping legacy.
 */
export interface ConversationRollupRow {
  conversationId: string;
  source: InteractionSource;
  eventCount: number;
  firstEvent: string | null;
  lastEvent: string | null;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  /** Representative `sessionPath` from any event's `metadata_json`, or null. */
  sessionPath: string | null;
}

interface RawRollupRow {
  conversation_id: string;
  source: string;
  event_count: number;
  first_event: string | null;
  last_event: string | null;
  total_cost_usd: number | null;
  total_tokens_in: number | null;
  total_tokens_out: number | null;
  sample_metadata_json: string | null;
}

/**
 * Group every event by `conversation_id` and return one rollup per
 * conversation, used by the store-backed scanner backend to produce its
 * session list. Cost/token aggregates parse `cost_json` via SQLite's
 * `json_extract` — deterministic events (null cost_json) contribute 0,
 * matching the cost indexer's convention.
 *
 * `sample_metadata_json` picks an arbitrary event from each group just so
 * we can surface `sessionPath` without round-tripping every row; any
 * ambiguity (e.g. different sidechain events carrying slightly different
 * metadata) is resolved at the caller.
 */
export function listConversationRollups(): ConversationRollupRow[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT conversation_id,
              source,
              COUNT(*) AS event_count,
              MIN(timestamp) AS first_event,
              MAX(timestamp) AS last_event,
              COALESCE(SUM(CAST(json_extract(cost_json, '$.usd') AS REAL)), 0) AS total_cost_usd,
              COALESCE(SUM(CAST(json_extract(cost_json, '$.tokensIn') AS INTEGER)), 0) AS total_tokens_in,
              COALESCE(SUM(CAST(json_extract(cost_json, '$.tokensOut') AS INTEGER)), 0) AS total_tokens_out,
              MAX(metadata_json) AS sample_metadata_json
       FROM events
       GROUP BY conversation_id
       ORDER BY last_event DESC`
    )
    .all() as RawRollupRow[];

  return rows.map((r): ConversationRollupRow => {
    let sessionPath: string | null = null;
    if (r.sample_metadata_json !== null) {
      try {
        const meta = JSON.parse(r.sample_metadata_json) as Record<string, unknown>;
        if (typeof meta.sessionPath === 'string') sessionPath = meta.sessionPath;
      } catch {
        // Malformed metadata row — ignore and leave sessionPath null rather
        // than crashing the whole listing.
      }
    }
    return {
      conversationId: r.conversation_id,
      source: r.source as InteractionSource,
      eventCount: r.event_count,
      firstEvent: r.first_event,
      lastEvent: r.last_event,
      totalCostUsd: r.total_cost_usd ?? 0,
      totalTokensIn: r.total_tokens_in ?? 0,
      totalTokensOut: r.total_tokens_out ?? 0,
      sessionPath,
    };
  });
}

/**
 * Return every event whose `conversation_id` matches exactly OR is a
 * descendant-sidechain id of the form `<conversationId>:sub:<agentId>`
 * (see ingester task002). Sorted chronologically so message-timeline
 * and cost aggregations can stream-consume a single ordered array.
 *
 * Added by M5 scanner-ingester task004 — `backend-store.getSessionMessages`
 * and `backend-store.getSessionCost` both need the full parent+sidechain
 * event set for a single session id, and doing it as one SQL pass keeps
 * the store backend from N+1ing per subagent.
 */
export function listEventsBySessionId(sessionId: string): InteractionEvent[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, parent_event_id, timestamp, source, role,
              content_json, cost_json, metadata_json
       FROM events
       WHERE conversation_id = ?
          OR conversation_id LIKE ?
       ORDER BY timestamp ASC`
    )
    .all(sessionId, `${sessionId}:sub:%`) as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Return every event whose `timestamp` is in the half-open interval
 * `[startIso, endIso)`. Used by `backend-store.getCostSummary` to narrow
 * to the last N days without pulling the full `events` table. Sorted
 * chronologically so day-bucketing is a single pass.
 *
 * ISO-8601 strings sort lexicographically in chronological order, so
 * SQL `BETWEEN` / `<` / `>=` against the raw column gives the correct
 * window without any date parsing.
 */
export function listEventsBetween(
  startIso: string,
  endIso: string
): InteractionEvent[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, parent_event_id, timestamp, source, role,
              content_json, cost_json, metadata_json
       FROM events
       WHERE timestamp >= ? AND timestamp < ?
       ORDER BY timestamp ASC`
    )
    .all(startIso, endIso) as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Return every event in the store, ordered chronologically. Used by
 * `getCostSummary` for the "this week vs last week" and "30d total"
 * rollups that legacy's cost indexer computes over ALL records rather
 * than the filtered `days` window.
 */
export function listAllEvents(): InteractionEvent[] {
  const db = openDb();
  const rows = db
    .prepare(
      `SELECT id, conversation_id, parent_event_id, timestamp, source, role,
              content_json, cost_json, metadata_json
       FROM events
       ORDER BY timestamp ASC`
    )
    .all() as EventRow[];
  return rows.map(rowToEvent);
}

/**
 * Return a `{ source: count }` map across all events. Cheap aggregate the
 * dashboard uses to render per-stream activity totals.
 */
export function countBySource(): Record<string, number> {
  const db = openDb();
  const rows = db
    .prepare('SELECT source, COUNT(*) AS c FROM events GROUP BY source')
    .all() as SourceCountRow[];

  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.source] = row.c;
  }
  return out;
}
