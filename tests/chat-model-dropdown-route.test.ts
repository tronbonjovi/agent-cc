/**
 * Route-level tests for the model-dropdown passthrough — chat-composer-controls
 * task003.
 *
 * Verifies POST /api/chat/prompt reads `model` from the request body and
 * forwards it into the `runClaudeStreaming(...)` options object. Runner-side
 * CLI-arg tests live in `chat-model-dropdown.test.ts`; split because that file
 * uses `vi.mock('child_process')`, which collides with this file's
 * `vi.mock('../server/scanner/claude-runner')` (vitest hoists `vi.mock` per
 * file, so both mocks can't coexist).
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

describe("POST /api/chat/prompt — model passthrough", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    // Zero out any session state from earlier tests so we don't accidentally
    // hit the --resume branch and mask a model-forwarding regression.
    const db = getDB();
    db.chatSessions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards `model` from the request body into runClaudeStreaming", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-model",
      text: "hello",
      model: "claude-opus-4-6",
    });
    expect(res.status).toBe(200);

    // Fire-and-forget — give the async IIFE a tick to call the mocked runner.
    await new Promise((r) => setTimeout(r, 20));

    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.prompt).toBe("hello");
    expect(opts.model).toBe("claude-opus-4-6");
  });

  it("omits `model` when the request body doesn't include it", async () => {
    // Back-compat: existing clients that don't know about the new field must
    // still work — the runner gets `undefined` for model and falls back to
    // the CLI default.
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-nomodel",
      text: "hello",
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 20));

    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBeUndefined();
  });

  it("forwards model and sessionId together on a resumed conversation", async () => {
    // Regression guard: the existing --resume path must coexist with the new
    // --model flag without one clobbering the other in the POST handler.
    const db = getDB();
    db.chatSessions["c-both"] = {
      sessionId: "existing-uuid",
      title: "t",
      createdAt: new Date().toISOString(),
    };

    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-both",
      text: "follow up",
      model: "claude-sonnet-4-6",
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.sessionId).toBe("existing-uuid");
    expect(opts.model).toBe("claude-sonnet-4-6");
  });
});
