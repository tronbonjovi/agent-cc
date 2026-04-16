/**
 * Route-level tests for chat conversation continuity — chat-ux-cleanup task002.
 *
 * Verifies the POST /api/chat/prompt handler looks up the stored CLI session
 * ID for the conversation before spawning and passes it to runClaudeStreaming.
 * Runner-side tests (CLI args) live in `chat-continuity.test.ts` — split
 * because that file uses `vi.mock('child_process')`, which is incompatible
 * with this file's `vi.mock('../server/scanner/claude-runner')`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/scanner/claude-runner", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../server/scanner/claude-runner")
  >();
  return {
    ...actual,
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

import chatRouter from "../server/routes/chat";
import {
  isClaudeAvailable,
  runClaudeStreaming,
} from "../server/scanner/claude-runner";
import { getDB } from "../server/db";

const mockedIsClaudeAvailable =
  isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming =
  runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;

async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

describe("POST /api/chat/prompt — session ID resumption", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    // Clear chatSessions between tests so state from earlier cases doesn't
    // leak into assertions about "brand-new conversations".
    const db = getDB();
    db.chatSessions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("omits sessionId for a brand-new conversation (no stored mapping)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "fresh-conv", text: "hi" });
    expect(res.status).toBe(200);

    // Wait for fire-and-forget to call the streaming fn
    await new Promise((r) => setTimeout(r, 20));

    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.prompt).toBe("hi");
    expect(opts.sessionId).toBeUndefined();
  });

  it("passes stored sessionId on second prompt to same conversation", async () => {
    // Pre-populate db.chatSessions as if the first prompt had already captured
    // a session ID from the CLI's init envelope.
    const db = getDB();
    db.chatSessions["conv-repeat"] = {
      sessionId: "stored-session-uuid",
      title: "earlier prompt",
      createdAt: new Date().toISOString(),
    };

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "conv-repeat", text: "follow-up" });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 20));

    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.prompt).toBe("follow-up");
    expect(opts.sessionId).toBe("stored-session-uuid");
  });

  it("passes sessionId only for conversations that have one", async () => {
    const db = getDB();
    db.chatSessions["has-session"] = {
      sessionId: "known-id",
      title: "t",
      createdAt: new Date().toISOString(),
    };
    // "no-session" is intentionally absent from the map.

    const app = buildApp();

    const res1 = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "has-session", text: "a" });
    expect(res1.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const res2 = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "no-session", text: "b" });
    expect(res2.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const firstCall = mockedRunClaudeStreaming.mock.calls[0][0];
    const secondCall = mockedRunClaudeStreaming.mock.calls[1][0];
    expect(firstCall.sessionId).toBe("known-id");
    expect(secondCall.sessionId).toBeUndefined();
  });
});
