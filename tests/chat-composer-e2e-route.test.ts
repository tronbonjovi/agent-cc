/**
 * Chat composer controls — integration E2E, route-level half
 * (chat-composer-controls task008).
 *
 * Companion to `chat-composer-e2e.test.ts`. That file covers CLI-arg
 * emission via a real runner + `vi.mock('child_process')`; this file covers
 * the other seam — the route layer reading each field from the POST body
 * and forwarding it into `runClaudeStreaming(...)`'s options object.
 *
 * Split because `vi.mock('../server/scanner/claude-runner')` (this file)
 * cannot coexist with `vi.mock('child_process')` (the sibling file) in a
 * single module: the route imports the runner, so if the runner is mocked
 * the real `spawn` is never reached, and if `child_process` is mocked the
 * real runner tries to spawn a mocked child but the route's
 * `isClaudeAvailable()` check can't see through without a second level of
 * setup. Sibling tests in M chat-composer-controls (chat-model-dropdown,
 * chat-popover-controls, chat-project-selector) all use the same split —
 * we follow that precedent so the mock strategy is consistent across M.
 *
 * Dimensions verified here:
 *
 *   F. Route forwarding — POST /api/chat/prompt moves model / effort /
 *      thinking / webSearch / systemPrompt / projectPath from the body
 *      into runClaudeStreaming's options. This complements the direct-
 *      runner tests by proving the HTTP boundary is wired.
 *   G. Store-only fields (thinking + webSearch) — the route MUST forward
 *      them (so a future runner can pick them up) but the sibling runner
 *      test pins that no CLI flag is emitted today. This file's job is
 *      only the forwarding half.
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

// ---------------------------------------------------------------------------
// F. Route forwarding — every composer field reaches runClaudeStreaming opts
// ---------------------------------------------------------------------------

describe("M-chat-composer-controls E2E — F. POST body → runner opts", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    const db = getDB();
    db.chatSessions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards model from the POST body (claude-sonnet-4-6)", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-model-sonnet",
      text: "hi",
      model: "claude-sonnet-4-6",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBe("claude-sonnet-4-6");
  });

  it("forwards model from the POST body (claude-opus-4-6)", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-model-opus",
      text: "hi",
      model: "claude-opus-4-6",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBe("claude-opus-4-6");
  });

  it("leaves opts.model undefined when the body omits model", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-no-model",
      text: "hi",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBeUndefined();
  });

  it("forwards effort from the POST body", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-effort",
      text: "hi",
      effort: "high",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.effort).toBe("high");
  });

  it("forwards systemPrompt from the POST body", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-sys",
      text: "hi",
      systemPrompt: "You are a code reviewer",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.systemPrompt).toBe("You are a code reviewer");
  });

  it("forwards projectPath as cwd", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-proj",
      text: "hi",
      projectPath: "/home/tron/dev/projects/agent-cc",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBe("/home/tron/dev/projects/agent-cc");
  });

  it("leaves opts.cwd undefined when projectPath is omitted ('General')", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-gen",
      text: "hi",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.cwd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G. Store-only fields — route must forward thinking + webSearch
// ---------------------------------------------------------------------------
//
// Explicitly flagged: these two fields have no CLI flag today (the sibling
// chat-composer-e2e.test.ts pins "no flag emitted"). The route's job is
// purely to move them through the boundary so whenever M11's provider
// plumbing lands, a runner update alone unlocks the feature — no route
// change needed.

describe("M-chat-composer-controls E2E — G. store-only settings forwarding", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  });

  it("forwards thinking = true into runner opts (no CLI flag emitted — see sibling)", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-thinking",
      text: "hi",
      thinking: true,
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.thinking).toBe(true);
  });

  it("forwards webSearch = true into runner opts (no CLI flag emitted — see sibling)", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-ws",
      text: "hi",
      webSearch: true,
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.webSearch).toBe(true);
  });

  it("forwards ALL composer fields together on one call", async () => {
    // Regression guard: the fields coexist on the same POST body and the
    // route moves every one of them over. If a future refactor misses one
    // (e.g. forgets to destructure it), this composite test fails even if
    // the per-field cases above still pass — because the per-field tests
    // each only assert on *their* field, not on total coverage.
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "e2e-all",
      text: "hi",
      model: "claude-sonnet-4-6",
      effort: "low",
      thinking: true,
      webSearch: true,
      systemPrompt: "context",
      projectPath: "/home/tron/dev/projects/agent-cc",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.model).toBe("claude-sonnet-4-6");
    expect(opts.effort).toBe("low");
    expect(opts.thinking).toBe(true);
    expect(opts.webSearch).toBe(true);
    expect(opts.systemPrompt).toBe("context");
    expect(opts.cwd).toBe("/home/tron/dev/projects/agent-cc");
  });
});
