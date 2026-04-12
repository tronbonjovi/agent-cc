import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-cache-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

import { SessionParseCache } from "../server/scanner/session-cache";
import type { ParsedSession, SessionTree, SessionRootNode } from "../shared/session-types";

describe("SessionParseCache", () => {
  it("returns parsed sessions for valid files", () => {
    const fp = path.join(tmpDir, "sess-1.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const result = cache.getOrParse(fp, "test-key");
    expect(result).not.toBeNull();
    expect(result!.meta.sessionId).toBe("sess-1");
    expect(result!.meta.firstMessage).toBe("hello");
  });

  it("returns cached result on second call without re-reading", () => {
    const fp = path.join(tmpDir, "sess-2.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    const r2 = cache.getOrParse(fp, "test-key");
    // Same reference means cache was used
    expect(r1).toBe(r2);
  });

  it("re-parses when file size changes", () => {
    const fp = path.join(tmpDir, "sess-3.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");

    // Append more data
    fs.appendFileSync(fp, JSON.stringify({
      type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1",
      uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1",
      message: { id: "m1", role: "assistant", model: "test", type: "message",
        stop_reason: "end_turn", content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 10, output_tokens: 5 } },
    }) + "\n");

    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1); // Different reference = re-parsed
    expect(r2!.counts.assistantMessages).toBe(1);
  });

  it("invalidateAll clears all cached entries", () => {
    const fp = path.join(tmpDir, "sess-4.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    cache.invalidateAll();
    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1);
  });

  it("returns null for nonexistent file", () => {
    const cache = new SessionParseCache();
    expect(cache.getOrParse("/nonexistent/file.jsonl", "key")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Combined entry: ParsedSession + SessionTree (session-hierarchy-task004)
// ---------------------------------------------------------------------------

function makeSyntheticParsed(sessionId: string, filePath: string): ParsedSession {
  return {
    meta: {
      sessionId,
      slug: sessionId,
      firstMessage: "",
      firstTs: "2026-04-12T00:00:00.000Z",
      lastTs: "2026-04-12T00:00:01.000Z",
      sizeBytes: 0,
      filePath,
      projectKey: "test-key",
      cwd: "",
      version: "",
      gitBranch: "",
      entrypoint: "",
    },
    assistantMessages: [],
    userMessages: [],
    systemEvents: { turnDurations: [], hookSummaries: [], localCommands: [], bridgeEvents: [] },
    toolTimeline: [],
    fileSnapshots: [],
    lifecycle: [],
    conversationTree: [],
    counts: {
      totalRecords: 0,
      assistantMessages: 0,
      userMessages: 0,
      systemEvents: 0,
      toolCalls: 0,
      toolErrors: 0,
      fileSnapshots: 0,
      sidechainMessages: 0,
    },
  };
}

function makeSyntheticTree(sessionId: string): SessionTree {
  const root: SessionRootNode = {
    kind: "session-root",
    id: `session:${sessionId}`,
    parentId: null,
    children: [],
    timestamp: "2026-04-12T00:00:00.000Z",
    selfCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    rollupCost: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, durationMs: 0 },
    sessionId,
    slug: sessionId,
    firstMessage: "",
    firstTs: "2026-04-12T00:00:00.000Z",
    lastTs: "2026-04-12T00:00:01.000Z",
    filePath: "",
    projectKey: "test-key",
    gitBranch: "",
  };
  const nodesById = new Map();
  nodesById.set(root.id, root);
  return {
    root,
    nodesById,
    subagentsByAgentId: new Map(),
    totals: {
      assistantTurns: 0,
      userTurns: 0,
      toolCalls: 0,
      toolErrors: 0,
      subagents: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}

function writeMinimalJsonl(filePath: string, sessionId: string): void {
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      type: "user",
      timestamp: "2026-04-12T00:00:00Z",
      sessionId,
      uuid: "u1",
      parentUuid: "",
      isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n",
  );
}

describe("SessionParseCache — tree storage (task004)", () => {
  it("setEntry stores both parsed and tree, retrievable by id", () => {
    const fp = path.join(tmpDir, "tree-1.jsonl");
    writeMinimalJsonl(fp, "tree-1");

    const cache = new SessionParseCache();
    const parsed = makeSyntheticParsed("tree-1", fp);
    const tree = makeSyntheticTree("tree-1");
    cache.setEntry(fp, parsed, tree);

    expect(cache.getById("tree-1")).toBe(parsed);
    expect(cache.getTreeById("tree-1")).toBe(tree);
  });

  it("getTreeById returns null for unknown id", () => {
    const cache = new SessionParseCache();
    expect(cache.getTreeById("nope")).toBeNull();
  });

  it("getTreeByPath returns null for unknown path", () => {
    const cache = new SessionParseCache();
    expect(cache.getTreeByPath("/nonexistent/file.jsonl")).toBeNull();
  });

  it("getById and getTreeById return matching pair from the same setEntry call", () => {
    const fp = path.join(tmpDir, "tree-2.jsonl");
    writeMinimalJsonl(fp, "tree-2");

    const cache = new SessionParseCache();
    const parsed = makeSyntheticParsed("tree-2", fp);
    const tree = makeSyntheticTree("tree-2");
    cache.setEntry(fp, parsed, tree);

    const fetchedParsed = cache.getById("tree-2");
    const fetchedTree = cache.getTreeById("tree-2");
    expect(fetchedParsed).toBe(parsed);
    expect(fetchedTree).toBe(tree);
    // The tree's sessionId in its root must match the parsed session — they came together.
    expect((fetchedTree!.root as SessionRootNode).sessionId).toBe(fetchedParsed!.meta.sessionId);
  });

  it("invalidate drops both parsed and tree", () => {
    const fp = path.join(tmpDir, "tree-3.jsonl");
    writeMinimalJsonl(fp, "tree-3");

    const cache = new SessionParseCache();
    const parsed = makeSyntheticParsed("tree-3", fp);
    const tree = makeSyntheticTree("tree-3");
    cache.setEntry(fp, parsed, tree);

    expect(cache.getById("tree-3")).not.toBeNull();
    expect(cache.getTreeById("tree-3")).not.toBeNull();

    cache.invalidate(fp);

    expect(cache.getById("tree-3")).toBeNull();
    expect(cache.getTreeById("tree-3")).toBeNull();
  });

  it("getAll still returns parsed sessions only — no tree leakage in the return type", () => {
    const fp = path.join(tmpDir, "tree-4.jsonl");
    writeMinimalJsonl(fp, "tree-4");

    const cache = new SessionParseCache();
    const parsed = makeSyntheticParsed("tree-4", fp);
    const tree = makeSyntheticTree("tree-4");
    cache.setEntry(fp, parsed, tree);

    const all = cache.getAll();
    expect(all.size).toBe(1);
    const entry = all.get("tree-4");
    expect(entry).toBe(parsed);
    // Sanity: the returned value is a ParsedSession, not a wrapper containing a tree.
    expect((entry as unknown as { tree?: unknown }).tree).toBeUndefined();
  });
});
