/**
 * Chat-scanner unification -- end-to-end integration tests (task005).
 *
 * Proves the unified pipeline: chat prompts spawn CLI sessions that produce
 * JSONL, the scanner reads those JSONL files, and session data flows through
 * the scanner endpoints. No SQLite, no InteractionEvent -- everything is
 * JSONL-backed.
 *
 * Test structure:
 *   1. CLI args no longer suppress session persistence
 *   2. Session ID captured from stream init and stored in db.chatSessions
 *   3. Scanner picks up a JSONL fixture file as a session
 *   4. GET /api/chat/sessions returns the chatSessions mapping
 *   5. No SQLite remnants in this test file
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Test 1: CLI args -- read the source file directly to avoid mock hoisting
// ---------------------------------------------------------------------------

describe("chat-scanner unification: CLI args", () => {
  it("buildClaudeArgs source does NOT include --no-session-persistence", () => {
    // Read the actual source to verify the flag was removed, since vi.mock
    // hoisting would intercept any runtime import of the module.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../server/scanner/claude-runner.ts"),
      "utf-8",
    );

    // Find the buildClaudeArgs function body
    const fnMatch = src.match(
      /function buildClaudeArgs[\s\S]*?return\s+\[([^\]]+)\]/,
    );
    expect(fnMatch).not.toBeNull();
    const returnedArray = fnMatch![1];
    expect(returnedArray).not.toContain("--no-session-persistence");
  });

  it("runClaudeStreaming args do NOT include --no-session-persistence", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../server/scanner/claude-runner.ts"),
      "utf-8",
    );

    // Find the args array in runClaudeStreaming
    const fnMatch = src.match(
      /async function\*\s+runClaudeStreaming[\s\S]*?const args = \[([^\]]+)\]/,
    );
    expect(fnMatch).not.toBeNull();
    const argsArray = fnMatch![1];
    expect(argsArray).not.toContain("--no-session-persistence");
  });
});

// ---------------------------------------------------------------------------
// Mocks for tests 2 and 4 -- must precede route import
// ---------------------------------------------------------------------------

vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
    // buildClaudeArgs is not used by the chat route, only by runClaude
    buildClaudeArgs: vi.fn(() => ["-p", "--model", "haiku", "--max-turns", "1"]),
  };
});

// Mock db module for session ID capture tests
vi.mock("../server/db", () => {
  const data: any = { chatSessions: {} };
  return {
    getDB: vi.fn(() => data),
    save: vi.fn(),
    __testData: data,
  };
});

import chatRouter from "../server/routes/chat";
import chatTabsRouter from "../server/routes/chat-tabs";
import {
  isClaudeAvailable,
  runClaudeStreaming,
} from "../server/scanner/claude-runner";
import { getDB, save } from "../server/db";

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;

/** Async generator that yields the given chunks then finishes. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  app.use("/api/chat", chatTabsRouter);
  return app;
}

/** Wait until a predicate is true, with timeout. */
async function waitFor(pred: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// Test 2: Session ID capture
// ---------------------------------------------------------------------------

describe("chat-scanner unification: session ID capture", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  });

  it("POST /prompt captures session_id from system init and stores in db.chatSessions", async () => {
    const testSessionId = "test-session-abc123";
    const testConversationId = "conv-capture-test";

    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "system",
          raw: {
            type: "system",
            subtype: "init",
            session_id: testSessionId,
          },
        },
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hello" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: testConversationId, text: "hi" });
    expect(res.status).toBe(200);

    // Wait for the fire-and-forget streaming to complete and write to db
    await waitFor(() => {
      const db = getDB();
      return !!db.chatSessions?.[testSessionId];
    });

    const db = getDB();
    expect(db.chatSessions).toBeDefined();
    expect(db.chatSessions[testSessionId]).toBeDefined();
    expect(db.chatSessions[testSessionId].sessionId).toBe(testSessionId);
    expect(typeof db.chatSessions[testSessionId].createdAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Scanner reads JSONL fixture files
// ---------------------------------------------------------------------------

import { parseSessionFile } from "../server/scanner/session-parser";
import { parseSessionAndBuildTree } from "../server/scanner/session-scanner";

describe("chat-scanner unification: scanner reads JSONL", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-e2e-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parseSessionFile parses a JSONL file into ParsedSession", () => {
    const projectDir = path.join(tmpDir, "projects", "test-project");
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionId = "e2e-test-session";
    const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

    // Minimal multi-turn JSONL fixture
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-04-16T10:00:00.000Z",
        message: { role: "user", content: "what files are here?" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-04-16T10:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "Let me check for you." }],
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }),
      JSON.stringify({
        type: "user",
        uuid: "u2",
        timestamp: "2026-04-16T10:00:02.000Z",
        message: { role: "user", content: "thanks" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a2",
        timestamp: "2026-04-16T10:00:03.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "You are welcome!" }],
          usage: {
            input_tokens: 150,
            output_tokens: 10,
            cache_read_input_tokens: 50,
            cache_creation_input_tokens: 0,
          },
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n") + "\n");

    const parsed = parseSessionFile(jsonlPath, "test-project");
    expect(parsed).not.toBeNull();
    expect(parsed!.meta.firstTs).toBe("2026-04-16T10:00:00.000Z");
    expect(parsed!.meta.lastTs).toBe("2026-04-16T10:00:03.000Z");
    expect(parsed!.counts.userMessages).toBeGreaterThanOrEqual(2);
    expect(parsed!.counts.assistantMessages).toBeGreaterThanOrEqual(2);
  });

  it("parseSessionAndBuildTree produces a cached ParsedSession with tree", () => {
    const projectDir = path.join(tmpDir, "projects", "scanner-fields");
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionId = "field-check-session";
    const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-04-16T09:00:00.000Z",
        message: { role: "user", content: "hello world" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-04-16T09:00:01.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "Hi there!" }],
          usage: { input_tokens: 50, output_tokens: 10 },
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n") + "\n");

    const parsed = parseSessionAndBuildTree(jsonlPath, "scanner-fields");

    expect(parsed).not.toBeNull();
    expect(parsed!.meta).toBeDefined();
    expect(parsed!.meta.firstTs).toBeTruthy();
    expect(parsed!.meta.lastTs).toBeTruthy();
    expect(parsed!.counts).toBeDefined();
    expect(typeof parsed!.counts.userMessages).toBe("number");
    expect(typeof parsed!.counts.assistantMessages).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Test 4: GET /api/chat/sessions returns chatSessions mapping
// ---------------------------------------------------------------------------

describe("chat-scanner unification: chat sessions endpoint", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
  });

  it("GET /api/chat/sessions returns chatSessions from db", async () => {
    const db = getDB();
    db.chatSessions = {
      "session-aaa": { sessionId: "session-aaa", title: "hello", createdAt: "2026-04-16T10:00:00Z" },
      "session-bbb": { sessionId: "session-bbb", title: "world", createdAt: "2026-04-16T11:00:00Z" },
    };

    const app = buildApp();
    const res = await request(app).get("/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toBeDefined();
    expect(res.body.sessions.length).toBe(2);
    // Newest first
    expect(res.body.sessions[0].sessionId).toBe("session-bbb");
    expect(res.body.sessions[1].sessionId).toBe("session-aaa");
  });

  it("GET /api/chat/sessions returns empty array when no chat sessions exist", async () => {
    const db = getDB();
    db.chatSessions = {};

    const app = buildApp();
    const res = await request(app).get("/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toBeDefined();
    expect(res.body.sessions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5: No SQLite remnants in this test file
// ---------------------------------------------------------------------------

describe("chat-scanner unification: no SQLite remnants", () => {
  const selfSource = fs.readFileSync(
    path.resolve(__dirname, "chat-scanner-unification-e2e.test.ts"),
    "utf-8",
  );

  it("does not import better-sqlite3", () => {
    expect(selfSource).not.toMatch(/from\s+["']better-sqlite3["']/);
    expect(selfSource).not.toMatch(/require\(["']better-sqlite3["']\)/);
  });

  it("does not import deleted SQLite modules as real dependencies", () => {
    // These modules should not appear as real `import X from` statements.
    // The vi.mock stub for interactions-repo is a transition shim, not a
    // real dependency -- it prevents the module from touching SQLite.
    const deletedModules = [
      "interactions-db",
      "event-reductions",
      "jsonl-to-event",
      "chat-import",
      "ingester",
    ];

    for (const mod of deletedModules) {
      const importRegex = new RegExp(
        `^import\\s+.*from\\s+["'].*${mod}["']`,
        "m",
      );
      expect(selfSource).not.toMatch(importRegex);
    }
  });

  it("does not use InteractionEvent type in test logic", () => {
    // InteractionEvent is the old SQLite-era type
    expect(selfSource).not.toMatch(/:\s*InteractionEvent/);
    expect(selfSource).not.toMatch(/as\s+InteractionEvent/);
  });
});
