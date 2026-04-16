/**
 * Unified-capture E2E integration test — updated for chat-scanner-unification.
 *
 * The chat route no longer persists InteractionEvents to SQLite (the CLI's own
 * JSONL session file is the source of truth now). This test verifies:
 *
 *   1. POST /api/chat/prompt still returns 200 and streams chunks to SSE
 *   2. No insertEvent calls are made (persistence is gone)
 *   3. Session ID is captured from stream init and stored in chatSessions
 *   4. The conversation listing routes have been removed (404)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the claude-runner module.
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

// Mock the db module so we can assert on chatSessions writes.
vi.mock("../server/db", () => {
  const mockData = {
    chatSessions: {} as Record<string, { tabId: string; startedAt: string }>,
    chatUIState: { openTabs: [], activeTabId: null, tabOrder: [] },
  };
  return {
    getDB: vi.fn(() => mockData),
    save: vi.fn(),
    __mockData: mockData,
  };
});

import chatRouter from "../server/routes/chat";
import { runClaudeStreaming } from "../server/scanner/claude-runner";
import { getDB, save } from "../server/db";

const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;
const mockedGetDB = getDB as unknown as ReturnType<typeof vi.fn>;
const mockedSave = save as unknown as ReturnType<typeof vi.fn>;

/** Async generator helper — yields the given chunks in order, then finishes. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

async function waitFor(
  pred: () => Promise<boolean> | boolean,
  timeoutMs = 2000,
) {
  const start = Date.now();
  while (true) {
    const ok = await pred();
    if (ok) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(() => {
  mockedRunClaudeStreaming.mockReset();
  mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  mockedSave.mockReset();
  const db = mockedGetDB();
  db.chatSessions = {};
});

describe("unified-capture E2E (post-unification)", () => {
  it("POST /prompt returns 200 and streams chunks without SQLite persistence", async () => {
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hi there" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const postRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "e2e-basic", text: "hello" });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);
  });

  it("captures session ID from stream init into chatSessions", async () => {
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "system",
          raw: {
            type: "system",
            subtype: "init",
            session_id: "sess-e2e-001",
          },
        },
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hi" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "tab-e2e", text: "hello" });

    await waitFor(() => mockedSave.mock.calls.length >= 1);

    const db = mockedGetDB();
    expect(db.chatSessions["sess-e2e-001"]).toBeDefined();
    expect(db.chatSessions["sess-e2e-001"].tabId).toBe("tab-e2e");
    expect(typeof db.chatSessions["sess-e2e-001"].startedAt).toBe("string");
  });

  it("conversation listing routes return 404 (removed)", async () => {
    const app = buildApp();

    const convRes = await request(app).get("/api/chat/conversations");
    expect(convRes.status).toBe(404);

    const allRes = await request(app).get("/api/chat/conversations/all");
    expect(allRes.status).toBe(404);

    const eventsRes = await request(app).get("/api/chat/conversations/some-id/events");
    expect(eventsRes.status).toBe(404);
  });
});
