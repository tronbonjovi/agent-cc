/**
 * Graceful-shutdown tests for the SSE chat fan-out.
 *
 * Before this fix, `sudo systemctl restart agent-cc` sat in
 * `Active: deactivating (stop-sigterm)` for 90 seconds before the
 * `TimeoutStopSec` boundary fired SIGKILL — every deploy took a 90s
 * penalty. Root cause: open EventSource subscribers on `/api/chat/stream/:id`
 * each registered a 15s `setInterval` keepalive; both the open HTTP
 * sockets and the interval handles kept the node event loop alive
 * indefinitely.
 *
 * `shutdownChatStreams()` walks every active subscriber, clears the
 * keepalive interval, writes a terminal `{ type: "close", reason:
 * "shutdown" }` SSE frame, and ends the HTTP response. The top-level
 * SIGTERM handler in `server/index.ts` calls it before `httpServer.close`
 * so the drain can actually complete.
 *
 * This file covers:
 *   1. Pure-logic: calling `shutdownChatStreams` on an empty map is a no-op.
 *   2. Integration: a real HTTP subscriber on an ephemeral port receives
 *      the close frame and sees its socket end within a short timeout.
 *   3. Source-text guardrail on `server/index.ts` so a future refactor
 *      can't silently drop the shutdown wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";

// Mock claude-runner BEFORE importing the route — otherwise the real module
// would try to spawn the CLI just to import chat.ts.
vi.mock("../server/scanner/claude-runner", () => ({
  isClaudeAvailable: vi.fn(async () => true),
  runClaudeStreaming: vi.fn(),
  resetClaudeAvailabilityCache: vi.fn(),
}));

import chatRouter, { shutdownChatStreams } from "../server/routes/chat";

const ROOT = path.resolve(__dirname, "..");
const SERVER_INDEX = path.resolve(ROOT, "server/index.ts");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

/**
 * Open a raw SSE subscriber on `/api/chat/stream/:id`, resolve once the
 * server has sent response headers (so we know we're registered in the
 * router's `activeStreams` map). Returns the live response + a helper
 * for awaiting socket close and capturing data chunks.
 */
async function openSseSubscriber(port: number, conversationId: string) {
  const chunks: string[] = [];
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: `/api/chat/stream/${conversationId}`,
    method: "GET",
  });
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    req.once("response", resolve);
    req.once("error", reject);
    req.end();
  });
  response.on("data", (buf: Buffer) => {
    chunks.push(buf.toString("utf-8"));
  });
  const closed = new Promise<void>((resolve) => {
    response.once("close", () => resolve());
    response.once("end", () => resolve());
  });
  return { req, response, chunks, closed };
}

describe("shutdownChatStreams", () => {
  beforeEach(() => {
    // Ensure a clean slate — any stray subs from prior tests would pollute
    // the next run's assertions.
    shutdownChatStreams();
  });

  it("is a no-op on an empty subscriber map", () => {
    expect(() => shutdownChatStreams()).not.toThrow();
    // Second call also safe (idempotent).
    expect(() => shutdownChatStreams()).not.toThrow();
  });

  it("tears down a live SSE subscriber: close frame + socket end", async () => {
    const app = buildApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const sub = await openSseSubscriber(port, "shutdown-test-conv");

    // Give the chat router a microtask to push the subscriber into the
    // activeStreams map before we tear it down. Without the yield the
    // `res` handler hasn't run `activeStreams.set` yet.
    await new Promise((r) => setImmediate(r));

    shutdownChatStreams();

    // Close event should fire promptly — we give it a generous 2s upper
    // bound so slow CI doesn't flake. Real tear-down is <50ms.
    await Promise.race([
      sub.closed,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("subscriber did not close within 2s")),
          2000,
        ),
      ),
    ]);

    const merged = sub.chunks.join("");
    expect(merged).toContain('"type":"close"');
    expect(merged).toContain('"reason":"shutdown"');

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("tears down multiple subscribers across multiple conversations", async () => {
    const app = buildApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const subs = await Promise.all([
      openSseSubscriber(port, "conv-a"),
      openSseSubscriber(port, "conv-b"),
      openSseSubscriber(port, "conv-b"), // two subs on the same conv
    ]);

    await new Promise((r) => setImmediate(r));

    shutdownChatStreams();

    await Promise.race([
      Promise.all(subs.map((s) => s.closed)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("not all subscribers closed within 2s")),
          2000,
        ),
      ),
    ]);

    for (const s of subs) {
      expect(s.chunks.join("")).toContain('"type":"close"');
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("server/index.ts — SIGTERM wiring guardrail", () => {
  // Source-text check: the top-level SIGTERM / SIGINT handler must call
  // `shutdownChatStreams()` before `httpServer.close()`. Dropping this wire
  // is how the 90s deploy-penalty regression reappears.
  const src = fs.readFileSync(SERVER_INDEX, "utf-8");

  it("imports shutdownChatStreams from the chat router", () => {
    expect(src).toMatch(
      /import\s*\{\s*shutdownChatStreams\s*\}\s*from\s*['"][^'"]*routes\/chat['"]/,
    );
  });

  it("registers SIGTERM and SIGINT handlers", () => {
    expect(src).toMatch(/process\.on\(\s*["']SIGTERM["']/);
    expect(src).toMatch(/process\.on\(\s*["']SIGINT["']/);
  });

  it("calls shutdownChatStreams from the graceful-shutdown handler", () => {
    // The handler body must invoke shutdownChatStreams() — whether it lives
    // inline in each process.on or via a shared helper function.
    expect(src).toContain("shutdownChatStreams()");
  });

  it("schedules a safety-net exit timer that is unref'd", () => {
    // Without `.unref()` the timer itself would pin the loop alive for
    // 5s on every shutdown, adding latency to clean drains.
    expect(src).toMatch(/setTimeout\([^)]*\)/);
    expect(src).toMatch(/\.unref\(\)/);
  });

  it("calls httpServer.close during shutdown", () => {
    expect(src).toMatch(/httpServer\.close\(/);
  });
});
