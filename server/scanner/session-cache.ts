import fs from "fs";
import { parseSessionFile } from "./session-parser";
import type { ParsedSession, SessionTree } from "@shared/session-types";

interface CacheEntry {
  parsed: ParsedSession;
  /** SessionTree built by the scanner via `setEntry`. Null until populated. */
  tree: SessionTree | null;
  fileSize: number;
}

/**
 * Cache for parsed session data + their hierarchical SessionTree. Keyed by
 * file path. Re-parses automatically when file size changes (indicating new
 * data). Use invalidateAll() at the start of each scan cycle to force a full
 * refresh.
 *
 * The cache is the storage layer, not a tree builder — `getOrParse` only
 * parses the JSONL. The scanner is responsible for calling `setEntry` to
 * inject the `SessionTree` alongside the parsed session. Subagent JSONLs are
 * not tracked for invalidation: dropping the parent entry drops its tree too,
 * which is the only invalidation trigger.
 */
export class SessionParseCache {
  private entries = new Map<string, CacheEntry>();

  /** Get parsed session from cache, or parse the file if not cached / stale. */
  getOrParse(filePath: string, projectKey: string): ParsedSession | null {
    let fileSize: number;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch {
      return null;
    }

    const cached = this.entries.get(filePath);
    if (cached && cached.fileSize === fileSize) {
      return cached.parsed;
    }

    const parsed = parseSessionFile(filePath, projectKey);
    if (parsed) {
      this.entries.set(filePath, { parsed, tree: null, fileSize });
    } else {
      this.entries.delete(filePath);
    }
    return parsed;
  }

  /**
   * Atomically populate a cache entry with both the parsed session and its
   * built SessionTree. Used by the scanner after running the tree builder so
   * `getById`/`getTreeById` always return a matching pair. The file is statted
   * here so invalidation stays size-keyed and consistent with `getOrParse`.
   */
  setEntry(filePath: string, parsed: ParsedSession, tree: SessionTree): void {
    let fileSize = 0;
    try {
      fileSize = fs.statSync(filePath).size;
    } catch {
      // File missing — store with size 0; next getOrParse will re-stat and
      // either drop or refresh the entry.
    }
    this.entries.set(filePath, { parsed, tree, fileSize });
  }

  /** Get a cached session by session ID (linear scan — use sparingly). */
  getById(sessionId: string): ParsedSession | null {
    for (const [, entry] of Array.from(this.entries)) {
      if (entry.parsed.meta.sessionId === sessionId) return entry.parsed;
    }
    return null;
  }

  /** Get a cached session by file path. Pure read — does not parse on miss. */
  getByPath(filePath: string): ParsedSession | null {
    return this.entries.get(filePath)?.parsed ?? null;
  }

  /** Get a cached SessionTree by session ID. Returns null when not populated. */
  getTreeById(sessionId: string): SessionTree | null {
    for (const [, entry] of Array.from(this.entries)) {
      if (entry.parsed.meta.sessionId === sessionId) return entry.tree;
    }
    return null;
  }

  /** Get a cached SessionTree by file path. Returns null when not populated. */
  getTreeByPath(filePath: string): SessionTree | null {
    return this.entries.get(filePath)?.tree ?? null;
  }

  /** Clear all cached entries. Call at the start of each scan cycle. */
  invalidateAll(): void {
    this.entries.clear();
  }

  /** Remove a single entry — drops both parsed session and tree together. */
  invalidate(filePath: string): void {
    this.entries.delete(filePath);
  }

  /** Return all cached parsed sessions as a Map keyed by sessionId. */
  getAll(): Map<string, ParsedSession> {
    const result = new Map<string, ParsedSession>();
    Array.from(this.entries).forEach(([, entry]) => {
      result.set(entry.parsed.meta.sessionId, entry.parsed);
    });
    return result;
  }

  /** Number of cached sessions. */
  get size(): number {
    return this.entries.size;
  }
}

/** Singleton instance used by the scanner. */
export const sessionParseCache = new SessionParseCache();
