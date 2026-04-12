import { Router, type Request, type Response } from "express";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { getCachedSessions, getCachedStats, removeCachedSession, restoreCachedSession } from "../scanner/session-scanner";
import { CLAUDE_DIR, encodeProjectKey, dirExists, readMessageTimeline } from "../scanner/utils";
import { SessionIdSchema, SessionListSchema, IdsArraySchema, DeepSearchSchema, validate, qstr, validateSafePath } from "./validation";
import { TRASH_DIR, MAX_SESSIONS_RESPONSE } from "../config";
import { deepSearch } from "../scanner/deep-search";
import { getCostAnalytics, getFileHeatmap, getHealthAnalytics, getSessionCost, getStaleAnalytics } from "../scanner/session-analytics";
import { getSessionCommits } from "../scanner/commit-linker";
import { getProjectDashboards } from "../scanner/project-dashboard";
import { getSessionDiffs } from "../scanner/session-diffs";
import { generateWeeklyDigest } from "../scanner/weekly-digest";
import { runAutoWorkflows } from "../scanner/auto-workflows";
import { getFileTimeline } from "../scanner/file-timeline";
import { runNLQuery } from "../scanner/nl-query";
import { getContinuationBrief } from "../scanner/continuation-detector";
import { getBashKnowledgeBase, searchBashCommands } from "../scanner/bash-knowledge";
import { getNerveCenterData } from "../scanner/nerve-center";
import { sessionParseCache } from "../scanner/session-cache";
import { parseSessionMessages, enrichMessagesWithTree } from "../scanner/session-parser";
import type { SessionTree, SessionTreeNode, SubagentRootNode, TimelineMessageType } from "@shared/session-types";
import { storage } from "../storage";
import crypto from "crypto";

/**
 * Wire shape of a `SessionTree` when returned over HTTP. Structurally
 * identical to `SessionTree` except the two `Map` fields become plain
 * objects keyed by node id / agentId — `JSON.stringify` turns `Map` into
 * `{}`, so the route converts them before serializing. Kept local to this
 * module; clients that consume the route can import
 * `SessionTree` from `@shared/session-types` and substitute these two
 * fields as `Record<string, SessionTreeNode>`.
 */
interface SerializedSessionTree extends Omit<SessionTree, "nodesById" | "subagentsByAgentId"> {
  nodesById: Record<string, SessionTreeNode>;
  // Narrower than `SessionTreeNode` — the builder only ever stores
  // `SubagentRootNode` values here. Clients can read subagent-specific
  // fields (`agentId`, `agentType`, `linkage`) without a type narrow.
  subagentsByAgentId: Record<string, SubagentRootNode>;
}

/** Convert a `SessionTree`'s `Map` fields to plain objects for JSON transport. */
function serializeSessionTree(tree: SessionTree): SerializedSessionTree {
  return {
    ...tree,
    nodesById: Object.fromEntries(tree.nodesById),
    subagentsByAgentId: Object.fromEntries(tree.subagentsByAgentId) as Record<string, SubagentRootNode>,
  };
}

/**
 * Parse the comma-separated `?include=` query param and test whether the
 * caller asked for a given section. Unknown values are silently ignored so
 * the API stays forgiving as new sections get added.
 */
function includesSection(raw: unknown, section: string): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  return raw.split(",").map(s => s.trim()).includes(section);
}

const router = Router();

/** Check if claude CLI is available */
function isClaudeAvailable(): boolean {
  try {
    const env = { ...process.env };
    delete (env as Record<string, string | undefined>).CLAUDECODE;
    execSync("claude --version", { env, stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function ensureTrashDir(): void {
  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
}

/** Move a session file to trash instead of deleting it. Returns the trash path. */
async function trashSession(filePath: string): Promise<string | null> {
  const safePath = await validateSafePath(filePath);
  if (!safePath) return null;
  ensureTrashDir();
  const basename = path.basename(safePath);
  // Add timestamp suffix to avoid collisions from concurrent deletes
  const trashPath = path.join(TRASH_DIR, `${basename}-${Date.now()}`).replace(/\\/g, "/");
  try {
    fs.copyFileSync(filePath, trashPath);
    fs.unlinkSync(filePath);
    // Also trash subdirectory if exists
    const subDir = filePath.replace(".jsonl", "");
    try {
      const stat = fs.statSync(subDir);
      if (stat.isDirectory()) {
        const trashSubDir = trashPath.replace(".jsonl", "");
        fs.cpSync(subDir, trashSubDir, { recursive: true });
        fs.rmSync(subDir, { recursive: true });
      }
    } catch {
      // No subdirectory — that's fine
    }
    return trashPath;
  } catch (err) {
    console.error("[sessions] Failed to trash session:", (err as Error).message);
    return null;
  }
}

/** Restore a session file from trash back to its original path. */
function restoreFromTrash(trashPath: string, originalPath: string): boolean {
  try {
    // Ensure the target directory exists
    const dir = path.dirname(originalPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(trashPath, originalPath);
    fs.unlinkSync(trashPath);
    // Restore subdirectory if exists
    const trashSubDir = trashPath.replace(".jsonl", "");
    const origSubDir = originalPath.replace(".jsonl", "");
    try {
      const stat = fs.statSync(trashSubDir);
      if (stat.isDirectory()) {
        fs.cpSync(trashSubDir, origSubDir, { recursive: true });
        fs.rmSync(trashSubDir, { recursive: true });
      }
    } catch {
      // No subdirectory — that's fine
    }
    return true;
  } catch (err) {
    console.error("[sessions] Failed to restore session:", (err as Error).message);
    return false;
  }
}

// Track recent deletions for undo (kept in memory, cleared on server restart)
interface DeleteRecord {
  id: string;
  trashPath: string;
  originalPath: string;
  sessionSnapshot: import("@shared/types").SessionData;
  timestamp: number;
}
let lastDeleteBatch: DeleteRecord[] = [];

/** GET /api/sessions — List sessions with search/filter/sort/pagination */
router.get("/api/sessions", (req: Request, res: Response) => {
  const params = validate(SessionListSchema, {
    q: qstr(req.query.q),
    sort: qstr(req.query.sort),
    order: qstr(req.query.order),
    hideEmpty: qstr(req.query.hideEmpty),
    activeOnly: qstr(req.query.activeOnly),
    project: qstr(req.query.project),
    page: qstr(req.query.page),
    limit: qstr(req.query.limit),
  }, res);
  if (!params) return;

  const { q, sort, order, hideEmpty, activeOnly, project, page, limit } = params;

  let sessions = getCachedSessions();
  const stats = getCachedStats();

  if (project) {
    // Find the project entity to get its real path, then encode for matching
    const projectEntities = storage.getEntities("project");
    const matchedProject = projectEntities.find(
      (p) => p.data.dirName === project || p.name === project || p.id === project
    );
    if (matchedProject) {
      const encodedPath = encodeProjectKey(matchedProject.path);
      sessions = sessions.filter(s => s.projectKey === encodedPath);
    } else {
      // Fallback: check cwd for substring match
      sessions = sessions.filter(s => s.projectKey === project || s.cwd.includes(project));
    }
  }
  if (hideEmpty === "true") sessions = sessions.filter(s => !s.isEmpty);
  if (activeOnly === "true") sessions = sessions.filter(s => s.isActive);
  if (q) {
    const lowerQ = q.toLowerCase();
    sessions = sessions.filter(s => {
      const haystack = [s.firstMessage, s.slug, s.id].join(" ").toLowerCase();
      return haystack.includes(lowerQ);
    });
  }

  const asc = order === "asc";
  sessions = [...sessions].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (sort === "lastTs") { av = a.lastTs || ""; bv = b.lastTs || ""; }
    else if (sort === "firstTs") { av = a.firstTs || ""; bv = b.firstTs || ""; }
    else if (sort === "sizeBytes") { av = a.sizeBytes; bv = b.sizeBytes; }
    else if (sort === "messageCount") { av = a.messageCount; bv = b.messageCount; }
    else if (sort === "slug") { av = a.slug.toLowerCase(); bv = b.slug.toLowerCase(); }
    else { av = a.lastTs || ""; bv = b.lastTs || ""; }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  const total = sessions.length;
  const totalPages = Math.ceil(total / limit);
  const cappedTotal = Math.min(total, MAX_SESSIONS_RESPONSE);
  const start = (page - 1) * limit;
  const paged = sessions.slice(start, Math.min(start + limit, cappedTotal));

  // Annotate sessions with summary, pin, and note data
  const summaries = storage.getSummaries();
  const pinnedSet = new Set(storage.getPinnedSessions());
  const notes = storage.getNotes();
  const annotated = paged.map(s => {
    const summary = summaries[s.id];
    return {
      ...s,
      hasSummary: !!summary,
      summaryTopics: summary?.topics || [],
      summaryOutcome: summary?.outcome || null,
      isPinned: pinnedSet.has(s.id),
      note: notes[s.id]?.text || undefined,
    };
  });

  res.json({
    sessions: annotated,
    stats,
    canUndo: lastDeleteBatch.length > 0,
    pagination: { page, limit, total, totalPages },
  });
});

/** GET /api/sessions/names — Get all custom session names */
router.get("/api/sessions/names", (_req: Request, res: Response) => {
  res.json(storage.getSessionNames());
});

/** GET /api/sessions/search — Deep search across all session content */
router.get("/api/sessions/search", async (req: Request, res: Response) => {
  const params = validate(DeepSearchSchema, {
    q: qstr(req.query.q),
    field: qstr(req.query.field),
    dateFrom: qstr(req.query.dateFrom),
    dateTo: qstr(req.query.dateTo),
    project: qstr(req.query.project),
    limit: qstr(req.query.limit),
  }, res);
  if (!params) return;

  try {
    const sessions = getCachedSessions();
    const summaries = storage.getSummaries();
    const result = await deepSearch({
      query: params.q,
      sessions,
      field: params.field,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      project: params.project,
      summaries,
      limit: params.limit,
    });
    res.json(result);
  } catch (err) {
    console.error("[sessions] Deep search failed:", (err as Error).message);
    res.status(500).json({ message: "Search failed" });
  }
});

/** GET /api/sessions/analytics/costs — Cost analytics across all sessions */
router.get("/api/sessions/analytics/costs", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getCostAnalytics(sessions));
});

/** GET /api/sessions/analytics/files — File heatmap */
router.get("/api/sessions/analytics/files", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getFileHeatmap(sessions));
});

/** GET /api/sessions/analytics/health — Session health scores */
router.get("/api/sessions/analytics/health", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getHealthAnalytics(sessions));
});

/** GET /api/sessions/analytics/stale — Stale session suggestions */
router.get("/api/sessions/analytics/stale", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getStaleAnalytics(sessions));
});

/** POST /api/sessions/context-loader — Generate context prompt for a project */
router.post("/api/sessions/context-loader", (req: Request, res: Response) => {
  const project = (req.body as { project?: string })?.project;
  if (!project) return res.status(400).json({ message: "project is required" });

  const sessions = getCachedSessions();
  const summaries = storage.getSummaries();

  // Find sessions for this project using encoding-based matching
  const projectEntities = storage.getEntities("project");
  const matchedProject = projectEntities.find(
    (p) => p.data.dirName === project || p.name === project || p.id === project
  );
  const encodedPath = matchedProject ? encodeProjectKey(matchedProject.path) : null;
  const projectSessions = sessions
    .filter(s => {
      if (encodedPath) return s.projectKey === encodedPath;
      return s.projectKey === project || s.cwd.includes(project);
    })
    .sort((a, b) => (b.lastTs || "").localeCompare(a.lastTs || ""));

  const relevantSessions = projectSessions.slice(0, 10);
  const parts: string[] = [];
  parts.push(`# Context from ${relevantSessions.length} recent sessions for "${project}"\n`);

  let tokensEstimate = 0;
  let used = 0;

  for (const s of relevantSessions) {
    const summary = summaries[s.id];
    if (summary) {
      parts.push(`## Session: ${s.firstMessage?.slice(0, 80) || s.slug}`);
      parts.push(`- Date: ${s.lastTs?.slice(0, 10) || "unknown"}`);
      parts.push(`- Outcome: ${summary.outcome}`);
      parts.push(`- Topics: ${summary.topics.join(", ")}`);
      parts.push(`- Summary: ${summary.summary}`);
      if (summary.filesModified.length > 0) {
        parts.push(`- Files: ${summary.filesModified.join(", ")}`);
      }
      parts.push("");
      used++;
    } else {
      parts.push(`## Session: ${s.firstMessage?.slice(0, 80) || s.slug}`);
      parts.push(`- Date: ${s.lastTs?.slice(0, 10) || "unknown"} | ${s.messageCount} messages`);
      parts.push("");
      used++;
    }
  }

  const prompt = parts.join("\n");
  tokensEstimate = Math.round(prompt.length / 4);

  res.json({ prompt, sessionsUsed: used, tokensEstimate });
});

/** GET /api/sessions/analytics/projects — Project dashboards */
router.get("/api/sessions/analytics/projects", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getProjectDashboards(sessions));
});

/** GET /api/sessions/analytics/digest — Weekly digest */
router.get("/api/sessions/analytics/digest", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(generateWeeklyDigest(sessions));
});

/** GET /api/sessions/prompts — List prompt templates */
router.get("/api/sessions/prompts", (_req: Request, res: Response) => {
  res.json(storage.getPromptTemplates());
});

/** POST /api/sessions/prompts — Create prompt template */
router.post("/api/sessions/prompts", (req: Request, res: Response) => {
  const body = req.body as { name?: string; description?: string; prompt?: string; project?: string; tags?: string[] };
  if (!body.name || !body.prompt) return res.status(400).json({ message: "name and prompt are required" });

  const template = {
    id: crypto.randomUUID(),
    name: body.name.slice(0, 200),
    description: (body.description || "").slice(0, 500),
    prompt: body.prompt.slice(0, 5000),
    project: body.project?.slice(0, 200),
    tags: (body.tags || []).slice(0, 10).map(t => String(t).slice(0, 50)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
  };

  storage.upsertPromptTemplate(template);
  res.json(template);
});

/** PATCH /api/sessions/prompts/:id — Update prompt template */
router.patch("/api/sessions/prompts/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = storage.getPromptTemplate(id);
  if (!existing) return res.status(404).json({ message: "Template not found" });

  const body = req.body as Partial<{ name: string; description: string; prompt: string; tags: string[]; isFavorite: boolean }>;
  const updated = {
    ...existing,
    ...(body.name !== undefined && { name: body.name.slice(0, 200) }),
    ...(body.description !== undefined && { description: body.description.slice(0, 500) }),
    ...(body.prompt !== undefined && { prompt: body.prompt.slice(0, 5000) }),
    ...(body.tags !== undefined && { tags: body.tags.slice(0, 10).map(t => String(t).slice(0, 50)) }),
    ...(body.isFavorite !== undefined && { isFavorite: body.isFavorite }),
    updatedAt: new Date().toISOString(),
  };

  storage.upsertPromptTemplate(updated);
  res.json(updated);
});

/** DELETE /api/sessions/prompts/:id — Delete prompt template */
router.delete("/api/sessions/prompts/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!storage.getPromptTemplate(id)) return res.status(404).json({ message: "Template not found" });
  storage.deletePromptTemplate(id);
  res.json({ message: "Deleted" });
});

/** GET /api/sessions/workflows — Get workflow config */
router.get("/api/sessions/workflows", (_req: Request, res: Response) => {
  res.json(storage.getWorkflowConfig());
});

/** PATCH /api/sessions/workflows — Update workflow config */
router.patch("/api/sessions/workflows", (req: Request, res: Response) => {
  const body = req.body as Partial<import("@shared/types").WorkflowConfig>;
  const updated = storage.updateWorkflowConfig(body);
  res.json(updated);
});

/** POST /api/sessions/workflows/run — Run auto-workflows manually */
router.post("/api/sessions/workflows/run", async (_req: Request, res: Response) => {
  try {
    const sessions = getCachedSessions();
    const result = await runAutoWorkflows(sessions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/** POST /api/sessions/pin/:id — Toggle pin */
router.post("/api/sessions/pin/:id", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(String(req.params.id));
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });
  const isPinned = storage.togglePin(idResult.data);
  res.json({ sessionId: idResult.data, isPinned });
});

/** PATCH /api/sessions/:id/name — Set or clear custom session name */
router.patch("/api/sessions/:id/name", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(String(req.params.id));
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });
  const name = (req.body as { name?: string })?.name;
  if (typeof name !== "string") return res.status(400).json({ message: "name is required (string)" });
  const trimmed = name.trim();
  if (trimmed === "") {
    storage.deleteSessionName(idResult.data);
  } else {
    storage.setSessionName(idResult.data, trimmed);
  }
  res.json({ sessionId: idResult.data, name: trimmed || null });
});

/** GET /api/sessions/file-timeline — Timeline of changes to a file across sessions */
router.get("/api/sessions/file-timeline", (req: Request, res: Response) => {
  const filePath = qstr(req.query.path);
  if (!filePath) return res.status(400).json({ message: "path parameter is required" });
  const sessions = getCachedSessions();
  res.json(getFileTimeline(sessions, filePath));
});

/** POST /api/sessions/nl-query — Natural language query */
router.post("/api/sessions/nl-query", async (req: Request, res: Response) => {
  if (!isClaudeAvailable()) return res.status(503).json({ message: "Claude Code CLI not installed — required for natural language queries" });
  const question = (req.body as { question?: string })?.question;
  if (!question || question.length < 3) return res.status(400).json({ message: "question is required (min 3 chars)" });
  try {
    const sessions = getCachedSessions();
    const result = await runNLQuery(question.slice(0, 500), sessions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/** GET /api/sessions/continuations — Unfinished work that needs attention */
router.get("/api/sessions/continuations", async (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(await getContinuationBrief(sessions));
});

/** GET /api/sessions/analytics/bash — Bash command knowledge base */
router.get("/api/sessions/analytics/bash", (_req: Request, res: Response) => {
  const sessions = getCachedSessions();
  res.json(getBashKnowledgeBase(sessions));
});

/** GET /api/sessions/analytics/bash/search — Search bash commands */
router.get("/api/sessions/analytics/bash/search", (req: Request, res: Response) => {
  const q = qstr(req.query.q);
  if (!q) return res.status(400).json({ message: "q parameter required" });
  const sessions = getCachedSessions();
  res.json(searchBashCommands(sessions, q));
});

/** GET /api/sessions/nerve-center — Operations nerve center */
router.get("/api/sessions/nerve-center", async (_req: Request, res: Response) => {
  try {
    const sessions = getCachedSessions();
    res.json(await getNerveCenterData(sessions));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * GET /api/sessions/:id — Session detail with message timeline.
 *
 * Opt-in query params (`?include=<csv>`):
 *   - `tree` — include the cached `SessionTree` built by the scanner.
 *     When requested, `tree` is either a `SerializedSessionTree` (cache
 *     hit) or `null` (no tree populated yet / session unknown to scanner).
 *     When absent, the `tree` field is omitted entirely so the default
 *     response shape is byte-compatible with pre-`include=tree` clients.
 *   Unknown include values are silently ignored — keeps the API forgiving.
 */
router.get("/api/sessions/:id", async (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const session = getCachedSessions().find(s => s.id === idResult.data);
  if (!session) return res.status(404).json({ message: "Session not found" });

  const safePath = await validateSafePath(session.filePath);
  if (!safePath) return res.status(403).json({ message: "Session file path outside allowed directory" });

  const records = readMessageTimeline(safePath);
  const parsed = sessionParseCache.getById(session.id);

  const wantTree = includesSection(qstr(req.query.include), "tree");
  if (wantTree) {
    const tree = sessionParseCache.getTreeById(session.id);
    // Read-only against the cache — no parse/build here. If the scanner
    // has not visited this session yet the client gets `tree: null` and
    // can retry.
    res.json({ ...session, records, parsed: parsed ?? null, tree: tree ? serializeSessionTree(tree) : null });
    return;
  }

  res.json({ ...session, records, parsed: parsed ?? null });
});

/** Find the JSONL file for a session across all project dirs */
function findSessionJsonl(sessionId: string): string | null {
  const projectsDir = path.join(CLAUDE_DIR, "projects").replace(/\\/g, "/");
  if (!dirExists(projectsDir)) return null;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const jsonlPath = path.join(projectsDir, dir.name, `${sessionId}.jsonl`).replace(/\\/g, "/");
      if (fs.existsSync(jsonlPath)) return jsonlPath;
    }
  } catch {}
  return null;
}

/**
 * Valid values for `?types=` — narrows the timeline to a subset of the
 * seven kinds. Unknown names are silently ignored (forgiving API).
 */
const TIMELINE_MESSAGE_TYPES: ReadonlySet<TimelineMessageType> = new Set<TimelineMessageType>([
  "user_text",
  "assistant_text",
  "thinking",
  "tool_call",
  "tool_result",
  "system_event",
  "skill_invocation",
]);

function parseTypesFilter(raw: unknown): Set<TimelineMessageType> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const picked = new Set<TimelineMessageType>();
  for (const part of raw.split(",")) {
    const t = part.trim() as TimelineMessageType;
    if (TIMELINE_MESSAGE_TYPES.has(t)) picked.add(t);
  }
  return picked.size > 0 ? picked : undefined;
}

/**
 * GET /api/sessions/:id/messages — Typed, paginated conversation timeline.
 *
 * Query params:
 *  - `offset`, `limit` — pagination (limit clamped to 1..500)
 *  - `types` — comma-separated list of message types to include (see
 *    `TimelineMessageType`). Empty / missing means "all seven."
 *  - `include=tree` — opt-in enrichment. When present, each message gains
 *    a `treeNodeId` + `subagentContext` field computed from the cached
 *    `SessionTree`, and the response carries `meta.treeStatus`. When
 *    absent, the response is byte-identical to the unenriched shape.
 *
 * Tree enrichment mutates the message objects in place with two new keys.
 * The flattener leaves those keys undefined; adding them costs a single
 * pass and lets the frontend group messages by subagent without a second
 * API call. Missing/unbuilt tree → `meta.treeStatus: 'unavailable'` and
 * every message receives `treeNodeId: null`.
 */
router.get("/api/sessions/:id/messages", async (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const sessionId = idResult.data;

  // Find the JSONL file
  const jsonlPath = findSessionJsonl(sessionId);
  if (!jsonlPath) return res.status(404).json({ message: "Session file not found" });

  // Validate path before reading
  const safePath = await validateSafePath(jsonlPath);
  if (!safePath) return res.status(403).json({ message: "Path must be under user home directory" });

  // Pagination — keep defaults generous so a small UI can fetch in one shot.
  const offset = Math.max(0, parseInt(qstr(req.query.offset) || "0", 10) || 0);
  const limit = Math.min(500, Math.max(1, parseInt(qstr(req.query.limit) || "200", 10) || 200));

  const typesFilter = parseTypesFilter(qstr(req.query.types));
  const { messages, totalMessages } = parseSessionMessages(safePath, offset, limit, typesFilter);

  const wantTree = includesSection(qstr(req.query.include), "tree");
  if (wantTree) {
    const tree = sessionParseCache.getTreeByPath(safePath);
    const { status } = enrichMessagesWithTree(messages, tree);
    res.json({
      sessionId,
      totalMessages,
      messages,
      meta: { treeStatus: status },
    });
    return;
  }

  res.json({
    sessionId,
    totalMessages,
    messages,
  });
});

/** GET /api/sessions/:id/diffs — File changes made in session */
router.get("/api/sessions/:id/diffs", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const session = getCachedSessions().find(s => s.id === idResult.data);
  if (!session) return res.status(404).json({ message: "Session not found" });

  res.json(getSessionDiffs(session));
});

/** GET /api/sessions/:id/note — Get session note */
router.get("/api/sessions/:id/note", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });
  const note = storage.getNote(idResult.data);
  if (!note) return res.status(404).json({ message: "No note" });
  res.json(note);
});

/** PUT /api/sessions/:id/note — Create/update session note */
router.put("/api/sessions/:id/note", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });
  const text = (req.body as { text?: string })?.text;
  if (typeof text !== "string") return res.status(400).json({ message: "text is required" });
  if (text.length === 0) {
    storage.deleteNote(idResult.data);
    return res.json({ message: "Note deleted" });
  }
  const note = storage.upsertNote(idResult.data, text.slice(0, 2000));
  res.json(note);
});

/** GET /api/sessions/:id/costs — Per-session cost breakdown */
router.get("/api/sessions/:id/costs", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const sessions = getCachedSessions();
  const cost = getSessionCost(sessions, idResult.data);
  if (!cost) return res.status(404).json({ message: "No cost data found" });

  res.json(cost);
});

/** GET /api/sessions/:id/commits — Git commits linked to session */
router.get("/api/sessions/:id/commits", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const session = getCachedSessions().find(s => s.id === idResult.data);
  if (!session) return res.status(404).json({ message: "Session not found" });

  const commits = getSessionCommits(session);
  res.json({ sessionId: session.id, commits });
});

/** GET /api/sessions/:id/summary — Get stored summary for a session */
router.get("/api/sessions/:id/summary", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const summary = storage.getSummary(idResult.data);
  if (!summary) return res.status(404).json({ message: "No summary found for this session" });

  res.json(summary);
});

/** DELETE /api/sessions/:id — Delete a single session (moves to trash) */
router.delete("/api/sessions/:id", async (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const session = getCachedSessions().find(s => s.id === idResult.data);
  if (!session) return res.status(404).json({ message: "Session not found" });

  const trashPath = await trashSession(session.filePath);
  if (!trashPath) return res.status(500).json({ message: "Failed to move to trash" });

  const snapshot = { ...session };
  removeCachedSession(session.id);
  storage.cleanupSessionData(session.id);
  lastDeleteBatch = [{ id: session.id, trashPath, originalPath: session.filePath, sessionSnapshot: snapshot, timestamp: Date.now() }];
  res.json({ message: "Deleted", id: session.id, canUndo: true });
});

/** DELETE /api/sessions — Bulk delete (moves to trash) */
router.delete("/api/sessions", async (req: Request, res: Response) => {
  const parsed = validate(IdsArraySchema, (req.body as { ids?: string[] })?.ids, res);
  if (!parsed) return;

  const deleted: string[] = [];
  const failed: string[] = [];
  const batch: DeleteRecord[] = [];

  for (const id of parsed) {
    const session = getCachedSessions().find(s => s.id === id);
    if (!session) { failed.push(id); continue; }
    const trashPath = await trashSession(session.filePath);
    if (trashPath) {
      batch.push({ id, trashPath, originalPath: session.filePath, sessionSnapshot: { ...session }, timestamp: Date.now() });
      removeCachedSession(id);
      storage.cleanupSessionData(id);
      deleted.push(id);
    } else {
      failed.push(id);
    }
  }

  lastDeleteBatch = batch;
  res.json({ deleted, failed, canUndo: batch.length > 0 });
});

/** POST /api/sessions/delete-all — Delete all sessions (moves to trash), skips pinned */
router.post("/api/sessions/delete-all", async (_req: Request, res: Response) => {
  const sessions = [...getCachedSessions()];
  if (sessions.length === 0) return res.json({ deleted: 0, skipped: 0, canUndo: false });

  const pinnedSet = new Set(storage.getPinnedSessions());
  const batch: DeleteRecord[] = [];
  let deleted = 0;
  let skipped = 0;

  for (const session of sessions) {
    if (pinnedSet.has(session.id)) {
      skipped++;
      continue;
    }
    const trashPath = await trashSession(session.filePath);
    if (trashPath) {
      batch.push({ id: session.id, trashPath, originalPath: session.filePath, sessionSnapshot: { ...session }, timestamp: Date.now() });
      removeCachedSession(session.id);
      storage.cleanupSessionData(session.id);
      deleted++;
    }
  }

  lastDeleteBatch = batch;
  res.json({ deleted, skipped, canUndo: batch.length > 0 });
});

/** POST /api/sessions/undo — Restore last deleted batch from trash */
router.post("/api/sessions/undo", (_req: Request, res: Response) => {
  if (lastDeleteBatch.length === 0) {
    return res.status(400).json({ message: "Nothing to undo" });
  }

  let restored = 0;
  for (const record of lastDeleteBatch) {
    if (restoreFromTrash(record.trashPath, record.originalPath)) {
      restoreCachedSession(record.sessionSnapshot);
      restored++;
    }
  }

  const count = lastDeleteBatch.length;
  lastDeleteBatch = [];
  res.json({ message: `Restored ${restored} of ${count} sessions`, restored });
});

/** POST /api/sessions/:id/open — Open in CLI */
router.post("/api/sessions/:id/open", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(req.params.id);
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });

  const session = getCachedSessions().find(s => s.id === idResult.data);
  if (!session) return res.status(404).json({ message: "Session not found" });

  try {
    const env = { ...process.env, CLAUDECODE: undefined };
    const plat = process.platform;
    const rawCwd = session.cwd || process.cwd();
    const cwd = rawCwd.replace(/[^a-zA-Z0-9\s/\\:._\-]/g, "");
    const sid = session.id.replace(/[^a-f0-9-]/gi, "");
    let child;
    if (plat === "win32") {
      const winCwd = cwd.replace(/\//g, "\\");
      child = spawn("cmd", ["/c", "start", "Claude", "cmd", "/k", `cd /d "${winCwd}" && claude --resume ${sid}`], {
        detached: true, stdio: "ignore", env: env as NodeJS.ProcessEnv,
      });
    } else if (plat === "darwin") {
      const safeCwd = cwd.replace(/'/g, "'\\''");
      child = spawn("osascript", ["-e", `tell application "Terminal" to do script "cd '${safeCwd}' && claude --resume ${sid}"`], {
        detached: true, stdio: "ignore", env: env as NodeJS.ProcessEnv,
      });
    } else {
      const safeCwd = cwd.replace(/'/g, "'\\''");
      child = spawn("x-terminal-emulator", ["-e", "bash", "-c", `cd '${safeCwd}' && claude --resume ${sid}`], {
        detached: true, stdio: "ignore", env: env as NodeJS.ProcessEnv,
      });
    }
    child.on("error", () => {});
    child.unref();
    res.json({ message: `Opened terminal in ${cwd} with --resume ${session.id}`, id: session.id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
