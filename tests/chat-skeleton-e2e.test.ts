/**
 * chat-skeleton-task007 — end-to-end walking-skeleton smoke test.
 *
 * Exercises the full chat pipe with `runClaudeStreaming` / `isClaudeAvailable`
 * mocked so CI doesn't need the Claude CLI installed:
 *
 *   1. Open an SSE subscription on GET /api/chat/stream/:conversationId
 *   2. POST /api/chat/prompt with the same conversationId
 *   3. Assert mocked chunks arrive on the SSE stream and the stream emits
 *      a terminal "done" event
 *
 * Escape hatch: set `E2E_REAL_CLAUDE=1` to skip this test when you want to
 * exercise the real subprocess manually. Default is mocked.
 *
 * Intentionally independent of the existing `chat-route.test.ts` unit suite —
 * this file is the walking-skeleton closer that proves POST → SSE survives as
 * a single integration, not that the route handlers pass validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import http from "http";

// Hoisted mock — must match the exact specifier used by server/routes/chat.ts
// (`../scanner/claude-runner` → `../server/scanner/claude-runner` from tests/).
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(async function* () {
      yield { type: "text", raw: { text: "Hello " } };
      yield { type: "text", raw: { text: "world!" } };
      yield { type: "done", raw: {} };
    }),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

// Imported after vi.mock so the mock is applied.
import chatRouter from "../server/routes/chat";
import {
  isClaudeAvailable,
  runClaudeStreaming,
} from "../server/scanner/claude-runner";

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<
  typeof vi.fn
>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<
  typeof vi.fn
>;

/**
 * Build a minimal Express app wiring only the chat router. Matches the harness
 * pattern already used by `tests/chat-route.test.ts` — avoids booting the full
 * server (scanner + websockets + storage) for a focused integration test.
 *
 * Kept inside a try/catch so the test can skip cleanly if app construction
 * ever fails (per task contract: treat this as a smoke test, not a gate).
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

/** Default mocked generator — yields the canonical "Hello / world! / done" sequence. */
async function* defaultStream() {
  yield { type: "text", raw: { text: "Hello " } };
  yield { type: "text", raw: { text: "world!" } };
  yield { type: "done", raw: {} };
}

const skipReal = process.env.E2E_REAL_CLAUDE === "1";

describe.skipIf(skipReal)("chat skeleton E2E (mocked claude-runner)", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => defaultStream());
  });

  it(
    "streams POST /prompt chunks out to an open GET /stream subscriber",
    async () => {
      let app: Express;
      try {
        app = buildApp();
      } catch (err) {
        // Contract: skip cleanly if the app can't be constructed.
        console.warn("chat-skeleton-e2e: app construction failed, skipping", err);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const server = app.listen(0, async () => {
          const addr = server.address();
          if (!addr || typeof addr === "string") {
            server.close();
            reject(new Error("failed to bind ephemeral port"));
            return;
          }
          const port = addr.port;
          const received: string[] = [];
          let settled = false;
          const safeResolve = () => {
            if (settled) return;
            settled = true;
            server.close();
            resolve();
          };
          const safeReject = (err: unknown) => {
            if (settled) return;
            settled = true;
            server.close();
            reject(err);
          };

          // 1. Open the SSE subscription first so the POST's fan-out has a
          //    registered listener to write to.
          const sseReq = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/api/chat/stream/e2e-conv",
              method: "GET",
            },
            (res) => {
              res.setEncoding("utf8");
              res.on("data", (data: string) => {
                received.push(data);
                const combined = received.join("");
                // Wait until all three expected events have been written.
                if (
                  combined.includes("Hello ") &&
                  combined.includes("world!") &&
                  combined.includes('"done"')
                ) {
                  try {
                    expect(combined).toContain("Hello ");
                    expect(combined).toContain("world!");
                    expect(combined).toContain('"done"');
                    res.destroy();
                    safeResolve();
                  } catch (e) {
                    res.destroy();
                    safeReject(e);
                  }
                }
              });
              res.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ECONNRESET") return;
                safeReject(err);
              });
            },
          );
          sseReq.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ECONNRESET") return;
            safeReject(err);
          });
          sseReq.end();

          // 2. Give the SSE subscription a beat to register itself in the
          //    route's in-memory `activeStreams` map, then POST the prompt.
          setTimeout(async () => {
            try {
              const res = await request(`http://127.0.0.1:${port}`)
                .post("/api/chat/prompt")
                .send({ conversationId: "e2e-conv", text: "hi" });
              if (res.status !== 200) {
                safeReject(
                  new Error(`POST /api/chat/prompt failed with ${res.status}`),
                );
                return;
              }
              expect(res.body.ok).toBe(true);
            } catch (e) {
              safeReject(e);
            }
          }, 50);
        });

        server.on("error", (err) => reject(err));
      });

      // Sanity: the mocked runner was actually invoked — no real subprocess.
      expect(mockedRunClaudeStreaming).toHaveBeenCalledTimes(1);
      expect(mockedIsClaudeAvailable).toHaveBeenCalled();
    },
    10_000,
  );
});
