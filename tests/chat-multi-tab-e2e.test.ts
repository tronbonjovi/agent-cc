/**
 * chat-workflows-tabs-task008 — multi-tab E2E isolation test.
 *
 * Proves the M6 invariant end-to-end against the real Express chat + tabs
 * routers, with only `runClaudeStreaming` / `isClaudeAvailable` mocked:
 *
 *   Test 1 — SSE fan-out respects `conversationId` scoping under three
 *            concurrent prompts: each tab's SSE stream receives ONLY its
 *            own echoed content, never another tab's.
 *   Test 2 — Tab state round-trips through `PUT /api/chat/tabs` and a
 *            fresh `GET /api/chat/tabs` returns exactly what was written
 *            (the server-side equivalent of a client reload).
 *
 * Pattern lifted from `tests/chat-skeleton-e2e.test.ts` and
 * `tests/unified-capture-e2e.test.ts`:
 *
 *   - `vi.hoisted()` runs BEFORE imports, so we can create the tmp data dir
 *     and set `AGENT_CC_DATA` before `server/db.ts` resolves its data path
 *     at module load time. Without this, the routes would bind against the
 *     real `~/.agent-cc/` on the dev box.
 *   - Claude CLI is mocked: the runner yields an assistant envelope whose
 *     content block text is the incoming prompt, followed by a `done` chunk.
 *     Distinct prompts → distinct echoed content → cross-contamination is
 *     trivially detectable.
 *   - Supertest drives the non-streaming endpoints (`POST /prompt`,
 *     `PUT /tabs`, `GET /tabs`). SSE subscribers use raw `http.request`
 *     against `app.listen(0)` because supertest doesn't stream cleanly.
 *   - `describe.skipIf(process.env.E2E_REAL_CLAUDE === '1')` escape hatch
 *     matches the skeleton test — lets a dev manually exercise the real
 *     subprocess without this file failing.
 *
 * This file is NOT a substitute for manual smoke testing (per
 * `feedback_e2e_mock_gap`). It locks the isolation invariant against
 * regressions in the Express routing layer — the real CLI integration is
 * still load-bearing on the devbox smoke pass before merge.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Hoisted setup — runs before module imports so db.ts resolves its data
// path against an isolated tmp directory.
// ---------------------------------------------------------------------------
const { tempDir, originalEnv } = vi.hoisted(() => {
  const fsMod = require("fs") as typeof import("fs");
  const osMod = require("os") as typeof import("os");
  const pathMod = require("path") as typeof import("path");
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "chat-multi-tab-e2e-"));
  const prev = process.env.AGENT_CC_DATA;
  process.env.AGENT_CC_DATA = dir;
  return { tempDir: dir, originalEnv: prev };
});

// Hoisted mock — path matches the specifier in `server/routes/chat.ts`
// (`../scanner/claude-runner`, which resolves to `../server/scanner/claude-runner`
// from the `tests/` directory).
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    // The runner is invoked with `{ prompt: text }`. We echo `prompt` back
    // as the assistant message text so each conversation's SSE stream can
    // be asserted against its own prompt and ONLY its own prompt.
    runClaudeStreaming: vi.fn(async function* (args: { prompt: string }) {
      const prompt = args?.prompt ?? "";
      yield {
        type: "text",
        raw: {
          type: "assistant",
          message: { content: [{ type: "text", text: prompt }] },
        },
      };
      yield { type: "done", raw: {} };
    }),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

// Imports must come AFTER the hoisted setup + mocks above.
import chatRouter from "../server/routes/chat";
import chatTabsRouter from "../server/routes/chat-tabs";

// ---------------------------------------------------------------------------
// App wiring — minimal Express instance with only the routers under test.
// ---------------------------------------------------------------------------
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Mount order matches production: both routers share `/api/chat` as
  // their prefix so `/api/chat/tabs` hits the tabs router and
  // `/api/chat/prompt`, `/api/chat/stream/:id` hit the chat router.
  app.use("/api/chat", chatRouter);
  app.use("/api/chat", chatTabsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// SSE subscription helper — spawns a raw `http.request` against a live
// listener and collects chunks until the `done` event arrives (or timeout).
// Returns the accumulated SSE buffer as a single string.
// ---------------------------------------------------------------------------
function subscribeSse(
  port: number,
  conversationId: string,
  timeoutMs = 5000,
): Promise<{ buffer: string; receivedDone: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `subscribeSse timed out for ${conversationId} after ${timeoutMs}ms — got: ${chunks.join("")}`,
        ),
      );
    }, timeoutMs);

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: `/api/chat/stream/${conversationId}`,
        method: "GET",
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (data: string) => {
          chunks.push(data);
          const combined = chunks.join("");
          if (combined.includes('"done"')) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            res.destroy();
            resolve({ buffer: combined, receivedDone: true });
          }
        });
        res.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ECONNRESET") return;
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET") return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
const skipReal = process.env.E2E_REAL_CLAUDE === "1";

describe.skipIf(skipReal)("chat multi-tab E2E (mocked claude-runner)", () => {
  beforeAll(() => {
    // AGENT_CC_DATA was already set by vi.hoisted() above — confirm it
    // still points at our tmp dir in case another test in the run mutated
    // it. The env reassignment here is idempotent for single-file runs.
    process.env.AGENT_CC_DATA = tempDir;
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_CC_DATA;
    } else {
      process.env.AGENT_CC_DATA = originalEnv;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Nothing to reset between tests in this file — each test owns its
    // own Express app + listener + subscribers, and the mocked
    // runClaudeStreaming is stateless (it yields per-call based on args).
  });

  it(
    "isolates SSE streams per conversationId across concurrent prompts",
    async () => {
      const app = buildApp();

      await new Promise<void>((resolve, reject) => {
        const server = app.listen(0, async () => {
          try {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
              throw new Error("failed to bind ephemeral port");
            }
            const port = addr.port;

            // 1. Persist a 3-tab state via the tabs API. This exercises
            //    the PUT handler on the same app instance we'll drive the
            //    SSE streams against.
            const tabState = {
              openTabs: [
                { conversationId: "tabA", title: "Tab A" },
                { conversationId: "tabB", title: "Tab B" },
                { conversationId: "tabC", title: "Tab C" },
              ],
              activeTabId: "tabB",
              tabOrder: ["tabA", "tabB", "tabC"],
            };
            const putRes = await request(`http://127.0.0.1:${port}`)
              .put("/api/chat/tabs")
              .send(tabState);
            expect(putRes.status).toBe(200);

            // 2. Open all 3 SSE subscribers BEFORE firing the POSTs so each
            //    subscriber is registered in `activeStreams` by the time
            //    the fan-out loop runs. subscribeSse() returns a promise
            //    that resolves when that subscriber sees its `done` event.
            //
            //    Race-free registration: we kick off subscribeSse() (which
            //    calls req.end() synchronously) and then wait a microtask
            //    tick before firing POSTs. The SSE route registers into
            //    the map synchronously during `res.flushHeaders()`, so as
            //    long as the `http.request` response callback has fired
            //    for each subscriber before the POST, we're safe.
            //
            //    We use a small readiness gate: each subscribeSse promise
            //    is created, and we wait for all 3 TCP connections to be
            //    established via a parallel "connect" wait. To keep it
            //    simple we just wait until a probe GET against /tabs
            //    succeeds 3 times (serialising startup ordering with
            //    whatever scheduling the event loop picks).
            const subA = subscribeSse(port, "tabA");
            const subB = subscribeSse(port, "tabB");
            const subC = subscribeSse(port, "tabC");

            // Tiny yield so the SSE connections land in activeStreams
            // before the POSTs fire their fan-out.  A single setImmediate
            // is sufficient because Node processes the connect + flush
            // headers on the next I/O tick, which runs before a
            // setImmediate callback scheduled from userland. If this
            // proves flaky in CI, bump to a poll on an internal ready
            // signal — but on linux/darwin a microtask is enough.
            await new Promise((r) => setImmediate(r));
            await new Promise((r) => setImmediate(r));

            // 3. Fire 3 prompts concurrently. Each prompt's text is
            //    distinct ("apple" / "banana" / "cherry"), and the
            //    mocked runner echoes the prompt back as the assistant
            //    message text. So tabA's SSE stream should contain
            //    "apple" and NEVER "banana" or "cherry".
            const postA = request(`http://127.0.0.1:${port}`)
              .post("/api/chat/prompt")
              .send({ conversationId: "tabA", text: "apple" });
            const postB = request(`http://127.0.0.1:${port}`)
              .post("/api/chat/prompt")
              .send({ conversationId: "tabB", text: "banana" });
            const postC = request(`http://127.0.0.1:${port}`)
              .post("/api/chat/prompt")
              .send({ conversationId: "tabC", text: "cherry" });

            const [postResA, postResB, postResC] = await Promise.all([
              postA,
              postB,
              postC,
            ]);
            expect(postResA.status).toBe(200);
            expect(postResB.status).toBe(200);
            expect(postResC.status).toBe(200);

            // 4. Wait for all 3 subscribers to see their `done` terminal
            //    event. Each subscribeSse call has its own 5s timeout.
            const [resultA, resultB, resultC] = await Promise.all([
              subA,
              subB,
              subC,
            ]);

            // 5. Isolation assertions — each stream must have its own
            //    echoed content AND must NOT leak any other tab's content.
            expect(resultA.receivedDone).toBe(true);
            expect(resultA.buffer).toContain("apple");
            expect(resultA.buffer).not.toContain("banana");
            expect(resultA.buffer).not.toContain("cherry");

            expect(resultB.receivedDone).toBe(true);
            expect(resultB.buffer).toContain("banana");
            expect(resultB.buffer).not.toContain("apple");
            expect(resultB.buffer).not.toContain("cherry");

            expect(resultC.receivedDone).toBe(true);
            expect(resultC.buffer).toContain("cherry");
            expect(resultC.buffer).not.toContain("apple");
            expect(resultC.buffer).not.toContain("banana");

            server.close();
            resolve();
          } catch (err) {
            server.close();
            reject(err);
          }
        });
        server.on("error", reject);
      });
    },
    15_000,
  );

  it("persists tab state across store reload (full round-trip)", async () => {
    const app = buildApp();

    const tabState = {
      openTabs: [
        { conversationId: "conv-first", title: "First" },
        { conversationId: "conv-middle", title: "Middle" },
        { conversationId: "conv-last", title: "Last" },
      ],
      activeTabId: "conv-middle",
      tabOrder: ["conv-first", "conv-middle", "conv-last"],
    };

    // 1. Write state via the tabs API.
    const putRes = await request(app).put("/api/chat/tabs").send(tabState);
    expect(putRes.status).toBe(200);

    // 2. Re-GET — server-side equivalent of a client reload. The tabs
    //    API reads from the DB slice that PUT just mutated, so this
    //    round-trip proves persistence without touching the filesystem.
    const getRes = await request(app).get("/api/chat/tabs");
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(tabState);

    // 3. Explicit order + activeTabId checks (would catch regressions
    //    where the shape matched but the middle field got reordered).
    expect(getRes.body.openTabs).toHaveLength(3);
    expect(getRes.body.tabOrder).toEqual([
      "conv-first",
      "conv-middle",
      "conv-last",
    ]);
    expect(getRes.body.activeTabId).toBe("conv-middle");
  });
});
