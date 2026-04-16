/**
 * Provider-aware chat route tests — chat-provider-system task003.
 *
 * Covers the router module + the chat route refactor:
 *
 *   - `routeToProvider()` dispatches to the right adapter based on
 *     `provider.type`.
 *   - Claude CLI path stays untouched (session-id continuity, no history).
 *   - OpenAI-compatible path carries assembled message history + the user
 *     prompt, resolves apiKey from auth.type, and handles OAuth refresh
 *     failures without crashing.
 *   - Unknown providerId surfaces as a descriptive system chunk, not a 500.
 *   - History cap is applied before dispatch so runaway conversations can't
 *     blow the context window.
 *
 * We mock both `runClaudeStreaming` and `runOpenAIStreaming` + `getValidToken`
 * so no subprocess or HTTP request ever goes out. `getDB().providers` is
 * seeded with purpose-built entries per test — no real provider mutation.
 *
 * Use an isolated tmp `AGENT_CC_DATA` so these tests don't touch the dev
 * user's DB. Same `vi.hoisted` pattern used by `provider-crud.test.ts`.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ProviderConfig } from "../shared/types";

const { originalEnv } = vi.hoisted(() => {
  const fsMod = require("fs") as typeof import("fs");
  const osMod = require("os") as typeof import("os");
  const pathMod = require("path") as typeof import("path");
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "chat-provider-routing-"));
  const prev = process.env.AGENT_CC_DATA;
  process.env.AGENT_CC_DATA = dir;
  return { tempDir: dir, originalEnv: prev };
});

// Mock the two streaming adapters + getValidToken BEFORE importing code
// under test.
vi.mock("../server/scanner/claude-runner", () => ({
  isClaudeAvailable: vi.fn(async () => true),
  runClaudeStreaming: vi.fn(),
  resetClaudeAvailabilityCache: vi.fn(),
}));

vi.mock("../server/providers/openai-adapter", () => ({
  runOpenAIStreaming: vi.fn(),
}));

vi.mock("../server/providers/oauth", () => ({
  getValidToken: vi.fn(),
}));

const { isClaudeAvailable, runClaudeStreaming } = await import(
  "../server/scanner/claude-runner"
);
const { runOpenAIStreaming } = await import("../server/providers/openai-adapter");
const { getValidToken } = await import("../server/providers/oauth");
const { routeToProvider, HISTORY_CAP } = await import("../server/providers/router");
const chatRouter = (await import("../server/routes/chat")).default;
const { getDB, saveSync, defaultProviders } = await import("../server/db");

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<typeof vi.fn>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<typeof vi.fn>;
const mockedRunOpenAIStreaming = runOpenAIStreaming as unknown as ReturnType<typeof vi.fn>;
const mockedGetValidToken = getValidToken as unknown as ReturnType<typeof vi.fn>;

/** Helper: async generator that yields the given chunks then finishes. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

/** Drain a generator into an array so we can assert on emitted chunks. */
async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRouter);
  return app;
}

function resetDB() {
  const db = getDB();
  db.providers = defaultProviders();
  db.chatSessions = {};
  saveSync();
}

/** Push an extra provider (OpenAI-compatible api-key or oauth) into the DB. */
function addProvider(p: ProviderConfig): void {
  const db = getDB();
  db.providers.push(p);
  saveSync();
}

beforeEach(() => {
  resetDB();
  mockedIsClaudeAvailable.mockReset();
  mockedRunClaudeStreaming.mockReset();
  mockedRunOpenAIStreaming.mockReset();
  mockedGetValidToken.mockReset();
  mockedIsClaudeAvailable.mockResolvedValue(true);
  mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));
});

afterAll(() => {
  if (originalEnv === undefined) delete process.env.AGENT_CC_DATA;
  else process.env.AGENT_CC_DATA = originalEnv;
});

// ---------------------------------------------------------------------------
// routeToProvider unit tests
// ---------------------------------------------------------------------------

describe("routeToProvider", () => {
  it("dispatches claude-cli providers to runClaudeStreaming with CLI settings", async () => {
    mockedRunClaudeStreaming.mockImplementation(() =>
      yieldChunks([{ type: "text", raw: { content: "hi" } }]),
    );

    await drain(
      routeToProvider({
        providerId: "claude-code",
        prompt: "what is 2+2?",
        conversationId: "conv-1",
        settings: {
          model: "claude-sonnet-4-6",
          effort: "high",
          sessionId: "sess-123",
          cwd: "/tmp/project",
          systemPrompt: "you are helpful",
          thinking: true,
          webSearch: false,
        },
      }),
    );

    expect(mockedRunClaudeStreaming).toHaveBeenCalledTimes(1);
    const args = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(args.prompt).toBe("what is 2+2?");
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.effort).toBe("high");
    expect(args.sessionId).toBe("sess-123");
    expect(args.cwd).toBe("/tmp/project");
    expect(args.systemPrompt).toBe("you are helpful");
    expect(args.thinking).toBe(true);
    expect(args.webSearch).toBe(false);
    // Claude CLI must NOT receive a history array — session-id handles continuity.
    expect(args.messages).toBeUndefined();
    expect(args.history).toBeUndefined();
  });

  it("does not pass history to runClaudeStreaming even when provided", async () => {
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));

    await drain(
      routeToProvider({
        providerId: "claude-code",
        prompt: "hello",
        conversationId: "conv-1",
        settings: {},
        history: [
          { role: "user", content: "earlier" },
          { role: "assistant", content: "reply" },
        ],
      }),
    );
    const args = mockedRunClaudeStreaming.mock.calls[0][0];
    expect(args.messages).toBeUndefined();
    expect(args.history).toBeUndefined();
  });

  it("dispatches openai-compatible (api-key) providers to runOpenAIStreaming with the real apiKey", async () => {
    addProvider({
      id: "openai-1",
      name: "OpenAI Test",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-live-secret-9999" },
      capabilities: { temperature: true, systemPrompt: true },
    });
    mockedRunOpenAIStreaming.mockImplementation(() =>
      yieldChunks([{ type: "text", raw: { content: "hi" } }]),
    );

    await drain(
      routeToProvider({
        providerId: "openai-1",
        prompt: "hello world",
        conversationId: "conv-1",
        settings: {
          model: "gpt-4",
          temperature: 0.7,
          systemPrompt: "be terse",
        },
        history: [
          { role: "user", content: "prior user" },
          { role: "assistant", content: "prior reply" },
        ],
      }),
    );

    expect(mockedRunOpenAIStreaming).toHaveBeenCalledTimes(1);
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.model).toBe("gpt-4");
    expect(req.temperature).toBe(0.7);
    expect(req.stream).toBe(true);
    expect(req.apiKey).toBe("sk-live-secret-9999");
    expect(req.provider.id).toBe("openai-1");
    // Messages should contain: system prompt, prior history, current user prompt.
    expect(req.messages[0]).toEqual({ role: "system", content: "be terse" });
    expect(req.messages[1]).toEqual({ role: "user", content: "prior user" });
    expect(req.messages[2]).toEqual({ role: "assistant", content: "prior reply" });
    expect(req.messages[3]).toEqual({ role: "user", content: "hello world" });
  });

  it("omits the system message when no systemPrompt is set", async () => {
    addProvider({
      id: "openai-2",
      name: "OpenAI Test",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-x" },
      capabilities: {},
    });
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));

    await drain(
      routeToProvider({
        providerId: "openai-2",
        prompt: "just user",
        conversationId: "conv-1",
        settings: { model: "gpt-4" },
      }),
    );
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.messages).toEqual([{ role: "user", content: "just user" }]);
  });

  it("dispatches openai-compatible (oauth) providers through getValidToken", async () => {
    addProvider({
      id: "oauth-1",
      name: "OAuth Test",
      type: "openai-compatible",
      baseUrl: "https://oauth.example.com",
      auth: {
        type: "oauth",
        oauthConfig: {
          authUrl: "https://oauth.example.com/authorize",
          tokenUrl: "https://oauth.example.com/token",
          clientId: "client-123",
        },
        oauthTokens: {
          accessToken: "old-token",
          refreshToken: "refresh-abc",
          expiresAt: Date.now() + 3_600_000,
        },
      },
      capabilities: {},
    });
    mockedGetValidToken.mockResolvedValue("fresh-access-token-xyz");
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));

    await drain(
      routeToProvider({
        providerId: "oauth-1",
        prompt: "hello",
        conversationId: "conv-1",
        settings: { model: "gpt-4" },
      }),
    );
    expect(mockedGetValidToken).toHaveBeenCalledTimes(1);
    expect(mockedGetValidToken.mock.calls[0][0].id).toBe("oauth-1");
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.apiKey).toBe("fresh-access-token-xyz");
  });

  it("yields a descriptive error chunk when OAuth refresh fails (no throw)", async () => {
    addProvider({
      id: "oauth-dead",
      name: "OAuth Dead",
      type: "openai-compatible",
      baseUrl: "https://oauth.example.com",
      auth: {
        type: "oauth",
        oauthConfig: {
          authUrl: "https://oauth.example.com/authorize",
          tokenUrl: "https://oauth.example.com/token",
          clientId: "client-123",
        },
      },
      capabilities: {},
    });
    mockedGetValidToken.mockRejectedValue(
      new Error("refresh token expired — re-authenticate"),
    );

    const chunks = await drain(
      routeToProvider({
        providerId: "oauth-dead",
        prompt: "hi",
        conversationId: "conv-1",
        settings: { model: "gpt-4" },
      }),
    );
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
    const first = chunks[0] as any;
    expect(first.type).toBe("system");
    expect(String(first.raw?.error ?? "")).toMatch(/re-authenticate|oauth|refresh/i);
  });

  it("yields 'Provider not found' system chunk for unknown providerId", async () => {
    const chunks = await drain(
      routeToProvider({
        providerId: "does-not-exist",
        prompt: "hi",
        conversationId: "conv-1",
        settings: {},
      }),
    );
    expect(mockedRunClaudeStreaming).not.toHaveBeenCalled();
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
    expect(chunks.length).toBeGreaterThan(0);
    const first = chunks[0] as any;
    expect(first.type).toBe("system");
    expect(String(first.raw?.error ?? "")).toMatch(/Provider not found/i);
  });

  it("passes apiKey undefined for openai-compatible providers with auth.type 'none' (Ollama)", async () => {
    // built-in Ollama is auth.type: 'none'
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));
    await drain(
      routeToProvider({
        providerId: "ollama",
        prompt: "hello",
        conversationId: "conv-1",
        settings: { model: "llama3.2" },
      }),
    );
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.apiKey).toBeUndefined();
  });

  it("caps history at HISTORY_CAP messages (keeps most recent)", async () => {
    addProvider({
      id: "openai-cap",
      name: "Cap Test",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-x" },
      capabilities: {},
    });
    expect(HISTORY_CAP).toBeGreaterThan(0);
    // Build a history that exceeds the cap so we can assert truncation.
    const over = HISTORY_CAP + 25;
    const history = Array.from({ length: over }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `msg-${i}`,
    }));
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));

    await drain(
      routeToProvider({
        providerId: "openai-cap",
        prompt: "current",
        conversationId: "conv-1",
        settings: { model: "gpt-4" },
        history,
      }),
    );
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    // messages = [...capped history, current user prompt]
    expect(req.messages.length).toBe(HISTORY_CAP + 1);
    // Most recent history entry before current prompt should be msg-(over-1).
    expect(req.messages[HISTORY_CAP - 1].content).toBe(`msg-${over - 1}`);
    // First history entry after cap should be msg-(over - HISTORY_CAP).
    expect(req.messages[0].content).toBe(`msg-${over - HISTORY_CAP}`);
    // Last is the current turn.
    expect(req.messages[HISTORY_CAP]).toEqual({ role: "user", content: "current" });
  });
});

// ---------------------------------------------------------------------------
// Chat route integration
// ---------------------------------------------------------------------------

describe("POST /api/chat/prompt — provider-aware routing", () => {
  it("defaults to claude-code when providerId is omitted", async () => {
    mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c1", text: "hello" });
    expect(res.status).toBe(200);
    // Wait briefly for the fire-and-forget dispatch to land.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunClaudeStreaming).toHaveBeenCalled();
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
  });

  it("routes to runOpenAIStreaming when providerId points to an openai-compatible provider", async () => {
    addProvider({
      id: "openai-route",
      name: "OpenAI",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-secret" },
      capabilities: { temperature: true, systemPrompt: true },
    });
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));

    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-openai",
      text: "hi gpt",
      providerId: "openai-route",
      model: "gpt-4",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunOpenAIStreaming).toHaveBeenCalled();
    expect(mockedRunClaudeStreaming).not.toHaveBeenCalled();
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.apiKey).toBe("sk-secret");
    expect(req.model).toBe("gpt-4");
    // Last message is always the current user prompt.
    expect(req.messages[req.messages.length - 1]).toEqual({
      role: "user",
      content: "hi gpt",
    });
  });

  it("does NOT gate openai-compatible routing on isClaudeAvailable", async () => {
    addProvider({
      id: "openai-nogate",
      name: "OpenAI",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-secret" },
      capabilities: {},
    });
    mockedIsClaudeAvailable.mockResolvedValue(false);
    mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));

    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-nogate",
      text: "hi",
      providerId: "openai-nogate",
      model: "gpt-4",
    });
    // Claude CLI being unavailable must NOT block OpenAI-compatible providers.
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunOpenAIStreaming).toHaveBeenCalled();
  });

  it("unknown providerId does not crash; POST still responds 200 and no adapter runs", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-unknown",
      text: "hi",
      providerId: "ghost-provider",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunClaudeStreaming).not.toHaveBeenCalled();
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
  });
});
