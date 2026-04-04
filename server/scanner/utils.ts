import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { MAX_JSONL_HEAD_CHUNK, MAX_JSONL_TAIL_CHUNK } from "../config";
import { getDB } from "../db";

/** Normalize a path to use forward slashes (cross-platform) */
export function normPath(...args: string[]): string {
  return path.join(...args).replace(/\\/g, "/");
}

export const HOME = os.homedir().replace(/\\/g, "/");
export const CLAUDE_DIR = normPath(HOME, ".claude");

export function entityId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function safeReadJson(filePath: string): unknown | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function safeReadText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function getFileStat(filePath: string): { size: number; mtime: string } | null {
  try {
    const stat = fs.statSync(filePath);
    return { size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return null;
  }
}

export function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    // Guard against path traversal: only allow paths under home directory or absolute paths to known locations
    const resolved = path.resolve(filePath);
    const home = os.homedir();
    if (!resolved.startsWith(home) && !resolved.startsWith("/tmp") && !resolved.startsWith(os.tmpdir())) {
      return false;
    }
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

export function listDirs(dirPath: string): string[] {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dirPath, d.name).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

export function listFiles(dirPath: string, ext?: string): string[] {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isFile() && (!ext || d.name.endsWith(ext)))
      .map((d) => path.join(dirPath, d.name).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

export function now(): string {
  return new Date().toISOString();
}

/** Check whether a directory has common project marker files */
export function hasProjectMarkers(dirPath: string): boolean {
  return (
    fileExists(path.join(dirPath, "CLAUDE.md")) ||
    fileExists(path.join(dirPath, ".mcp.json")) ||
    dirExists(path.join(dirPath, ".git")) ||
    fileExists(path.join(dirPath, "package.json")) ||
    fileExists(path.join(dirPath, "pyproject.toml")) ||
    fileExists(path.join(dirPath, "requirements.txt")) ||
    fileExists(path.join(dirPath, "Cargo.toml")) ||
    fileExists(path.join(dirPath, "go.mod"))
  );
}

/** Well-known container directories that typically hold project subdirectories */
const PROJECT_CONTAINER_NAMES = new Set([
  "projects", "repos", "repositories", "src", "source",
  "code", "developer", "dev", "workspace", "workspaces", "git",
]);

/** Cache for discoverProjectDirs() — avoids redundant filesystem scans
 *  when multiple scanners call it during a single scan cycle. */
let cachedProjectDirs: string[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 5000;

/** Clear the project-dirs cache (called at the start of each scan cycle). */
export function clearProjectDirsCache(): void {
  cachedProjectDirs = null;
  cacheTs = 0;
}

/** Discover project directories under HOME that have project markers.
 *  Scans direct children of HOME, and also one level deeper inside
 *  well-known container directories (e.g. ~/Projects, ~/Developer).
 *  Results are cached for 5 seconds to avoid redundant I/O. */
export function discoverProjectDirs(): string[] {
  const now = Date.now();
  if (cachedProjectDirs !== null && now - cacheTs < CACHE_TTL_MS) {
    return cachedProjectDirs;
  }
  const results: string[] = [];
  const seen = new Set<string>();

  function addIfProject(dirPath: string) {
    if (seen.has(dirPath)) return;
    seen.add(dirPath);
    if (hasProjectMarkers(dirPath)) {
      results.push(dirPath);
    }
  }

  try {
    const entries = fs.readdirSync(HOME, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(HOME, e.name).replace(/\\/g, "/");

      // Check if this top-level dir is itself a project
      addIfProject(full);

      // If it's a well-known container directory, also scan its children
      if (PROJECT_CONTAINER_NAMES.has(e.name.toLowerCase())) {
        try {
          const children = fs.readdirSync(full, { withFileTypes: true });
          for (const child of children) {
            if (!child.isDirectory() || child.name.startsWith(".") || child.name === "node_modules") continue;
            const childFull = path.join(full, child.name).replace(/\\/g, "/");
            addIfProject(childFull);
          }
        } catch {}
      }
    }
  } catch {}

  // Fallback: discover projects from ~/.claude/projects/ session keys.
  // Build a set of encoded keys from already-discovered dirs so we can
  // detect duplicates without relying on lossy decoding.
  const seenKeys = new Set(results.map((p) => encodeProjectKey(p)));
  const projectsDir = normPath(CLAUDE_DIR, "projects");
  if (dirExists(projectsDir)) {
    try {
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        // Skip if a filesystem-discovered project already matches this key
        if (seenKeys.has(e.name)) continue;
        // Use decoded path as best-effort fallback (Docker case where dirs aren't mounted)
        const decoded = decodeProjectKey(e.name);
        if (seen.has(decoded)) continue;
        seen.add(decoded);
        results.push(decoded);
      }
    } catch {}
  }

  cachedProjectDirs = results;
  cacheTs = Date.now();
  return results;
}

/** Read first N JSON lines from file (reads only first chunk, not entire file).
 *  FD is properly closed in a finally block to prevent leaks. */
export function readHead(filePath: string, n: number = 25): any[] {
  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    const chunkSize = Math.min(MAX_JSONL_HEAD_CHUNK, stat.size);
    const buf = Buffer.alloc(chunkSize);
    fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, chunkSize, 0);
    const lines = buf.toString("utf-8").split("\n");
    const records: any[] = [];
    const limit = n * 3;
    for (let i = 0; i < Math.min(lines.length, limit); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
        if (records.length >= n) break;
      } catch {
        // Truncated JSON line — skip
      }
    }
    return records;
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

/** Binary-seek last bytes of file to get last timestamp.
 *  FD is properly closed in a finally block to prevent leaks. */
export function readTailTs(filePath: string): string | null {
  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    const chunkSize = Math.min(MAX_JSONL_TAIL_CHUNK, stat.size);
    const buf = Buffer.alloc(chunkSize);
    fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, chunkSize, Math.max(0, stat.size - chunkSize));
    const lines = buf.toString("utf-8").split("\n").reverse();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const d = JSON.parse(trimmed);
        if (d.timestamp) return d.timestamp;
      } catch {
        // Truncated JSON line — skip
      }
    }
  } catch {
    // File unreadable
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
  return null;
}

/** Read the first chunk of a JSONL file and extract user/assistant message records.
 *  Returns up to 50 records from the first 128KB / 150 lines. */
export function readMessageTimeline(
  filePath: string,
  opts?: { includeModel?: boolean },
): { type: string; role?: string; timestamp: string; contentPreview: string; model?: string }[] {
  const records: { type: string; role?: string; timestamp: string; contentPreview: string; model?: string }[] = [];
  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    const chunkSize = Math.min(131072, stat.size);
    const buf = Buffer.alloc(chunkSize);
    fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buf, 0, chunkSize, 0);
    const lines = buf.toString("utf-8").split("\n");
    let count = 0;
    for (let i = 0; i < Math.min(lines.length, 150) && count < 50; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const r = JSON.parse(line);
        if (r.type === "user" || r.type === "assistant") {
          const msg = r.message;
          let preview = "";
          if (msg && typeof msg === "object") {
            const c = msg.content;
            if (typeof c === "string") preview = c;
            else if (Array.isArray(c)) {
              preview = c.filter((x: any) => x?.type === "text").map((x: any) => x.text || "").join(" ");
            }
          }
          const record: { type: string; role?: string; timestamp: string; contentPreview: string; model?: string } = {
            type: r.type,
            role: msg?.role,
            timestamp: r.timestamp || "",
            contentPreview: preview.replace(/\n/g, " ").slice(0, 300),
          };
          if (opts?.includeModel && r.type === "assistant") {
            record.model = msg?.model;
          }
          records.push(record);
          count++;
        }
      } catch {
        // Truncated or malformed JSON line — skip
      }
    }
  } catch (err) {
    console.warn("[utils] Failed to read message timeline:", (err as Error).message);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
  return records;
}

/** Handle string and [{type:"text", text:"..."}] content shapes */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((item): item is { type: string; text?: string } => item != null && typeof item === "object" && (item as Record<string, unknown>).type === "text")
      .map((item) => item.text || "")
      .join(" ");
  }
  return "";
}

/** Extract text from message content, optionally skipping tool_result blocks */
export function extractMessageText(content: unknown, skipToolResults = false): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const item of content) {
      if (item == null || typeof item !== "object") continue;
      if (skipToolResults && item.type === "tool_result") continue;
      if (item.type === "text" && typeof item.text === "string") {
        textParts.push(item.text);
      }
    }
    return textParts.join("\n");
  }
  return "";
}

/** Extract tool_use block names from a content array */
export function extractToolNames(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const names: string[] = [];
  for (const item of content) {
    if (item != null && typeof item === "object" && item.type === "tool_use" && typeof item.name === "string") {
      if (!names.includes(item.name)) names.push(item.name);
    }
  }
  return names;
}

/** Expand ~/... and ~\... prefixes to the real home directory */
function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Get extra scan paths from app settings (tilde-expanded) */
export function getExtraPaths() {
  try {
    const settings = getDB().appSettings;
    const raw = settings?.scanPaths || { extraMcpFiles: [], extraProjectDirs: [], extraSkillDirs: [], extraPluginDirs: [] };
    const extraProjectDirs = raw.extraProjectDirs.map(expandTilde);
    // EXTRA_PROJECT_DIRS env var: comma-separated paths for Docker where
    // the host project dirs are mounted at a path the scanner can't auto-discover.
    const envDirs = process.env.EXTRA_PROJECT_DIRS;
    if (envDirs) {
      for (const d of envDirs.split(",").map((s: string) => s.trim()).filter(Boolean)) {
        if (!extraProjectDirs.includes(d)) extraProjectDirs.push(d);
      }
    }
    return {
      extraMcpFiles: raw.extraMcpFiles.map(expandTilde),
      extraProjectDirs,
      extraSkillDirs: raw.extraSkillDirs.map(expandTilde),
      extraPluginDirs: raw.extraPluginDirs.map(expandTilde),
    };
  } catch {
    return { extraMcpFiles: [], extraProjectDirs: [], extraSkillDirs: [], extraPluginDirs: [] };
  }
}

/** Encode a filesystem path to a Claude projects directory key.
 *  This is deterministic and non-lossy — always use this for matching
 *  instead of decodeProjectKey() which cannot distinguish hyphens from slashes.
 *  Normalizes trailing slashes, repeated separators, and drive-letter casing
 *  so equivalent paths always produce the same key. */
export function encodeProjectKey(filePath: string): string {
  if (!filePath) return "";
  const normalized = filePath
    .replace(/\\/g, "/")       // backslashes → forward slashes
    .replace(/\/+/g, "/");     // collapse repeated separators
  // Windows: detect drive letter first, before stripping trailing slashes
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const rest = driveMatch[2].replace(/\/$/, ""); // strip trailing slash from remainder
    return drive + "--" + rest.replace(/\//g, "-");
  }
  // Bare drive letter without slash (e.g. "C:") — treat as drive root
  if (/^[A-Za-z]:$/.test(normalized)) {
    return normalized[0].toUpperCase() + "--";
  }
  // Unix: strip trailing slash unless it's the root "/"
  let unix = normalized;
  if (unix.length > 1 && unix.endsWith("/")) {
    unix = unix.slice(0, -1);
  }
  // /home/tron → -home-tron, "/" → "-"
  return unix.replace(/\//g, "-");
}

/** Decode a Claude projects directory key to a filesystem path.
 *  WARNING: This is lossy — hyphens in directory names become slashes.
 *  Prefer encodeProjectKey() for matching operations. */
export function decodeProjectKey(key: string): string {
  // C--Users-alice -> C:/Users/alice (Windows)
  // -Users-hi -> /Users/hi (macOS/Linux, leading dash = leading /)
  const parts = key.split("--");
  if (parts.length === 1) {
    // No "--" means Unix path: -Users-hi -> /Users/hi
    return "/" + parts[0].replace(/^-/, "").replace(/-/g, "/");
  }
  // Windows: C--Users-alice -> C:/Users/alice
  let result = parts[0] + ":";
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i].replace(/-/g, "/");
    result += "/" + segment;
  }
  return result;
}
