/**
 * Unified-capture E2E integration test (task008 — unified-capture milestone).
 *
 * Proves the full M2 server flow end-to-end against a real temp SQLite DB:
 *
 *   POST /api/chat/prompt
 *     → runClaudeStreaming (mocked) yields chunks
 *     → chat.ts persists InteractionEvents via the REAL interactions-repo
 *     → events land in a real `interactions.db` under a per-test temp dir
 *   GET  /api/chat/conversations/:id/events
 *     → returns the persisted events in timestamp order
 *   GET  /api/chat/conversations
 *     → returns chat-sourced conversations only (scanner-jsonl filtered)
 *
 * Only `claude-runner` is mocked — the repo, the DB, and the router are all
 * real. This is the one cross-cutting test in the suite that verifies the
 * whole chat write+read path without stubs at the persistence boundary.
 *
 * Isolation:
 *   - Each test gets its own `AGENT_CC_DATA` temp dir, so `interactions.db`
 *     is fresh. `closeDb()` is called in `afterEach` — its internal
 *     `cachedPath` comparison also re-opens automatically when the next
 *     test flips `AGENT_CC_DATA` to a new temp dir, but closing explicitly
 *     keeps cleanup deterministic on Windows-style handle semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "node:crypto";

// Mock the claude-runner module BEFORE importing the route under test.
// Path must match the import in server/routes/chat.ts (../scanner/claude-runner).
vi.mock("../server/scanner/claude-runner", () => {
  return {
    isClaudeAvailable: vi.fn(async () => true),
    runClaudeStreaming: vi.fn(),
    resetClaudeAvailabilityCache: vi.fn(),
  };
});

import chatRouter from "../server/routes/chat";
import { runClaudeStreaming } from "../server/scanner/claude-runner";
import { closeDb } from "../server/interactions-db";
import { insertEvent } from "../server/interactions-repo";
import type { InteractionEvent } from "../shared/types";

const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;

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

/**
 * Poll an async predicate until it resolves true or the timeout fires.
 * Used to wait for the chat route's fire-and-forget streaming loop to finish
 * persisting events before we assert on the read API.
 */
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

// ---------------------------------------------------------------------------
// Per-test temp DB isolation (mirrors tests/interactions-repo.test.ts)
// ---------------------------------------------------------------------------

let tempDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGENT_CC_DATA;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unified-capture-e2e-"));
  process.env.AGENT_CC_DATA = tempDir;
  mockedRunClaudeStreaming.mockReset();
  mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
});

afterEach(() => {
  closeDb();
  if (originalEnv === undefined) {
    delete process.env.AGENT_CC_DATA;
  } else {
    process.env.AGENT_CC_DATA = originalEnv;
  }
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("unified-capture E2E", () => {
  it("persists user and assistant events from a chat prompt", async () => {
    // Mock the CLI: one text chunk + done. chat.ts should write a user event
    // up front and a coalesced assistant event on `done`.
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
    const conversationId = "e2e-basic";

    const postRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId, text: "hello" });
    expect(postRes.status).toBe(200);

    // Wait until the events endpoint reports both rows. Polling the real DB
    // through the same HTTP surface the frontend uses keeps the assertion
    // honest — no back-channel into the repo.
    let events: InteractionEvent[] = [];
    await waitFor(async () => {
      const res = await request(app).get(
        `/api/chat/conversations/${conversationId}/events`,
      );
      events = res.body.events ?? [];
      return events.length >= 2;
    });

    // User event first (written synchronously before dispatch).
    expect(events[0].role).toBe("user");
    expect(events[0].source).toBe("chat-ai");
    expect(events[0].conversationId).toBe(conversationId);
    expect(events[0].content).toEqual({ type: "text", text: "hello" });

    // Assistant event second, with coalesced text from the single text chunk.
    expect(events[1].role).toBe("assistant");
    expect(events[1].source).toBe("chat-ai");
    expect(events[1].content).toEqual({ type: "text", text: "hi there" });

    // Conversation now appears in the conversations listing.
    const convRes = await request(app).get("/api/chat/conversations");
    expect(convRes.status).toBe(200);
    const ids = (convRes.body.conversations as Array<{ conversationId: string }>).map(
      (c) => c.conversationId,
    );
    expect(ids).toContain(conversationId);
  });

  it("persists tool_call and tool_result as separate events", async () => {
    // Mock a tool-use turn: narrative text + tool_call + tool_result + done.
    // chat.ts persists each non-text chunk eagerly and coalesces the text.
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "running a command" }] },
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
                  id: "tool_e2e_1",
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
                  tool_use_id: "tool_e2e_1",
                  content: "file.txt",
                },
              ],
            },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const conversationId = "e2e-tools";

    const postRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId, text: "run it" });
    expect(postRes.status).toBe(200);

    // user + tool_call + tool_result + assistant-text = 4 events.
    let events: InteractionEvent[] = [];
    await waitFor(async () => {
      const res = await request(app).get(
        `/api/chat/conversations/${conversationId}/events`,
      );
      events = res.body.events ?? [];
      return events.length >= 4;
    });

    const byType = events.map((e) => e.content.type);
    expect(byType).toContain("text");
    expect(byType).toContain("tool_call");
    expect(byType).toContain("tool_result");

    const toolCall = events.find((e) => e.content.type === "tool_call");
    expect(toolCall).toBeTruthy();
    if (toolCall && toolCall.content.type === "tool_call") {
      expect(toolCall.content.toolName).toBe("Bash");
      expect(toolCall.content.toolUseId).toBe("tool_e2e_1");
      expect(toolCall.content.input).toEqual({ command: "ls" });
    }

    const toolResult = events.find((e) => e.content.type === "tool_result");
    expect(toolResult).toBeTruthy();
    if (toolResult && toolResult.content.type === "tool_result") {
      expect(toolResult.content.toolUseId).toBe("tool_e2e_1");
      expect(toolResult.content.output).toBe("file.txt");
    }
    // tool_result events use role=tool per chat.ts buildEvent call.
    expect(toolResult?.role).toBe("tool");

    // All events share the same conversationId, and the timestamps are
    // monotonically non-decreasing (the endpoint sorts ASC).
    for (const e of events) {
      expect(e.conversationId).toBe(conversationId);
    }
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp >= events[i - 1].timestamp).toBe(true);
    }
  });

  it("conversations endpoint lists chat conversations only", async () => {
    // Seed a scanner-jsonl event directly via the REAL repo — this simulates
    // a conversation imported from the scanner and should NOT surface in
    // /api/chat/conversations (which filters to chat-* sources only).
    const scannerEvent: InteractionEvent = {
      id: randomUUID(),
      conversationId: "conv-scanner-imported",
      parentEventId: null,
      timestamp: "2026-04-15T08:00:00.000Z",
      source: "scanner-jsonl",
      role: "user",
      content: { type: "text", text: "imported from JSONL" },
      cost: null,
    };
    insertEvent(scannerEvent);

    // Now POST a real chat prompt — this should create a chat-ai conversation
    // that DOES appear in the listing.
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([
        {
          type: "text",
          raw: {
            type: "assistant",
            message: { content: [{ type: "text", text: "ok" }] },
          },
        },
        { type: "done", raw: null },
      ]),
    );

    const app = buildApp();
    const chatConversationId = "e2e-chat-only";

    const postRes = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: chatConversationId, text: "hello" });
    expect(postRes.status).toBe(200);

    // Wait until both the user and assistant events are persisted before
    // asserting — otherwise the conversation may not be there yet.
    await waitFor(async () => {
      const res = await request(app).get(
        `/api/chat/conversations/${chatConversationId}/events`,
      );
      return (res.body.events ?? []).length >= 2;
    });

    // The conversations endpoint should include the chat one and exclude the
    // scanner one.
    const convRes = await request(app).get("/api/chat/conversations");
    expect(convRes.status).toBe(200);
    const ids = (convRes.body.conversations as Array<{ conversationId: string }>).map(
      (c) => c.conversationId,
    );
    expect(ids).toContain(chatConversationId);
    expect(ids).not.toContain("conv-scanner-imported");

    // Every returned conversation is from a chat source.
    const sources = (convRes.body.conversations as Array<{ source: string }>).map(
      (c) => c.source,
    );
    for (const s of sources) {
      expect(s.startsWith("chat-")).toBe(true);
    }

    // Sanity check: the scanner event IS in the DB — we can fetch it directly
    // through the per-conversation events endpoint, which doesn't apply the
    // chat-source filter. This proves the filter is in /conversations, not
    // a side effect of the insert failing.
    const scannerEventsRes = await request(app).get(
      "/api/chat/conversations/conv-scanner-imported/events",
    );
    expect(scannerEventsRes.status).toBe(200);
    const scannerEvents = scannerEventsRes.body.events as InteractionEvent[];
    expect(scannerEvents).toHaveLength(1);
    expect(scannerEvents[0].source).toBe("scanner-jsonl");
  });
});
