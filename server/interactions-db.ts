/**
 * Unified capture store — SQLite database for InteractionEvent time-series.
 *
 * Lives at `<dataDir>/interactions.db` alongside the existing JSON store
 * (`agent-cc.json`). The two are intentionally decoupled: the JSON store keeps
 * config and UI state; this SQLite database owns the high-volume event log
 * driven by the `InteractionEvent` shape from `shared/types.ts`.
 *
 * Module shape (task002 — unified-capture milestone):
 * - openDb()       — opens the database, runs pending migrations, returns the
 *                    cached `Database` instance.
 * - closeDb()      — closes the cached handle (used in tests + clean shutdown).
 * - getDbPath()    — returns the resolved path to `interactions.db` for the
 *                    currently-active data dir.
 *
 * Schema/migration management is forward-only and version-tracked in a
 * `migrations` table. Query helpers and ingestion logic live in later tasks
 * (task003 builds the data access layer; M3 wires ingestion).
 *
 * Path resolution is **lazy**: `AGENT_CC_DATA` is read on every `openDb()`
 * call rather than cached at module-load time. Tests override the env var
 * before opening so each test gets an isolated temp dir; production behavior
 * is identical because the env var is set once at startup.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Path resolution (lazy — re-evaluated on every openDb call)
// ---------------------------------------------------------------------------

/**
 * Resolve the data directory. Mirrors the logic in `server/db.ts` so both
 * stores live side-by-side, but reads `AGENT_CC_DATA` lazily so tests can
 * point each test at a unique temp dir before calling `openDb()`.
 */
function resolveDataDir(): string {
  return process.env.AGENT_CC_DATA
    ? path.resolve(process.env.AGENT_CC_DATA)
    : path.join(os.homedir(), '.agent-cc');
}

/** Absolute path to the interactions database for the currently-active data dir. */
export function getDbPath(): string {
  return path.join(resolveDataDir(), 'interactions.db');
}

// ---------------------------------------------------------------------------
// Migration definitions
// ---------------------------------------------------------------------------

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Forward-only schema migrations. To add a migration, append a new entry with
 * the next version number — never edit or remove an existing one.
 *
 * Column shape mirrors `InteractionEvent` from `shared/types.ts`:
 *   id, conversationId, parentEventId, timestamp, source, role, content, cost,
 *   metadata. Snake_case here, camelCase in the TypeScript type — task003 maps
 *   between them.
 *
 * Indexes cover the dimensions the unified-capture and analytics milestones
 * query on: `conversation_id` (per-conversation timelines), `timestamp` (time
 * windows), and `source` (filter by chat-ai, scanner-jsonl, etc.).
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_events_table',
    sql: `
      CREATE TABLE IF NOT EXISTS events (
        id                TEXT PRIMARY KEY,
        conversation_id   TEXT NOT NULL,
        parent_event_id   TEXT,
        timestamp         TEXT NOT NULL,
        source            TEXT NOT NULL,
        role              TEXT NOT NULL,
        content_json      TEXT NOT NULL,
        cost_json         TEXT,
        metadata_json     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_conversation_id
        ON events (conversation_id);

      CREATE INDEX IF NOT EXISTS idx_events_timestamp
        ON events (timestamp);

      CREATE INDEX IF NOT EXISTS idx_events_source
        ON events (source);
    `,
  },
];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let cachedDb: Database.Database | null = null;
let cachedPath: string | null = null;

interface MigrationRow {
  version: number;
}

/**
 * Open (or return the cached) interactions database.
 *
 * On first open for a given data dir:
 *   1. Ensures the data dir exists.
 *   2. Opens the SQLite file with `better-sqlite3`.
 *   3. Enables WAL journal mode for concurrent reader/writer behavior.
 *   4. Runs any pending migrations inside transactions.
 *
 * If the resolved `getDbPath()` differs from the cached one (tests pointing
 * at a fresh temp dir), the cached handle is closed and a new one is opened.
 */
export function openDb(): Database.Database {
  const dbPath = getDbPath();

  if (cachedDb && cachedPath === dbPath) {
    return cachedDb;
  }

  // Path changed (typical in tests) — close the stale handle first.
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
    cachedPath = null;
  }

  // Ensure the parent directory exists.
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // WAL mode: better concurrent reads, smaller per-write fsync cost.
  db.pragma('journal_mode = WAL');
  // Enforce FK constraints if any are added in future migrations.
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

/**
 * Close the cached database handle, if any. Safe to call when nothing is
 * open. Tests use this in `afterEach` to release the file before removing the
 * temp dir; production calls it on graceful shutdown.
 */
export function closeDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
    cachedPath = null;
  }
}

// ---------------------------------------------------------------------------
// Migration runner (forward-only, idempotent, transactional)
// ---------------------------------------------------------------------------

function runMigrations(db: Database.Database): void {
  // Migration tracking table — bootstrap before any other migration runs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM migrations')
    .all() as MigrationRow[];
  const applied = new Set(appliedRows.map((r) => r.version));

  const insertMigration = db.prepare(
    'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
    });

    apply();
  }
}
