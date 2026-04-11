import { CLAUDE_DIR, dirExists, fileExists, readHead, readTailTs, extractText, normPath } from "./utils";
import path from "path";
import fs from "fs";
import type { SessionData, SessionStats } from "@shared/types";
import { sessionParseCache } from "./session-cache";

// Per-project aggregate (backward compat for scanner/index.ts)
export interface ProjectSessionAgg {
  projectKey: string;
  sessionCount: number;
  totalSize: number;
  lastModified: string | null;
}

// Module-level cache
let cachedSessions: SessionData[] = [];
let cachedStats: SessionStats = { totalCount: 0, totalSize: 0, activeCount: 0, emptyCount: 0 };

export function getCachedSessions(): SessionData[] { return [...cachedSessions]; }
export function getCachedStats(): SessionStats { return cachedStats; }
export function removeCachedSession(id: string): void {
  const idx = cachedSessions.findIndex(s => s.id === id);
  if (idx !== -1) {
    const s = cachedSessions[idx];
    cachedStats.totalCount--;
    cachedStats.totalSize -= s.sizeBytes;
    if (s.isActive) cachedStats.activeCount--;
    if (s.isEmpty) cachedStats.emptyCount--;
    cachedSessions.splice(idx, 1);
  }
}

export function restoreCachedSession(session: SessionData): void {
  // Avoid duplicates
  if (cachedSessions.some(s => s.id === session.id)) return;
  cachedSessions.push(session);
  cachedStats.totalCount++;
  cachedStats.totalSize += session.sizeBytes;
  if (session.isActive) cachedStats.activeCount++;
  if (session.isEmpty) cachedStats.emptyCount++;
  // Re-sort newest first
  cachedSessions.sort((a, b) => {
    const aTs = a.lastTs || a.firstTs || "";
    const bTs = b.lastTs || b.firstTs || "";
    return bTs.localeCompare(aTs);
  });
}

// History index cache — avoids re-reading the entire append-only file
let lastHistorySize = 0;
let cachedHistoryIndex = new Map<string, any[]>();

/** Parse history.jsonl -> Map<sessionId, entries[]> (cached, incremental) */
function buildHistoryIndex(): Map<string, any[]> {
  const historyPath = normPath(CLAUDE_DIR, "history.jsonl");
  if (!fileExists(historyPath)) {
    // File gone — reset cache
    lastHistorySize = 0;
    cachedHistoryIndex = new Map();
    return cachedHistoryIndex;
  }

  let currentSize: number;
  try {
    const stat = fs.statSync(historyPath);
    currentSize = stat.size;
  } catch {
    return cachedHistoryIndex;
  }

  // No change — return cached
  if (currentSize === lastHistorySize) {
    return cachedHistoryIndex;
  }

  // File truncated or replaced — reset and read from scratch
  if (currentSize < lastHistorySize) {
    lastHistorySize = 0;
    cachedHistoryIndex = new Map();
  }

  // Read only new bytes appended since last read
  const readOffset = lastHistorySize;
  const bytesToRead = currentSize - readOffset;
  if (bytesToRead <= 0) return cachedHistoryIndex;

  let fd: number | null = null;
  try {
    const buf = Buffer.alloc(bytesToRead);
    fd = fs.openSync(historyPath, "r");
    fs.readSync(fd, buf, 0, bytesToRead, readOffset);
    const chunk = buf.toString("utf-8");
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        const sid = entry.sessionId;
        if (sid) {
          if (!cachedHistoryIndex.has(sid)) cachedHistoryIndex.set(sid, []);
          cachedHistoryIndex.get(sid)!.push(entry);
        }
      } catch {}
    }
    lastHistorySize = currentSize;
  } catch (err) {
    console.warn("[session-scanner] Failed to read history.jsonl:", (err as Error).message);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }

  return cachedHistoryIndex;
}

/** Read ~/.claude/sessions/*.json -> Set of active session IDs */
function getActiveSessions(): Set<string> {
  const active = new Set<string>();
  const sessionsDir = normPath(CLAUDE_DIR, "sessions");
  if (!dirExists(sessionsDir)) return active;
  try {
    const files = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const f of files) {
      if (f.isFile() && f.name.endsWith(".json")) {
        active.add(f.name.replace(".json", ""));
      }
    }
  } catch (err) {
    console.warn("[session-scanner] Failed to read sessions dir:", (err as Error).message);
  }
  return active;
}

/** Parse a single session file into SessionData */
function parseSession(
  filePath: string,
  projectKey: string,
  historyIndex: Map<string, any[]>,
  activeSessions: Set<string>,
): SessionData | null {
  try {
    const basename = path.basename(filePath, ".jsonl");
    const stat = fs.statSync(filePath);

    // Use the comprehensive parser for full extraction
    const parsed = sessionParseCache.getOrParse(filePath, projectKey);

    if (parsed) {
      // Derive firstMessage: prefer history index (matches current behavior)
      let firstMessage = "";
      const historyEntries = historyIndex.get(basename) || [];
      if (historyEntries.length > 0) {
        const sorted = [...historyEntries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        for (const entry of sorted) {
          const display = (entry.display || "").trim();
          if (display && !display.startsWith("/")) {
            firstMessage = display;
            break;
          }
        }
        if (!firstMessage && sorted.length > 0) {
          firstMessage = (sorted[0].display || "").trim();
        }
      }
      // Fall back to parser's firstMessage
      if (!firstMessage) {
        firstMessage = parsed.meta.firstMessage;
      }

      const messageCount = parsed.counts.assistantMessages + parsed.counts.userMessages;
      const isEmpty = !firstMessage || messageCount < 3;

      return {
        id: basename,
        slug: parsed.meta.slug,
        firstMessage: firstMessage.replace(/^---\n[\s\S]*?\n---\n*/, "").replace(/\n/g, " ").trim(),
        firstTs: parsed.meta.firstTs,
        lastTs: parsed.meta.lastTs,
        messageCount,
        sizeBytes: stat.size,
        isEmpty,
        isActive: activeSessions.has(basename),
        filePath: filePath.replace(/\\/g, "/"),
        projectKey,
        cwd: parsed.meta.cwd,
        version: parsed.meta.version,
        gitBranch: parsed.meta.gitBranch,
      };
    }

    // Fallback: if parser returned null (empty file), use minimal approach
    return {
      id: basename,
      slug: "",
      firstMessage: "",
      firstTs: null,
      lastTs: null,
      messageCount: 0,
      sizeBytes: stat.size,
      isEmpty: true,
      isActive: activeSessions.has(basename),
      filePath: filePath.replace(/\\/g, "/"),
      projectKey,
      cwd: "",
      version: "",
      gitBranch: "",
    };
  } catch {
    return null;
  }
}

/** Scan all session files across all project dirs */
export function scanAllSessions(): {
  sessions: SessionData[];
  stats: SessionStats;
  perProject: ProjectSessionAgg[];
} {
  const projectsDir = normPath(CLAUDE_DIR, "projects");
  if (!dirExists(projectsDir)) {
    cachedSessions = [];
    cachedStats = { totalCount: 0, totalSize: 0, activeCount: 0, emptyCount: 0 };
    return { sessions: [], stats: cachedStats, perProject: [] };
  }

  const historyIndex = buildHistoryIndex();
  const activeSessions = getActiveSessions();
  const allSessions: SessionData[] = [];
  const projectAggs: ProjectSessionAgg[] = [];

  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const projectDir = normPath(projectsDir, dir.name);
      let projCount = 0;
      let projSize = 0;
      let projLastMod: string | null = null;

      try {
        const files = fs.readdirSync(projectDir, { withFileTypes: true });
        for (const f of files) {
          if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
          const filePath = normPath(projectDir, f.name);
          const session = parseSession(filePath, dir.name, historyIndex, activeSessions);
          if (session) {
            allSessions.push(session);
            projCount++;
            projSize += session.sizeBytes;
            const ts = session.lastTs || session.firstTs;
            if (ts && (!projLastMod || ts > projLastMod)) projLastMod = ts;
          }
        }
      } catch (err) {
        console.warn(`[session-scanner] Failed to read project dir ${dir.name}:`, (err as Error).message);
      }

      projectAggs.push({
        projectKey: dir.name,
        sessionCount: projCount,
        totalSize: projSize,
        lastModified: projLastMod,
      });
    }
  } catch (err) {
    console.warn("[session-scanner] Failed to read projects dir:", (err as Error).message);
  }

  // Sort newest-first
  allSessions.sort((a, b) => {
    const aTs = a.lastTs || a.firstTs || "";
    const bTs = b.lastTs || b.firstTs || "";
    return bTs.localeCompare(aTs);
  });

  const stats: SessionStats = {
    totalCount: allSessions.length,
    totalSize: allSessions.reduce((sum, s) => sum + s.sizeBytes, 0),
    activeCount: allSessions.filter(s => s.isActive).length,
    emptyCount: allSessions.filter(s => s.isEmpty).length,
  };

  // Update cache
  cachedSessions = allSessions;
  cachedStats = stats;

  return { sessions: allSessions, stats, perProject: projectAggs };
}
