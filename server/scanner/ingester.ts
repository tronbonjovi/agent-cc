/**
 * Scanner ingester service (scanner-ingester task002).
 *
 * Write-side of the scanner reframe: watches the user's Claude projects
 * directory (plus anything in `EXTRA_PROJECT_DIRS`), incrementally reads new
 * bytes from each `.jsonl` session file, maps them to `InteractionEvent`
 * values with `jsonlLinesToEvents`, and upserts them into the unified
 * `interactions.db` SQLite store from Milestone 4.
 *
 * Resumption is byte-offset based. On every run the ingester seeks to the
 * `last_offset` persisted in the `ingestion_state` table (v2 migration), reads
 * the delta, trims to the last complete newline (so partial writes are safe),
 * and commits the new events + updated offset in a single transaction. A
 * restart therefore only re-reads any trailing partial line, never the whole
 * file.
 *
 * Public API:
 *   - `ingestFileOnce(filePath)` — one-shot, returns events inserted
 *   - `ingestAllOnce(roots?)`  — walk every `.jsonl` under the given roots
 *   - `startIngester(roots?)`  — initial pass + fs.watch watchers
 *   - `stopIngester()`         — close watchers, clear debounce timers
 *
 * Sidechain handling: the mapper is single-file, but sidechain JSONLs live in
 * a `<session>/subagents/agent-*.jsonl` tree next to the parent session.
 * `discoverSubagents` already knows how to enumerate them; this module feeds
 * those files through the same `ingestFileOnce` path so every byte-offset,
 * upsert, and graceful-degradation rule applies uniformly.
 *
 * Graceful degradation: every unit of work is wrapped in try/catch and logs
 * to `console.error` on failure. A single malformed file never halts a walk,
 * and fs.watch errors never crash the server.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { openDb } from '../interactions-db';
import { jsonlLinesToEvents } from './jsonl-to-event';
import { discoverSubagents } from './subagent-discovery';
import type { InteractionEvent } from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window for fs.watch change events — coalesces noisy writes. */
const WATCH_DEBOUNCE_MS = 500;

/** SQL for event + ingestion-state upsert, replicated from interactions-repo
 *  so we can run them in a single shared transaction. */
const INSERT_EVENT_SQL = `
  INSERT OR REPLACE INTO events (
    id, conversation_id, parent_event_id, timestamp, source, role,
    content_json, cost_json, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const UPSERT_STATE_SQL = `
  INSERT INTO ingestion_state (file_path, last_offset, last_ingested_at, event_count)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(file_path) DO UPDATE SET
    last_offset = excluded.last_offset,
    last_ingested_at = excluded.last_ingested_at,
    event_count = excluded.event_count
`;

const DELETE_EVENTS_BY_CONVERSATION_SQL = `
  DELETE FROM events WHERE conversation_id = ?
`;

// ---------------------------------------------------------------------------
// Watcher state (module-local — there is at most one ingester per process)
// ---------------------------------------------------------------------------

interface WatcherEntry {
  watcher: fs.FSWatcher;
  root: string;
}

let watchers: WatcherEntry[] = [];
const debounceTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Root discovery
// ---------------------------------------------------------------------------

/**
 * Resolve the default roots the ingester should walk:
 *   - `~/.claude/projects` (always, if it exists)
 *   - Every path in `EXTRA_PROJECT_DIRS` (comma-separated)
 *
 * Non-existent paths are silently dropped so a missing home dir or a typo in
 * an env var never crashes the ingester. Tests pass explicit roots and bypass
 * this resolver entirely.
 */
function getDefaultRoots(): string[] {
  const roots: string[] = [];
  const home = os.homedir();
  if (home) {
    const claudeProjects = path.join(home, '.claude', 'projects');
    if (fs.existsSync(claudeProjects)) roots.push(claudeProjects);
  }

  const extra = process.env.EXTRA_PROJECT_DIRS;
  if (extra) {
    for (const p of extra.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (fs.existsSync(p)) roots.push(p);
    }
  }

  return roots;
}

/**
 * Walk a root directory tree and return every `.jsonl` file path.
 *
 * The expected layout is `<root>/<project-key>/<session-id>.jsonl` plus any
 * `<project-key>/<session-id>/subagents/agent-*.jsonl` sidechain files, but we
 * do a general recursive walk so re-organized or nested layouts still work.
 * Failures on individual directories degrade to "empty" rather than throwing.
 */
function walkJsonlFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Conversation ID derivation
// ---------------------------------------------------------------------------

/**
 * Derive the `conversationId` for a session file. For top-level session files
 * we use the bare basename without `.jsonl` (matches session-parser). For
 * sidechain subagent files the layout is
 * `<session-id>/subagents/agent-<id>.jsonl`; we want those events to appear
 * under a distinct conversation id so they don't collide with the parent, so
 * we use `<session-id>:sub:<agent-id>`.
 */
function deriveConversationId(filePath: string): string {
  const base = path.basename(filePath, '.jsonl');

  // Detect subagent layout: .../<session-id>/subagents/agent-<id>.jsonl
  const parent = path.basename(path.dirname(filePath));
  if (parent === 'subagents') {
    const sessionDir = path.basename(path.dirname(path.dirname(filePath)));
    // base is "agent-<id>"; strip the agent- prefix if present.
    const agentId = base.startsWith('agent-') ? base.slice('agent-'.length) : base;
    return `${sessionDir}:sub:${agentId}`;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Core: ingest a single file from its persisted offset to the last newline
// ---------------------------------------------------------------------------

interface IngestionStateRow {
  file_path: string;
  last_offset: number;
  last_ingested_at: string;
  event_count: number;
}

/**
 * Read `filePath` from the persisted offset to EOF, map each complete line to
 * events, and upsert them plus the new offset atomically.
 *
 * Returns the number of events inserted. Returns 0 if nothing new (same
 * offset, empty delta, no parseable lines, or the file does not exist).
 *
 * Never throws — all failures are logged and the function returns 0.
 */
export function ingestFileOnce(filePath: string): number {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }
  if (!stat.isFile()) return 0;

  const db = openDb();
  const existing = db
    .prepare('SELECT file_path, last_offset, last_ingested_at, event_count FROM ingestion_state WHERE file_path = ?')
    .get(filePath) as IngestionStateRow | undefined;

  let startOffset = existing?.last_offset ?? 0;

  // Truncation: file is smaller than our recorded offset. Reset state AND
  // delete the events for this conversation so a rewrite doesn't leave
  // stale events in the store.
  let truncated = false;
  if (startOffset > stat.size) {
    truncated = true;
    startOffset = 0;
  }

  if (!truncated && startOffset === stat.size) {
    // Nothing new to read.
    return 0;
  }

  // Read only the delta — open a read fd and slice [startOffset, EOF).
  const deltaLength = stat.size - startOffset;
  if (deltaLength <= 0) return 0;

  let delta: Buffer;
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      delta = Buffer.alloc(deltaLength);
      fs.readSync(fd, delta, 0, deltaLength, startOffset);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    console.error(`[ingester] failed to read ${filePath}:`, err);
    return 0;
  }

  // Find the last complete newline in the delta — everything after it is a
  // partial line we shouldn't commit yet. next ingest re-reads it.
  const lastNewline = delta.lastIndexOf(0x0a); // '\n'
  if (lastNewline === -1) {
    // No newline at all in the delta — can't safely parse. Leave offset where
    // it was and wait for more data.
    return 0;
  }

  const completeSlice = delta.slice(0, lastNewline + 1);
  const newOffset = startOffset + completeSlice.length;

  // Parse each line — skip empties and malformed JSON. The mapper already
  // tolerates garbage at the record level, but JSON.parse needs its own guard.
  const parsedLines: unknown[] = [];
  const text = completeSlice.toString('utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      parsedLines.push(JSON.parse(trimmed));
    } catch {
      // Malformed line — skip silently. Never stop the batch.
    }
  }

  const conversationId = deriveConversationId(filePath);
  const events: InteractionEvent[] = jsonlLinesToEvents(parsedLines, {
    conversationId,
    sessionPath: filePath,
  });

  // Commit events + state update in one transaction so they stay consistent.
  const insertEvent = db.prepare(INSERT_EVENT_SQL);
  const upsertState = db.prepare(UPSERT_STATE_SQL);
  const deleteByConv = db.prepare(DELETE_EVENTS_BY_CONVERSATION_SQL);

  const priorCount = existing?.event_count ?? 0;
  const nextCount = truncated ? events.length : priorCount + events.length;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    if (truncated) {
      // Drop any existing events for this conversation — the file was
      // rewritten so old events are stale.
      deleteByConv.run(conversationId);
    }
    for (const e of events) {
      insertEvent.run(
        e.id,
        e.conversationId,
        e.parentEventId ?? null,
        e.timestamp,
        e.source,
        e.role,
        JSON.stringify(e.content),
        e.cost === null ? null : JSON.stringify(e.cost),
        e.metadata === undefined ? null : JSON.stringify(e.metadata),
      );
    }
    upsertState.run(filePath, newOffset, now, nextCount);
  });

  try {
    tx();
  } catch (err) {
    console.error(`[ingester] transaction failed for ${filePath}:`, err);
    return 0;
  }

  return events.length;
}

// ---------------------------------------------------------------------------
// Core: walk roots and ingest every .jsonl found
// ---------------------------------------------------------------------------

/**
 * Ingest every `.jsonl` under every provided root. If `roots` is omitted it
 * resolves to `~/.claude/projects` + `EXTRA_PROJECT_DIRS`.
 *
 * Returns the total number of events inserted across all files. Errors on
 * individual files are logged and skipped — the walk always completes.
 */
export function ingestAllOnce(roots?: string[]): number {
  const targets = roots ?? getDefaultRoots();
  let total = 0;

  for (const root of targets) {
    if (!fs.existsSync(root)) continue;

    let files: string[];
    try {
      files = walkJsonlFiles(root);
    } catch (err) {
      console.error(`[ingester] walk failed for ${root}:`, err);
      continue;
    }

    for (const file of files) {
      try {
        total += ingestFileOnce(file);
      } catch (err) {
        console.error(`[ingester] ingest failed for ${file}:`, err);
      }

      // Sidechain discovery: if this is a top-level session file, check for
      // subagent sidechains next to it and feed them through the same path.
      // `discoverSubagents` returns [] when there's no sidechain tree, so the
      // common case is free.
      if (path.basename(path.dirname(file)) !== 'subagents') {
        try {
          const subs = discoverSubagents(file);
          for (const sub of subs) {
            try {
              total += ingestFileOnce(sub.filePath);
            } catch (err) {
              console.error(`[ingester] sidechain ingest failed for ${sub.filePath}:`, err);
            }
          }
        } catch (err) {
          console.error(`[ingester] sidechain discovery failed for ${file}:`, err);
        }
      }
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Watcher lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the ingester: run an initial `ingestAllOnce` pass, then set up one
 * recursive `fs.watch` per root to pick up ongoing writes. The watch callback
 * is debounced per-file so a burst of writes (each message flushes the JSONL)
 * only triggers one re-ingest.
 *
 * Note on recursive fs.watch: `{ recursive: true }` is supported on Linux
 * (kernel 6.x+ via `inotify`) and macOS/Windows out of the box. Our deploy
 * target is Linux so this works. On very old kernels recursive mode falls
 * back to errors which we catch and log rather than crash.
 */
export function startIngester(roots?: string[]): void {
  // Safety: stop any prior instance before starting a new one.
  stopIngester();

  const targets = roots ?? getDefaultRoots();

  // Initial pass — synchronous. On very large homes this may take a few
  // hundred ms; that's still better than holding up every HTTP request until
  // the watcher is armed, so callers can run it from app startup directly.
  try {
    ingestAllOnce(targets);
  } catch (err) {
    console.error('[ingester] initial ingest pass failed:', err);
  }

  for (const root of targets) {
    if (!fs.existsSync(root)) continue;

    try {
      const watcher = fs.watch(
        root,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename) return;
          const rel = filename.toString();
          if (!rel.endsWith('.jsonl')) return;

          const fullPath = path.join(root, rel);
          const existing = debounceTimers.get(fullPath);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            debounceTimers.delete(fullPath);
            try {
              ingestFileOnce(fullPath);
            } catch (err) {
              console.error(`[ingester] debounced ingest failed for ${fullPath}:`, err);
            }
          }, WATCH_DEBOUNCE_MS);
          debounceTimers.set(fullPath, timer);
        },
      );

      watcher.on('error', (err) => {
        console.error(`[ingester] watcher error on ${root}:`, err);
      });

      watchers.push({ watcher, root });
    } catch (err) {
      console.error(`[ingester] failed to watch ${root}:`, err);
    }
  }
}

/**
 * Stop the ingester — close every active watcher and clear pending debounce
 * timers. Safe to call when nothing is running (used in graceful shutdown and
 * in tests).
 */
export function stopIngester(): void {
  for (const { watcher } of watchers) {
    try {
      watcher.close();
    } catch {
      // ignore — we're shutting down
    }
  }
  watchers = [];

  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();
}
