import path from "path";
import os from "os";

/** Directory for trashed session files (undo support) */
export const TRASH_DIR = path.join(os.tmpdir(), "claude-sessions-trash").replace(/\\/g, "/");

/** Full scan interval for periodic refresh (ms) */
export const PERIODIC_SCAN_INTERVAL_MS = 30_000;

/** Debounce interval for watcher-triggered rescans (ms) */
export const DEBOUNCE_MS = 2000;

/** Maximum number of sessions returned in unpaginated responses */
export const MAX_SESSIONS_RESPONSE = 1000;

/** Size of head chunk read from JSONL files (bytes) */
export const MAX_JSONL_HEAD_CHUNK = 65536;

/** Size of tail chunk read from JSONL files (bytes) */
export const MAX_JSONL_TAIL_CHUNK = 4096;
