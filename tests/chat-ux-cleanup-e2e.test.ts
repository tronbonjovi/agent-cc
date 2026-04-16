/**
 * Chat UX cleanup — integration E2E (chat-ux-cleanup-task008).
 *
 * Final lock-in test for M9. Proves the pieces from tasks 001/002/004/005/006/
 * 007 integrate end-to-end. Dimensions:
 *
 *   A. Conversation continuity — route looks up db.chatSessions[...] and hands
 *      the stored sessionId to runClaudeStreaming. First turn omits it.
 *   B. Envelope-level streaming — POST → SSE emits text before done, and the
 *      wire format is well-formed (event:/data: pairs).
 *   C. Markdown rendering — source-text guardrails on interaction-event-
 *      renderer.tsx: react-markdown + GFM + rehype-highlight wired; assistant
 *      branch NOT wrapped in whitespace-pre-wrap; copy-button pattern exists.
 *   D. Sidebar removal + dashboard card removal — deleted files absent; no
 *      imports anywhere in client/src.
 *   E. Collapse bar — chat Panel always-mounted, min/max constraints gone,
 *      CHAT_COLLAPSED_PX present, History + Popover wired.
 *
 * Why not duplicate sibling tests? Runner-level CLI args (e.g. `--resume` in
 * argv) are pinned in `chat-continuity.test.ts`. Exhaustive markdown plumbing
 * lives in `chat-markdown.test.ts`. Collapse-bar internals live in
 * `chat-collapse-bar.test.ts`. History popover internals live in
 * `chat-history-popover.test.ts`. This E2E's job is to prove the SEAMS: the
 * route flows a stored sessionId to the runner, the SSE surface actually
 * emits the envelopes, and the deleted files / structural invariants are
 * pinned at the system level.
 *
 * Single file — no runner mock (vi.mock('child_process')) needed because
 * route-level mocks of claude-runner cover dimension A. Runner CLI-args
 * coverage is already in the sibling test and would be redundant here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import http from "http";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mocks — must precede the route import
// ---------------------------------------------------------------------------

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

/** Async generator yielding the given chunks in order. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// A. Conversation continuity — db.chatSessions[convId].sessionId → runner opts
// ---------------------------------------------------------------------------

describe("M9 E2E — A. conversation continuity", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    // Reset chatSessions between tests so stale state from earlier cases
    // doesn't pollute the "no stored session" branch.
    const db = getDB();
    db.chatSessions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("brand-new conversation: sessionId omitted on first POST", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "e2e-fresh", text: "hello" });
    expect(res.status).toBe(200);

    // Wait for fire-and-forget dispatch
    await new Promise((r) => setTimeout(r, 20));

    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    const opts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(opts.prompt).toBe("hello");
    expect(opts.sessionId).toBeUndefined();
  });

  it("two sequential POSTs: first seeds the session id, second reuses it", async () => {
    const capturedSessionId = "captured-uuid-7777";
    const convId = "e2e-continuity";

    // First POST — CLI emits init envelope with session_id, route captures it.
    mockedRunClaudeStreaming.mockImplementationOnce(() =>
      yieldChunks([
        {
          type: "system",
          raw: {
            type: "system",
            subtype: "init",
            session_id: capturedSessionId,
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const firstRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: convId, text: "hi" });
    expect(firstRes.status).toBe(200);

    // Wait for the init envelope to flow through and land in db.chatSessions.
    const start = Date.now();
    while (Date.now() - start < 1000) {
      const db = getDB();
      if (db.chatSessions?.[convId]?.sessionId === capturedSessionId) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(getDB().chatSessions[convId]?.sessionId).toBe(capturedSessionId);

    // First call MUST have had no sessionId (it was first-turn).
    const firstOpts = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(firstOpts.sessionId).toBeUndefined();

    // Second POST — should pick up the stored session id for the same conv.
    mockedRunClaudeStreaming.mockImplementationOnce(() => yieldChunks([]));
    const secondRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: convId, text: "follow-up" });
    expect(secondRes.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));

    const secondOpts = mockedRunClaudeStreaming.mock.calls[1][0];
    expect(secondOpts.prompt).toBe("follow-up");
    expect(secondOpts.sessionId).toBe(capturedSessionId);
  });
});

// ---------------------------------------------------------------------------
// B. Envelope-level streaming — SSE emits text envelopes before done
// ---------------------------------------------------------------------------
//
// The CLI is envelope-level (see memory/reference_claude_cli_streaming):
// each assistant turn produces ONE text envelope, not a token stream. This
// test therefore pins "at least one text event arrives before done", not
// "multiple text chunks per turn" (that would be the false premise task003
// rejected).

describe("M9 E2E — B. envelope-level streaming", () => {
  beforeEach(() => {
    mockedIsClaudeAvailable.mockReset();
    mockedRunClaudeStreaming.mockReset();
    mockedIsClaudeAvailable.mockResolvedValue(true);
  });

  it("SSE stream emits >= 1 text envelope before done, well-formed frames", async () => {
    const assistantEnvelope = {
      type: "text",
      raw: {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello from the cli envelope" }],
        },
      },
    };
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([assistantEnvelope, { type: "done", raw: null }]),
    );

    const app = buildApp();
    const convId = "e2e-sse-envelope";

    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const chunks: string[] = [];

        // Subscribe first so we don't miss any writes from the POST.
        const streamReq = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: `/api/chat/stream/${convId}`,
            method: "GET",
          },
          (res) => {
            res.setEncoding("utf8");
            res.on("data", (data: string) => {
              chunks.push(data);
              const joined = chunks.join("");
              // Terminate once we've seen both the text and done envelopes.
              if (
                joined.includes('"type":"text"') &&
                joined.includes('"type":"done"')
              ) {
                try {
                  // The text event must appear BEFORE the done event.
                  const textIdx = joined.indexOf('"type":"text"');
                  const doneIdx = joined.indexOf('"type":"done"');
                  expect(textIdx).toBeGreaterThan(-1);
                  expect(doneIdx).toBeGreaterThan(-1);
                  expect(textIdx).toBeLessThan(doneIdx);

                  // SSE wire format: each frame is `data: <json>\n\n`. The
                  // chat route doesn't emit explicit `event:` names, only
                  // `data:` + blank line, which is still valid SSE per
                  // https://html.spec.whatwg.org/multipage/server-sent-events.
                  expect(joined).toMatch(/data: \{/);
                  expect(joined).toMatch(/\n\n/);

                  // Payload integrity — the assistant text made it through.
                  expect(joined).toContain("hello from the cli envelope");
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

            // Fire the POST once the subscriber is attached.
            (async () => {
              try {
                const postRes = await request(`http://127.0.0.1:${port}`)
                  .post("/api/chat/prompt")
                  .send({ conversationId: convId, text: "go" });
                if (postRes.status !== 200) {
                  server.close();
                  reject(new Error(`POST failed: ${postRes.status}`));
                }
              } catch (e) {
                server.close();
                reject(e);
              }
            })();
          },
        );
        streamReq.on("error", (err: NodeJS.ErrnoException) => {
          // Our own res.destroy() from inside the data handler triggers
          // ECONNRESET on the request side — that's expected when we've
          // already resolved, so swallow it.
          if (err.code === "ECONNRESET") return;
          server.close();
          reject(err);
        });
        streamReq.end();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// C. Markdown rendering — source-text integration guardrails
// ---------------------------------------------------------------------------

describe("M9 E2E — C. markdown rendering", () => {
  const RENDERER_PATH = path.resolve(
    ROOT,
    "client/src/components/chat/interaction-event-renderer.tsx",
  );
  const src = fs.readFileSync(RENDERER_PATH, "utf-8");

  it("react-markdown + remark-gfm + rehype-highlight are imported", () => {
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]react-markdown['"]/);
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]remark-gfm['"]/);
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]rehype-highlight['"]/);
  });

  it("assistant text path does NOT use whitespace-pre-wrap (markdown handles it)", () => {
    // The TextBubble uses isAssistant ? 'markdown-body' : 'whitespace-pre-wrap'.
    // The markdown branch must NOT carry whitespace-pre-wrap — that would
    // clash with react-markdown's own paragraph wrapping. Pin the ternary
    // shape: isAssistant branch is markdown-body, NOT whitespace-pre-wrap.
    expect(src).toMatch(
      /isAssistant\s*\?\s*['"]markdown-body['"]\s*:\s*['"]whitespace-pre-wrap['"]/,
    );
  });

  it("code block copy affordance is wired (component + clipboard call)", () => {
    // A named CodeBlock wrapper + a clipboard write call — both must exist.
    const hasCodeBlock =
      /function\s+CodeBlock\s*\(/.test(src) ||
      /const\s+CodeBlock\s*[:=]/.test(src);
    expect(hasCodeBlock).toBe(true);
    expect(src).toMatch(/navigator\.clipboard\.writeText\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// D. Sidebar removal + dashboard card removal — structural guardrails
// ---------------------------------------------------------------------------

describe("M9 E2E — D. sidebar + dashboard card removed", () => {
  const SIDEBAR_PATH = path.resolve(
    ROOT,
    "client/src/components/chat/conversation-sidebar.tsx",
  );
  const DASHBOARD_CARD_PATH = path.resolve(
    ROOT,
    "client/src/components/dashboard/ai-vs-deterministic-card.tsx",
  );
  const CLIENT_SRC = path.resolve(ROOT, "client/src");

  it("conversation-sidebar.tsx does not exist", () => {
    expect(fs.existsSync(SIDEBAR_PATH)).toBe(false);
  });

  it("ai-vs-deterministic-card.tsx does not exist", () => {
    expect(fs.existsSync(DASHBOARD_CARD_PATH)).toBe(false);
  });

  it("no import of ConversationSidebar anywhere in client/src", () => {
    const offenders = findOffendingFiles(CLIENT_SRC, (src) =>
      /import\s*\{[^}]*ConversationSidebar[^}]*\}\s*from/.test(src),
    );
    expect(
      offenders,
      `Files still import ConversationSidebar: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("no import of AiVsDeterministicCard anywhere in client/src", () => {
    const offenders = findOffendingFiles(CLIENT_SRC, (src) =>
      /import\s*\{[^}]*AiVsDeterministicCard[^}]*\}\s*from/.test(src) ||
      /import\s+AiVsDeterministicCard\s+from/.test(src),
    );
    expect(
      offenders,
      `Files still import AiVsDeterministicCard: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

/**
 * Walk a directory recursively, returning relative paths of .ts/.tsx files
 * matching the predicate. Scoped to this test file because the sibling
 * guardrails each reinvent it and we don't want yet another shared helper
 * for a single task's worth of uses.
 */
function findOffendingFiles(
  rootDir: string,
  predicate: (src: string) => boolean,
): string[] {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf-8");
        if (predicate(src)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(rootDir);
  return offenders;
}

// ---------------------------------------------------------------------------
// E. Collapse bar + history popover — structural guardrails on layout.tsx
// ---------------------------------------------------------------------------

describe("M9 E2E — E. collapse bar + history popover", () => {
  const LAYOUT_PATH = path.resolve(ROOT, "client/src/components/layout.tsx");
  const src = fs.readFileSync(LAYOUT_PATH, "utf-8");

  it("chat Panel is NOT wrapped in a {!chatPanelCollapsed && ...Panel...} guard", () => {
    // layout.tsx intentionally has `{!chatPanelCollapsed && <div...grip />}`
    // for the decorative resize grip inside PanelResizeHandle — that's fine.
    // What this task pins is that the chat <Panel> element itself must not
    // be gated on !chatPanelCollapsed (it's always-mounted so SSE stays
    // alive across collapse toggles, per task006 contract).
    expect(src).not.toMatch(
      /!chatPanelCollapsed\s*&&\s*\(\s*<Panel(Resize)?/,
    );
    expect(src).not.toMatch(/!chatPanelCollapsed\s*&&\s*<Panel\b/);
  });

  it("old min/max width constraints are removed", () => {
    // `feedback_no_layout_constraints`: no 240/800 floors/ceilings.
    expect(src).not.toMatch(/minSize=\{240\}/);
    expect(src).not.toMatch(/maxSize=\{800\}/);
  });

  it("CHAT_COLLAPSED_PX constant is present", () => {
    expect(src).toMatch(/CHAT_COLLAPSED_PX\s*=\s*\d+/);
  });

  it("History icon + Popover primitives are imported (task007 wiring)", () => {
    // History comes from lucide-react; Popover from shadcn.
    expect(src).toMatch(
      /import\s*\{[^}]*\bHistory\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(src).toMatch(
      /import\s*\{[^}]*\bPopover\b[^}]*\}\s*from\s*['"]@\/components\/ui\/popover['"]/,
    );
  });
});
