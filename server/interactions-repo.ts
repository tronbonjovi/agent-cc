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

const INSERT_SQL = `
  INSERT OR REPLACE INTO events (
    id, conversation_id, parent_event_id, timestamp, source, role,
    content_json, cost_json, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Bind an `InteractionEvent` to the positional parameter list expected by
 * `INSERT_SQL`. Centralized so single + batch inserts stay in lock-step.
 *
 * `parentEventId` may be `undefined` on the input shape (TS optional) or
 * `null` (DB-backed); both collapse to `null` for SQLite. Same for `metadata`.
 */
function eventToParams(e: InteractionEvent): unknown[] {
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
  const stmt = db.prepare(INSERT_SQL);
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
  const stmt = db.prepare(INSERT_SQL);

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
