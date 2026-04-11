import fs from "fs";
import { parseSessionFile } from "./session-parser";
import type { ParsedSession } from "@shared/session-types";

interface CacheEntry {
  parsed: ParsedSession;
  fileSize: number;
}

/**
 * Cache for parsed session data. Keyed by file path.
 * Re-parses automatically when file size changes (indicating new data).
 * Use invalidateAll() at the start of each scan cycle to force a full refresh.
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
      this.entries.set(filePath, { parsed, fileSize });
    } else {
      this.entries.delete(filePath);
    }
    return parsed;
  }

  /** Get a cached session by session ID (linear scan — use sparingly). */
  getById(sessionId: string): ParsedSession | null {
    for (const [, entry] of Array.from(this.entries)) {
      if (entry.parsed.meta.sessionId === sessionId) return entry.parsed;
    }
    return null;
  }

  /** Clear all cached entries. Call at the start of each scan cycle. */
  invalidateAll(): void {
    this.entries.clear();
  }

  /** Remove a single entry. */
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
