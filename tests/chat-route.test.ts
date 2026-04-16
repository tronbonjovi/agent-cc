/**
 * Tests for the chat SSE route — POST /api/chat/prompt + GET /api/chat/stream/:conversationId.
 * Mocks runClaudeStreaming and isClaudeAvailable so no real Claude subprocess is ever spawned.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import http from "http";

// Mock the claude-runner module BEFORE importing the route under test.
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

import chatRouter from "../server/routes/chat";
import { isClaudeAvailable, runClaudeStreaming } from "../server/scanner/claude-runner";

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;

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
            res.setEncoding("utf8");
            res.on("data", (data: string) => {
              received.push(data);
              const joined = received.join("");
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

    vi.advanceTimersByTime(15000);
    expect(writes.some((w) => w.includes(": keepalive"))).toBe(true);

    const firstCount = writes.filter((w) => w.includes(": keepalive")).length;
    vi.advanceTimersByTime(15000);
    const secondCount = writes.filter((w) => w.includes(": keepalive")).length;
    expect(secondCount).toBeGreaterThan(firstCount);

    (reqEventHandlers["close"] ?? []).forEach((h) => h());
  });

  it("stream errors are logged even with no SSE subscribers", async () => {
    async function* throwingGenerator() {
      throw new Error("simulated claude exit 1");
      // eslint-disable-next-line @typescript-eslint/no-unreachable
      yield { type: "done" as const, raw: null };
    }
    mockedRunClaudeStreaming.mockImplementation(() => throwingGenerator());

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c-silent", text: "hi" });
    expect(res.status).toBe(200);

    // Wait for the fire-and-forget block to hit its catch.
    const start = Date.now();
    while (Date.now() - start < 1000) {
      if (errSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("[chat] stream failed")),
      )) break;
      await new Promise((r) => setTimeout(r, 5));
    }

    const flattened = errSpy.mock.calls
      .map((c) => c.map(String).join(" "))
      .join("\n");
    expect(flattened).toContain("c-silent");
    expect(flattened).toContain("simulated claude exit 1");

    errSpy.mockRestore();
  });
});
