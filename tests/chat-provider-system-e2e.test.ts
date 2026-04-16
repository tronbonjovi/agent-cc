/**
 * Integration gate for M11 (chat-provider-system) — task008.
 *
 * Exercises the complete multi-provider stack end-to-end:
 *
 *   - Provider CRUD roundtrip (create, list-with-masking, update, delete)
 *   - OAuth schema enforcement on `auth.type === 'oauth'` providers
 *   - Model discovery across Claude CLI, Ollama, and generic OpenAI-compatible
 *     providers (plus the unavailable-provider degrade path)
 *   - Provider-aware routing through `POST /api/chat/prompt`:
 *       * claude-code  → runClaudeStreaming
 *       * ollama       → runOpenAIStreaming with the /v1/chat/completions URL
 *       * unknown      → 'Provider not found' system chunk, no crash
 *       * no providerId field → defaults to claude-code (Part 1 fallback)
 *   - Structural checks that the M11 files exist and that runtime client code
 *     no longer imports the test-only `builtin-providers` fixture.
 *   - Client-side wiring check: chat-panel.tsx must include `providerId` in
 *     its POST body so the composer's provider selector actually changes
 *     routing. This is the Part 1 edit that closes the gap task007 left open.
 *
 * Mocking strategy:
 *
 *   - `runClaudeStreaming` and `runOpenAIStreaming` are mocked so no subprocess
 *     or real HTTP request ever goes out. That's the pattern used by
 *     `chat-provider-routing.test.ts`; we reuse it because mock-based E2Es
 *     are load-bearing for the routing assertions.
 *   - Model discovery mocks `globalThis.fetch` directly (that's the layer the
 *     `discoverModels` helper calls), and restores via `vi.unstubAllGlobals`.
 *   - `AGENT_CC_DATA` is redirected to a tmp directory via `vi.hoisted` so
 *     tests never touch the dev user's DB.
 *
 * SSE + supertest note: reading a hanging SSE connection through supertest is
 * fiddy, and the value we care about (did the right adapter get invoked?) is
 * directly observable on the mocked adapter's call list. We assert against
 * that rather than parsing broadcast frames. See
 * `feedback_e2e_mock_gap` — mock-based E2E proves handler + router logic, and
 * the manual smoke remains load-bearing for CLI subprocess integration.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import type { ProviderConfig } from "../shared/types";

const { originalEnv } = vi.hoisted(() => {
  const fsMod = require("fs") as typeof import("fs");
  const osMod = require("os") as typeof import("os");
  const pathMod = require("path") as typeof import("path");
  const dir = fsMod.mkdtempSync(
    pathMod.join(osMod.tmpdir(), "chat-provider-system-e2e-"),
  );
  const prev = process.env.AGENT_CC_DATA;
  process.env.AGENT_CC_DATA = dir;
  return { tempDir: dir, originalEnv: prev };
});

// Mock streaming adapters + oauth BEFORE importing routes. Same shape as
// chat-provider-routing.test.ts so mock injection actually lands before the
// router's closure captures the real symbols.
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
  // These are imported by the providers route; stub so the module load
  // doesn't explode, even though the CRUD suite doesn't drive them.
  generateAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  consumeAuthState: vi.fn(),
}));

const { isClaudeAvailable, runClaudeStreaming } = await import(
  "../server/scanner/claude-runner"
);
const { runOpenAIStreaming } = await import(
  "../server/providers/openai-adapter"
);
const providersRouter = (await import("../server/routes/providers")).default;
const chatRouter = (await import("../server/routes/chat")).default;
const { getDB, saveSync, defaultProviders } = await import("../server/db");
const { __clearDiscoveryCache } = await import(
  "../server/providers/model-discovery"
);

const mockedIsClaudeAvailable = isClaudeAvailable as unknown as ReturnType<
  typeof vi.fn
>;
const mockedRunClaudeStreaming = runClaudeStreaming as unknown as ReturnType<
  typeof vi.fn
>;
const mockedRunOpenAIStreaming = runOpenAIStreaming as unknown as ReturnType<
  typeof vi.fn
>;

/** Async generator helper — yields the given chunks then completes. */
async function* yieldChunks(chunks: unknown[]) {
  for (const c of chunks) yield c as any;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(providersRouter);
  app.use("/api/chat", chatRouter);
  return app;
}

function resetDB() {
  const db = getDB();
  db.providers = defaultProviders();
  db.chatSessions = {};
  saveSync();
}

beforeEach(() => {
  resetDB();
  __clearDiscoveryCache();
  mockedIsClaudeAvailable.mockReset();
  mockedRunClaudeStreaming.mockReset();
  mockedRunOpenAIStreaming.mockReset();
  mockedIsClaudeAvailable.mockResolvedValue(true);
  mockedRunClaudeStreaming.mockImplementation(() => yieldChunks([]));
  mockedRunOpenAIStreaming.mockImplementation(() => yieldChunks([]));
});

afterEach(() => {
  // Unstub fetch between tests so discovery mocks don't leak.
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (originalEnv === undefined) delete process.env.AGENT_CC_DATA;
  else process.env.AGENT_CC_DATA = originalEnv;
});

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. Provider CRUD roundtrip
// ---------------------------------------------------------------------------
//
// Pins the end-to-end CRUD contract a user experiences in the Settings page:
// create a provider with a real key, see it masked on the wire, edit, then
// delete. Built-in deletion is blocked per task001. These assertions overlap
// with `provider-crud.test.ts` deliberately — the E2E gate has to fail loudly
// if any one of them regresses.

describe("M11 E2E — provider CRUD roundtrip", () => {
  it("creates, lists (masked), updates, and deletes a custom provider", async () => {
    const app = buildApp();

    // Create custom openai-compatible provider with a real key.
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "MyCloudProvider",
        type: "openai-compatible",
        baseUrl: "https://api.example.test",
        auth: { type: "api-key", apiKey: "sk-test-1234567890" },
        capabilities: { temperature: true, systemPrompt: true },
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    // Created response is already masked.
    expect(created.body.auth.apiKey).toMatch(/^sk-\.\.\.7890$/);

    // GET list shows it with masked key.
    const list = await request(app).get("/api/providers");
    expect(list.status).toBe(200);
    const found = list.body.find((p: any) => p.id === id);
    expect(found).toBeTruthy();
    expect(found.auth.apiKey).toBe("sk-...7890");
    // Stored value retains the real secret.
    const stored = getDB().providers.find((p) => p.id === id);
    expect(stored?.auth.apiKey).toBe("sk-test-1234567890");

    // PUT: update baseUrl.
    const edited = await request(app)
      .put(`/api/providers/${id}`)
      .send({ baseUrl: "https://api.example.test/v2" });
    expect(edited.status).toBe(200);
    expect(edited.body.baseUrl).toBe("https://api.example.test/v2");

    // PUT with the masked form — the stored secret stays untouched.
    const keepKey = await request(app)
      .put(`/api/providers/${id}`)
      .send({
        auth: { type: "api-key", apiKey: "sk-...7890" },
      });
    expect(keepKey.status).toBe(200);
    const afterMasked = getDB().providers.find((p) => p.id === id);
    expect(afterMasked?.auth.apiKey).toBe("sk-test-1234567890");

    // DELETE custom provider.
    const del = await request(app).delete(`/api/providers/${id}`);
    expect(del.status).toBe(204);
    const afterDel = await request(app).get("/api/providers");
    expect(afterDel.body.find((p: any) => p.id === id)).toBeUndefined();
  });

  it("refuses to delete the built-in claude-code provider", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/providers/claude-code");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/built-in|builtin/i);
    expect(getDB().providers.some((p) => p.id === "claude-code")).toBe(true);
  });

  it("refuses to delete the built-in ollama provider", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/providers/ollama");
    expect(res.status).toBe(400);
    expect(getDB().providers.some((p) => p.id === "ollama")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. OAuth schema enforcement
// ---------------------------------------------------------------------------

describe("M11 E2E — OAuth schema", () => {
  it("rejects oauth providers missing oauthConfig (400)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "BadOAuth",
        type: "openai-compatible",
        baseUrl: "https://api.example.test",
        auth: { type: "oauth" },
        capabilities: { temperature: true },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/oauth/i);
  });

  it("accepts a full oauthConfig and scrubs clientSecret from the wire", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "GoodOAuth",
        type: "openai-compatible",
        baseUrl: "https://api.example.test",
        auth: {
          type: "oauth",
          oauthConfig: {
            authUrl: "https://example.test/authorize",
            tokenUrl: "https://example.test/token",
            clientId: "client-abc",
            clientSecret: "keep-server-side-only",
            scopes: ["read", "write"],
          },
        },
        capabilities: { temperature: true },
      });
    expect(res.status).toBe(201);
    // clientSecret must not appear anywhere on the response body.
    expect(JSON.stringify(res.body)).not.toContain("keep-server-side-only");
    // GET list also scrubs secret but keeps the public fields.
    const id = res.body.id as string;
    const list = await request(app).get("/api/providers");
    const found = list.body.find((p: any) => p.id === id);
    expect(found.auth.type).toBe("oauth");
    expect(found.auth.oauthConfig?.authUrl).toBe(
      "https://example.test/authorize",
    );
    expect(found.auth.oauthConfig?.tokenUrl).toBe(
      "https://example.test/token",
    );
    expect(found.auth.oauthConfig?.clientId).toBe("client-abc");
    expect(JSON.stringify(found.auth)).not.toContain("keep-server-side-only");
    expect(JSON.stringify(found.auth)).not.toMatch(/oauthTokens/);
    // Stored record keeps the secret for server-side token exchange.
    const stored = getDB().providers.find((p) => p.id === id);
    expect(stored?.auth.oauthConfig?.clientSecret).toBe(
      "keep-server-side-only",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Model discovery (Claude / Ollama / OpenAI / unavailable)
// ---------------------------------------------------------------------------

describe("M11 E2E — model discovery", () => {
  it("returns the known Claude Code model set without external fetch", async () => {
    // Spy on fetch so we can assert the Claude path never hits the network.
    const fetchSpy = vi.fn(async () => {
      throw new Error(
        "fetch should not be called for the claude-cli discovery path",
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp();
    const res = await request(app).get("/api/providers/claude-code/models");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Pin the contract at 3 known Claude models — the test suite-level
    // invariant lives in `tests/model-discovery.test.ts` as well; this copy
    // guards the HTTP surface specifically.
    expect(res.body.length).toBe(3);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toContain("claude-opus-4-6");
    expect(ids).toContain("claude-sonnet-4-6");
    // Fetch was not called.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("discovers Ollama models via /api/tags", async () => {
    const fetchSpy = vi.fn(async (url: any) => {
      expect(String(url)).toBe("http://localhost:11434/api/tags");
      return new Response(
        JSON.stringify({ models: [{ name: "llama3.2:8b" }, { name: "qwen2.5:3b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp();
    // Built-in ollama baseUrl = http://localhost:11434 (see defaultProviders).
    const res = await request(app).get("/api/providers/ollama/models");
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(["llama3.2:8b", "qwen2.5:3b"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("discovers generic OpenAI-compatible models via /v1/models", async () => {
    // Add a non-ollama provider (baseUrl without :11434 / 'ollama').
    const db = getDB();
    const customProvider: ProviderConfig = {
      id: "openai-custom",
      name: "My OpenAI",
      type: "openai-compatible",
      baseUrl: "https://api.example.test",
      auth: { type: "api-key", apiKey: "sk-abc" },
      capabilities: { temperature: true },
    };
    db.providers.push(customProvider);
    saveSync();

    const fetchSpy = vi.fn(async (url: any, init?: any) => {
      expect(String(url)).toBe("https://api.example.test/v1/models");
      // Auth header must be present when auth.type === 'api-key'.
      expect(init?.headers?.Authorization).toBe("Bearer sk-abc");
      return new Response(
        JSON.stringify({ data: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp();
    const res = await request(app).get("/api/providers/openai-custom/models");
    expect(res.status).toBe(200);
    const ids = res.body.map((m: any) => m.id);
    expect(ids).toEqual(["gpt-4", "gpt-3.5-turbo"]);
  });

  it("returns an empty array when the provider fetch rejects (no crash)", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp();
    // Ollama default baseUrl, but fetch will throw — graceful degradation.
    const res = await request(app).get("/api/providers/ollama/models");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 404 when discovery is requested for an unknown provider id", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/providers/does-not-exist/models",
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 4. Provider-aware routing through POST /api/chat/prompt
// ---------------------------------------------------------------------------
//
// Proves that Part 1 — wiring `providerId` into the composer's POST body —
// actually exercises the router. The `no providerId field` case covers the
// legacy client fallback to `claude-code`.

describe("M11 E2E — provider-aware routing", () => {
  it("routes claude-code providerId to runClaudeStreaming", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-claude",
      text: "hello claude",
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
    });
    expect(res.status).toBe(200);
    // Fire-and-forget dispatch — give the async loop a tick.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunClaudeStreaming).toHaveBeenCalledTimes(1);
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
  });

  it("routes ollama providerId to runOpenAIStreaming with the correct baseUrl + model", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-ollama",
      text: "hi ollama",
      providerId: "ollama",
      model: "llama3.2",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunOpenAIStreaming).toHaveBeenCalledTimes(1);
    expect(mockedRunClaudeStreaming).not.toHaveBeenCalled();
    const req = mockedRunOpenAIStreaming.mock.calls[0][0];
    expect(req.provider.id).toBe("ollama");
    expect(req.provider.baseUrl).toBe("http://localhost:11434");
    expect(req.model).toBe("llama3.2");
    expect(req.messages[req.messages.length - 1]).toEqual({
      role: "user",
      content: "hi ollama",
    });
  });

  it("yields a 'Provider not found' chunk for an unknown providerId", async () => {
    // SSE broadcast happens inside the route's fire-and-forget loop — we
    // can't read it through supertest without holding an EventSource, so we
    // assert via adapter call list + router module behavior.
    const app = buildApp();
    const res = await request(app).post("/api/chat/prompt").send({
      conversationId: "c-ghost",
      text: "nobody home",
      providerId: "ghost-provider",
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunClaudeStreaming).not.toHaveBeenCalled();
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();

    // Confirm the router module yields the descriptive error chunk — this
    // is the exact frame the route broadcasts to any SSE subscriber.
    const { routeToProvider } = await import("../server/providers/router");
    const chunks: any[] = [];
    for await (const c of routeToProvider({
      providerId: "ghost-provider",
      prompt: "hi",
      conversationId: "c",
      settings: {},
    })) {
      chunks.push(c);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe("system");
    expect(String(chunks[0].raw?.error ?? "")).toMatch(/Provider not found/i);
  });

  it("defaults to claude-code when the POST body has no providerId (legacy clients)", async () => {
    // Proves the Part 1 fallback contract — if the composer store hasn't
    // resolved yet, chat-panel.tsx must omit the field rather than send
    // `undefined` / empty string, and the server must default to claude-code.
    const app = buildApp();
    const res = await request(app)
      .post("/api/chat/prompt")
      .send({ conversationId: "c-legacy", text: "hello" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedRunClaudeStreaming).toHaveBeenCalledTimes(1);
    expect(mockedRunOpenAIStreaming).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Structural checks — files exist, client-side wiring landed
// ---------------------------------------------------------------------------

describe("M11 E2E — structural checks", () => {
  it("server provider modules are present (adapter, router, oauth, discovery)", () => {
    expect(fs.existsSync(path.join(ROOT, "server/providers/openai-adapter.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(ROOT, "server/providers/router.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "server/providers/oauth.ts"))).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT, "server/providers/model-discovery.ts")),
    ).toBe(true);
  });

  it("client settings provider-manager component exists", () => {
    expect(
      fs.existsSync(
        path.join(ROOT, "client/src/components/settings/provider-manager.tsx"),
      ),
    ).toBe(true);
  });

  it("chat-panel.tsx includes providerId in the fetch POST body (Part 1 wiring)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/components/chat/chat-panel.tsx"),
      "utf-8",
    );
    // Identifier must appear at all — the regression we're guarding against
    // is chat-panel dropping the field entirely.
    expect(src).toMatch(/\bproviderId\b/);
    // It must be read off the settings store so the composer's provider
    // selector actually feeds routing. Pinning against `getSettings` is the
    // structural anchor — chat-panel destructures it from the full settings
    // bundle, same pattern as model/effort/etc.
    expect(src).toMatch(
      /getSettings\s*\([\s\S]*?\)[\s\S]*?providerId|providerId[\s\S]{0,300}getSettings/,
    );
    // It must be forwarded on the network. The body object is either
    // assembled inline inside JSON.stringify({...}) or built up in a local
    // variable that's passed to JSON.stringify(body). Accept either shape.
    const inlineStringify =
      /JSON\.stringify\(\s*\{[\s\S]*?providerId[\s\S]*?\}\s*\)/;
    const bodyAssign = /body(?:\.providerId|\[['"]providerId['"]\])/;
    expect(inlineStringify.test(src) || bodyAssign.test(src)).toBe(true);
  });

  it("settings-popover.tsx does not import BUILTIN_PROVIDERS (live store wiring)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/components/chat/settings-popover.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/\bBUILTIN_PROVIDERS\b/);
  });

  it("no runtime client module still imports from stores/builtin-providers (tests-only fixture)", () => {
    // Walk client/src for any .ts/.tsx that imports the fixture module. Tests
    // live outside client/src, so any match here is a runtime regression.
    const clientSrcDir = path.join(ROOT, "client/src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        // Skip the fixture module itself — it's allowed to exist.
        if (full.endsWith("stores/builtin-providers.ts")) continue;
        const src = fs.readFileSync(full, "utf-8");
        if (/from\s*['"][^'"]*builtin-providers['"]/.test(src)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(clientSrcDir);
    expect(offenders).toEqual([]);
  });
});
