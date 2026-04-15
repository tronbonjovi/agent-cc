/**
 * Tests for the chat SSE route — POST /api/chat/prompt + GET /api/chat/stream/:conversationId.
 * Mocks runClaudeStreaming and isClaudeAvailable so no real Claude subprocess is ever spawned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import http from "http";

// Mock the claude-runner module BEFORE importing the route under test.
// Must match the path used by server/routes/chat.ts (../scanner/claude-runner).
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

// Mock the interactions-repo so tests can assert on persistence calls without
// touching a real SQLite database. task004 wires chat.ts to this module.
vi.mock("../server/interactions-repo", () => {
  return {
    insertEvent: vi.fn(),
  };
});

import chatRouter from "../server/routes/chat";
import { isClaudeAvailable, runClaudeStreaming } from "../server/scanner/claude-runner";
import { insertEvent } from "../server/interactions-repo";
import type { InteractionEvent } from "../shared/types";

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;
const mockedInsertEvent = insertEvent as unknown as ReturnType<typeof vi.fn>;

/** Helper: async generator that yields the given chunks then finishes. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

describe("chat route", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedInsertEvent.mockReset();
    mockedInsertEvent.mockImplementation(() => {});
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("POST /prompt returns 400 without body fields", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("POST /prompt returns 400 when only conversationId is provided", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({ conversationId: "c1" });
    expect(res.status).toBe(400);
  });

  it("POST /prompt returns 503 when Claude CLI is not available", async () => {
    mockedIsClaudeAvailable.mockResolvedValue(false);
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c1", text: "hello" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not installed/i);
  });

  it("POST /prompt returns 200 with valid body", async () => {
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([{ type: "text", raw: { foo: "bar" } }, { type: "done", raw: null }]),
    );
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c1", text: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /stream/:conversationId sets correct SSE headers", async () => {
    const app = buildApp();
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const req = http.request(
          { hostname: "127.0.0.1", port, path: "/api/chat/stream/c1", method: "GET" },
          (res) => {
            try {
              expect(res.headers["content-type"]).toContain("text/event-stream");
              expect(res.headers["cache-control"]).toBe("no-cache");
              expect(res.headers["connection"]).toBe("keep-alive");
            } catch (e) {
              res.destroy();
              server.close();
              reject(e);
              return;
            }
            res.destroy();
            server.close();
            resolve();
          },
        );
        req.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") return;
          server.close();
          reject(err);
        });
        req.end();
      });
    });
  });

  it("end-to-end: POST /prompt pushes chunks to an open GET /stream", async () => {
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        { type: "text", raw: { m: "hi" } },
        { type: "done", raw: null },
      ]),
    );
    const app = buildApp();

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as { port: number }).port;
        const received: string[] = [];

        const streamReq = http.request(
          { hostname: "127.0.0.1", port, path: "/api/chat/stream/conv-1", method: "GET" },
          (res) => {
            // By the time this callback fires, the server has flushed SSE
            // headers — which means the route's synchronous block already
            // ran `activeStreams.set(...)`. Safe to POST now with no race.
            res.setEncoding("utf8");
            res.on("data", (data: string) => {
              received.push(data);
              const joined = received.join("");
              // Wait until we've seen both the "hi" text chunk and the "done" chunk.
              if (joined.includes('"type":"text"') && joined.includes('"type":"done"')) {
                try {
                  expect(joined).toContain('"m":"hi"');
                } catch (e) {
                  res.destroy();
                  server.close();
                  reject(e);
                  return;
                }
                res.destroy();
                server.close();
                resolve();
              }
            });

            // Fire the POST from inside the response callback — deterministic
            // replacement for the old 50ms setTimeout race window.
            (async () => {
              try {
                const postRes = await request(`http://127.0.0.1:${port}`)
                  .post("/api/chat/prompt")
                  .send({ conversationId: "conv-1", text: "hello" });
                if (postRes.status !== 200) {
                  server.close();
                  reject(new Error(`POST failed with ${postRes.status}`));
                }
              } catch (e) {
                server.close();
                reject(e);
              }
            })();
          },
        );
        streamReq.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") return;
          server.close();
          reject(err);
        });
        streamReq.end();
      });
    });
  });

  it("GET /stream emits a keepalive comment every 15s", async () => {
    // Invoke the GET handler directly with fake req/res objects so we can
    // run `vi.useFakeTimers()` without fighting the real HTTP socket pump.
    vi.useFakeTimers();

    const writes: string[] = [];
    const reqEventHandlers: Record<string, Array<() => void>> = {};
    const fakeReq: any = {
      params: { conversationId: "c-keep" },
      on(event: string, handler: () => void) {
        (reqEventHandlers[event] ??= []).push(handler);
      },
    };
    const fakeRes: any = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };

    // Walk the router stack to find the /stream/:conversationId handler.
    type Layer = {
      route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: any, res: any) => void }> };
    };
    const stack = (chatRouter as unknown as { stack: Layer[] }).stack;
    const streamLayer = stack.find(
      (l) => l.route?.path === "/stream/:conversationId" && l.route?.methods.get === true,
    );
    expect(streamLayer, "stream route layer not found").toBeTruthy();
    const handler = streamLayer!.route!.stack[0].handle;

    handler(fakeReq, fakeRes);

    // Advance 15s — exactly one keepalive tick should fire.
    vi.advanceTimersByTime(15000);
    expect(writes.some((w) => w.includes(": keepalive"))).toBe(true);

    // A second tick should emit another keepalive.
    const firstCount = writes.filter((w) => w.includes(": keepalive")).length;
    vi.advanceTimersByTime(15000);
    const secondCount = writes.filter((w) => w.includes(": keepalive")).length;
    expect(secondCount).toBeGreaterThan(firstCount);

    // Close the request — the handler should clear its interval.
    (reqEventHandlers["close"] ?? []).forEach((h) => h());
  });

  // -------------------------------------------------------------------------
  // task004 — chat write path persists InteractionEvents
  // -------------------------------------------------------------------------

  /** Small helper: wait until `pred` is true or the timeout fires. */
  async function waitFor(pred: () => boolean, timeoutMs = 1000) {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("waitFor timed out");
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  /** Collect all InteractionEvent arguments passed to insertEvent. */
  function persistedEvents(): InteractionEvent[] {
    return mockedInsertEvent.mock.calls.map((c) => c[0] as InteractionEvent);
  }

  it("POST /prompt persists a user event before streaming", async () => {
    // runClaudeStreaming yields nothing so the streaming block finishes fast.
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([{ type: "done", raw: null }]),
    );
    const app = buildApp();

    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c-user", text: "hello world" });
    expect(res.status).toBe(200);

    // The user event is inserted synchronously before dispatch — should be
    // the very first insertEvent call.
    await waitFor(() => mockedInsertEvent.mock.calls.length >= 1);

    const userEvent = persistedEvents()[0];
    expect(userEvent.conversationId).toBe("c-user");
    expect(userEvent.role).toBe("user");
    expect(userEvent.source).toBe("chat-ai");
    expect(userEvent.content).toEqual({ type: "text", text: "hello world" });
    expect(userEvent.cost).toBeNull();
    expect(typeof userEvent.id).toBe("string");
    expect(userEvent.id.length).toBeGreaterThan(0);
    expect(typeof userEvent.timestamp).toBe("string");
  });

  it("streaming text chunks coalesce into one assistant event", async () => {
    // Three text chunks in stream-json shape, then done.
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "hello " }] },
          },
        },
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "brave " }] },
          },
        },
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "world" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c-coalesce", text: "hi" });
    expect(res.status).toBe(200);

    // One user event + one assistant event = 2 total.
    await waitFor(() => mockedInsertEvent.mock.calls.length >= 2);

    const assistantEvents = persistedEvents().filter((e) => e.role === "assistant");
    expect(assistantEvents).toHaveLength(1);

    const [asst] = assistantEvents;
    expect(asst.content).toEqual({ type: "text", text: "hello brave world" });
    expect(asst.conversationId).toBe("c-coalesce");
    expect(asst.source).toBe("chat-ai");
  });

  it("non-text chunks are persisted as separate events", async () => {
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "working on it" }] },
          },
        },
        {
          type: "tool_call",
          raw: {
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "tool_123",
                  name: "Bash",
                  input: { command: "ls" },
                },
              ],
            },
          },
        },
        {
          type: "tool_result",
          raw: {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tool_123",
                  content: "file.txt",
                },
              ],
            },
          },
        },
        {
          type: "thinking",
          raw: {
            type: "assistant",
            message: {
              content: [{ type: "thinking", thinking: "pondering the result" }],
            },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c-tools", text: "run it" });
    expect(res.status).toBe(200);

    // user + assistant-text + tool_call + tool_result + thinking = 5 events.
    await waitFor(() => mockedInsertEvent.mock.calls.length >= 5);

    const events = persistedEvents();
    const byType = events.map((e) => e.content.type);
    expect(byType).toContain("tool_call");
    expect(byType).toContain("tool_result");
    expect(byType).toContain("thinking");

    const toolCall = events.find((e) => e.content.type === "tool_call");
    expect(toolCall).toBeTruthy();
    if (toolCall && toolCall.content.type === "tool_call") {
      expect(toolCall.content.toolName).toBe("Bash");
      expect(toolCall.content.toolUseId).toBe("tool_123");
      expect(toolCall.content.input).toEqual({ command: "ls" });
    }

    const toolResult = events.find((e) => e.content.type === "tool_result");
    expect(toolResult).toBeTruthy();
    if (toolResult && toolResult.content.type === "tool_result") {
      expect(toolResult.content.toolUseId).toBe("tool_123");
      expect(toolResult.role).toBe("tool");
    }

    const thinking = events.find((e) => e.content.type === "thinking");
    expect(thinking).toBeTruthy();
    if (thinking && thinking.content.type === "thinking") {
      expect(thinking.content.text).toBe("pondering the result");
    }

    // All conversationIds line up.
    for (const e of events) {
      expect(e.conversationId).toBe("c-tools");
    }
  });

  it("persistence failure doesn't crash the stream", async () => {
    // Every insertEvent throws — the stream must still deliver all chunks
    // to an open SSE subscriber and the POST must still return 200.
    mockedInsertEvent.mockImplementation(() => {
      throw new Error("simulated db failure");
    });
    // Suppress noisy error logs for this test.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
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

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const received: string[] = [];

        const streamReq = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/chat/stream/c-fail",
            method: "GET",
          },
          (res) => {
            res.setEncoding("utf8");
            res.on("data", (data: string) => {
              received.push(data);
              const joined = received.join("");
              if (joined.includes('"type":"done"')) {
                try {
                  expect(joined).toContain('"type":"text"');
                } catch (e) {
                  res.destroy();
                  server.close();
                  reject(e);
                  return;
                }
                res.destroy();
                server.close();
                resolve();
              }
            });

            (async () => {
              try {
                const postRes = await request(`http://127.0.0.1:${port}`)
                  .post("/api/chat/prompt")
                  .send({ conversationId: "c-fail", text: "hi" });
                expect(postRes.status).toBe(200);
              } catch (e) {
                server.close();
                reject(e);
              }
            })();
          },
        );
        streamReq.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") return;
          server.close();
          reject(err);
        });
        streamReq.end();
      });
    });

    errSpy.mockRestore();
  });

  it("conversationId is preserved on every event", async () => {
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "one " }] },
          },
        },
        {
          type: "tool_call",
          raw: {
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  id: "t1",
                  name: "Bash",
                  input: { command: "pwd" },
                },
              ],
            },
          },
        },
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "two" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "abc", text: "hi" });
    expect(res.status).toBe(200);

    // user + tool_call + assistant text = 3 events.
    await waitFor(() => mockedInsertEvent.mock.calls.length >= 3);

    const events = persistedEvents();
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const e of events) {
      expect(e.conversationId).toBe("abc");
    }
  });
});
