/**
 * Model discovery — chat-provider-system task005.
 *
 * Verifies the provider-agnostic `discoverModels()` helper on
 * `server/providers/model-discovery.ts`. Three provider shapes are covered:
 *
 *   - `claude-cli` — returns a known hardcoded set; no HTTP.
 *   - `openai-compatible` w/ Ollama baseUrl — `GET /api/tags` when the URL
 *     hints at Ollama; model list normalized to `{ id, name, provider }`.
 *   - `openai-compatible` w/ OpenAI-style baseUrl — `GET /v1/models`.
 *
 * Also pins the 60s cache TTL (second call inside the window skips fetch) and
 * graceful-degradation contract (fetch failure → empty list, never throws).
 *
 * We stub `globalThis.fetch` per-test rather than mocking the module so the
 * adapter exercises its real URL construction / header build paths.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ProviderConfig } from "../shared/types";

// Dynamic import so per-test cache resets land on a freshly-imported module.
// The cache is module-scoped; cleanest way to reset between tests is to
// re-import via `vi.resetModules()` + dynamic import.
async function loadModule() {
  return await import("../server/providers/model-discovery");
}

/** Build a JSON Response for fetch stubs. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function claudeProvider(): ProviderConfig {
  return {
    id: "claude-code",
    name: "Claude Code",
    type: "claude-cli",
    auth: { type: "none" },
    capabilities: {},
    builtin: true,
  };
}

function ollamaProvider(): ProviderConfig {
  return {
    id: "ollama",
    name: "Ollama",
    type: "openai-compatible",
    baseUrl: "http://localhost:11434",
    auth: { type: "none" },
    capabilities: {},
    builtin: true,
  };
}

function openaiProvider(opts?: { apiKey?: string }): ProviderConfig {
  return {
    id: "openai-test",
    name: "OpenAI",
    type: "openai-compatible",
    baseUrl: "https://api.example.test",
    auth: { type: opts?.apiKey ? "api-key" : "none", apiKey: opts?.apiKey },
    capabilities: {},
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("discoverModels — Claude Code", () => {
  it("returns the known Claude model set without any HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const models = await discoverModels(claudeProvider());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(models.length).toBeGreaterThan(0);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("claude-opus-4-6");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-haiku-4-5-20251001");
    // Each entry carries the provider id for downstream grouping in the UI.
    expect(models.every((m) => m.provider === "claude-code")).toBe(true);
    // Display names look human (not the raw id).
    const opus = models.find((m) => m.id === "claude-opus-4-6");
    expect(opus?.name).toMatch(/Opus/);
  });
});

describe("discoverModels — Ollama", () => {
  it("calls GET {baseUrl}/api/tags and maps name → {id,name}", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://localhost:11434/api/tags");
      return jsonResponse({
        models: [
          { name: "llama3.2:8b", size: 1 },
          { name: "qwen2.5:7b", size: 2 },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const models = await discoverModels(ollamaProvider());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models).toEqual([
      { id: "llama3.2:8b", name: "llama3.2:8b", provider: "ollama" },
      { id: "qwen2.5:7b", name: "qwen2.5:7b", provider: "ollama" },
    ]);
  });

  it("returns [] when Ollama is unreachable (fetch rejects)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const models = await discoverModels(ollamaProvider());
    expect(models).toEqual([]);
  });

  it("returns [] when Ollama responds with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "bad" }, 500)),
    );

    const { discoverModels } = await loadModule();
    const models = await discoverModels(ollamaProvider());
    expect(models).toEqual([]);
  });
});

describe("discoverModels — OpenAI-compatible", () => {
  it("calls GET {baseUrl}/v1/models and maps data[].id → {id,name}", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.test/v1/models");
      // No auth header when auth.type === "none"
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
      return jsonResponse({
        data: [
          { id: "gpt-4", object: "model" },
          { id: "gpt-3.5-turbo", object: "model" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const models = await discoverModels(openaiProvider());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models).toEqual([
      { id: "gpt-4", name: "gpt-4", provider: "openai-test" },
      { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo", provider: "openai-test" },
    ]);
  });

  it("attaches Authorization: Bearer <key> when auth.type is api-key", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer sk-secret-abcd");
      return jsonResponse({ data: [{ id: "gpt-4" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    await discoverModels(openaiProvider({ apiKey: "sk-secret-abcd" }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns [] when the endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const { discoverModels } = await loadModule();
    const models = await discoverModels(openaiProvider());
    expect(models).toEqual([]);
  });

  it("returns [] when the response shape is unexpected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ not: "what we expected" })),
    );

    const { discoverModels } = await loadModule();
    const models = await discoverModels(openaiProvider());
    expect(models).toEqual([]);
  });
});

describe("discoverModels — caching", () => {
  it("caches results per provider id for 60 seconds", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ models: [{ name: "llama3.2:8b" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const first = await discoverModels(ollamaProvider());
    const second = await discoverModels(ollamaProvider());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("re-fetches after the 60s TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T00:00:00Z"));

    const fetchMock = vi.fn(async () =>
      jsonResponse({ models: [{ name: "llama3.2:8b" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    await discoverModels(ollamaProvider());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance 61s — past the TTL.
    vi.setSystemTime(new Date("2026-04-16T00:01:01Z"));
    await discoverModels(ollamaProvider());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches separately per provider id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("localhost")) {
        return jsonResponse({ models: [{ name: "llama3.2:8b" }] });
      }
      return jsonResponse({ data: [{ id: "gpt-4" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    await discoverModels(ollamaProvider());
    await discoverModels(openaiProvider());
    await discoverModels(ollamaProvider());
    await discoverModels(openaiProvider());

    // 2 fetches total — one per provider, the next two hit the cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache empty results from a failure (so retries can succeed)", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("transient");
      return jsonResponse({ models: [{ name: "llama3.2:8b" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { discoverModels } = await loadModule();
    const first = await discoverModels(ollamaProvider());
    expect(first).toEqual([]);

    const second = await discoverModels(ollamaProvider());
    expect(second).toEqual([
      { id: "llama3.2:8b", name: "llama3.2:8b", provider: "ollama" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/providers/:id/models route", () => {
  it("returns discovered models for a known provider", async () => {
    // Route-level test — sets up a tmp DB via AGENT_CC_DATA, seeds providers,
    // then exercises the router end-to-end. Dynamic imports so the DB layer
    // honors the env override.
    const { default: express } = await import("express");
    const { default: request } = await import("supertest");
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "model-discovery-route-"));
    const prev = process.env.AGENT_CC_DATA;
    process.env.AGENT_CC_DATA = tmp;
    try {
      vi.resetModules();
      const providersRouter = (await import("../server/routes/providers")).default;
      const { getDB, saveSync, defaultProviders } = await import("../server/db");
      const db = getDB();
      db.providers = defaultProviders();
      saveSync();

      // Stub fetch so the openai-compatible route goes through model-discovery.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({ models: [{ name: "llama3.2:8b" }] }),
        ),
      );

      const app = express();
      app.use(express.json());
      app.use(providersRouter);

      const res = await request(app).get("/api/providers/claude-code/models");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const ids = res.body.map((m: { id: string }) => m.id);
      expect(ids).toContain("claude-opus-4-6");
    } finally {
      if (prev === undefined) delete process.env.AGENT_CC_DATA;
      else process.env.AGENT_CC_DATA = prev;
    }
  });

  it("returns 404 for an unknown provider id", async () => {
    const { default: express } = await import("express");
    const { default: request } = await import("supertest");
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "model-discovery-route-404-"),
    );
    const prev = process.env.AGENT_CC_DATA;
    process.env.AGENT_CC_DATA = tmp;
    try {
      vi.resetModules();
      const providersRouter = (await import("../server/routes/providers")).default;
      const { getDB, saveSync, defaultProviders } = await import("../server/db");
      const db = getDB();
      db.providers = defaultProviders();
      saveSync();

      const app = express();
      app.use(express.json());
      app.use(providersRouter);

      const res = await request(app).get("/api/providers/does-not-exist/models");
      expect(res.status).toBe(404);
    } finally {
      if (prev === undefined) delete process.env.AGENT_CC_DATA;
      else process.env.AGENT_CC_DATA = prev;
    }
  });
});
