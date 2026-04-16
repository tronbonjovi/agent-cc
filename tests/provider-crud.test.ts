/**
 * Provider CRUD + storage — chat-provider-system task001.
 *
 * Exercises the real settings-layer router at `server/routes/providers.ts`
 * against an isolated tmp DB directory. Drives it with supertest so every
 * assertion is end-to-end: the test body issues HTTP verbs, the router
 * mutates `db.providers`, and either the next request or a direct DB read
 * confirms persistence.
 *
 * Boundaries covered:
 *
 *   - GET  /api/providers           — list with masked API keys
 *   - POST /api/providers           — create + id generation + validation
 *   - PUT  /api/providers/:id       — merge updates, mask guard, built-in
 *                                     `id` / `type` lock
 *   - DELETE /api/providers/:id     — refuses built-ins, succeeds otherwise
 *
 * Hoisted `AGENT_CC_DATA` override is the same pattern used by
 * `chat-multi-tab-e2e.test.ts`: `vi.hoisted` runs before module imports so
 * `server/db.ts` resolves its data path against a tmp dir instead of
 * `~/.agent-cc/`. Without this, these tests would clobber the dev user's DB.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";

const { tempDir, originalEnv } = vi.hoisted(() => {
  const fsMod = require("fs") as typeof import("fs");
  const osMod = require("os") as typeof import("os");
  const pathMod = require("path") as typeof import("path");
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "provider-crud-"));
  const prev = process.env.AGENT_CC_DATA;
  process.env.AGENT_CC_DATA = dir;
  return { tempDir: dir, originalEnv: prev };
});

// Dynamic import after env is set so db.ts picks up the tmp dir.
const providersRouter = (await import("../server/routes/providers")).default;
const { getDB, saveSync, defaultProviders } = await import("../server/db");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(providersRouter);
  return app;
}

function resetDB() {
  const db = getDB();
  db.providers = defaultProviders();
  saveSync();
}

afterAll(() => {
  // Restore env so later test files don't inherit the tmp dir.
  if (originalEnv === undefined) delete process.env.AGENT_CC_DATA;
  else process.env.AGENT_CC_DATA = originalEnv;
});

describe("GET /api/providers", () => {
  beforeEach(resetDB);

  it("returns the list of providers including built-ins", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/providers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain("claude-code");
    expect(ids).toContain("ollama");
  });

  it("marks built-in providers with builtin: true", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/providers");
    const claude = res.body.find((p: any) => p.id === "claude-code");
    expect(claude.builtin).toBe(true);
  });

  it("masks api keys in responses, showing only the last 4 chars", async () => {
    // Seed a custom provider with a secret, then GET and assert the wire
    // form is masked. The stored value in the DB stays intact.
    const db = getDB();
    db.providers.push({
      id: "custom-openai",
      name: "Custom",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "api-key", apiKey: "sk-supersecret-abcd1234" },
      capabilities: { temperature: true },
    });
    saveSync();

    const app = buildApp();
    const res = await request(app).get("/api/providers");
    const custom = res.body.find((p: any) => p.id === "custom-openai");
    expect(custom).toBeTruthy();
    expect(custom.auth.type).toBe("api-key");
    expect(custom.auth.apiKey).not.toContain("supersecret");
    expect(custom.auth.apiKey).toMatch(/1234$/);
    // The DB itself still holds the real secret — only the response is
    // masked.
    const stored = getDB().providers.find((p) => p.id === "custom-openai");
    expect(stored?.auth.apiKey).toBe("sk-supersecret-abcd1234");
  });

  it("never exposes oauth token fields in responses", async () => {
    const db = getDB();
    db.providers.push({
      id: "custom-oauth",
      name: "Custom OAuth",
      type: "openai-compatible",
      baseUrl: "https://api.example.com",
      auth: { type: "oauth" } as any,
      capabilities: { temperature: true },
    });
    // Simulate a hand-persisted oauth secret on the stored record.
    (getDB().providers.find((p) => p.id === "custom-oauth")!.auth as any).oauthToken = "tok-xyz";
    saveSync();

    const app = buildApp();
    const res = await request(app).get("/api/providers");
    const oauth = res.body.find((p: any) => p.id === "custom-oauth");
    expect(oauth.auth.type).toBe("oauth");
    expect(JSON.stringify(oauth.auth)).not.toContain("tok-xyz");
  });
});

describe("POST /api/providers", () => {
  beforeEach(resetDB);

  it("creates a new provider and generates a uuid id", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "My Local Ollama",
        type: "openai-compatible",
        baseUrl: "http://localhost:11434",
        auth: { type: "none" },
        capabilities: { temperature: true, systemPrompt: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(8);
    expect(res.body.name).toBe("My Local Ollama");
    // Persisted — a subsequent GET should find it.
    const list = await request(app).get("/api/providers");
    const found = list.body.find((p: any) => p.id === res.body.id);
    expect(found).toBeTruthy();
  });

  it("masks apiKey in the created-provider response", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "Custom Cloud",
        type: "openai-compatible",
        baseUrl: "https://api.example.com",
        auth: { type: "api-key", apiKey: "sk-abcdef-012345-wxyz" },
        capabilities: { temperature: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.auth.apiKey).not.toContain("abcdef");
    expect(res.body.auth.apiKey).toMatch(/wxyz$/);
  });

  it("rejects a payload missing the required name field", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        type: "openai-compatible",
        baseUrl: "https://api.example.com",
        auth: { type: "none" },
        capabilities: {},
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("rejects an invalid type value", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "Nope",
        type: "nonsense",
        auth: { type: "none" },
        capabilities: {},
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/i);
  });

  it("rejects openai-compatible providers that lack baseUrl", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "Needs URL",
        type: "openai-compatible",
        auth: { type: "none" },
        capabilities: { temperature: true },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/baseUrl/i);
  });

  it("does not require baseUrl for claude-cli providers", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/providers")
      .send({
        name: "Another Claude",
        type: "claude-cli",
        auth: { type: "none" },
        capabilities: { thinking: true, effort: true },
      });
    expect(res.status).toBe(201);
  });
});

describe("PUT /api/providers/:id", () => {
  beforeEach(resetDB);

  it("updates an existing provider's mutable fields", async () => {
    const app = buildApp();
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "Editable",
        type: "openai-compatible",
        baseUrl: "http://localhost:8000",
        auth: { type: "none" },
        capabilities: { temperature: true },
      });
    const id = created.body.id;

    const res = await request(app)
      .put(`/api/providers/${id}`)
      .send({ name: "Edited", baseUrl: "http://localhost:9000" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Edited");
    expect(res.body.baseUrl).toBe("http://localhost:9000");
  });

  it("preserves the stored apiKey when the client sends the masked form back", async () => {
    const app = buildApp();
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "Keyed",
        type: "openai-compatible",
        baseUrl: "https://api.example.com",
        auth: { type: "api-key", apiKey: "sk-realsecret-original-9999" },
        capabilities: { temperature: true },
      });
    const id = created.body.id;
    const maskedFromGet = created.body.auth.apiKey; // e.g. "sk-...9999"

    // Client sends back the masked value — server must detect + skip.
    const res = await request(app)
      .put(`/api/providers/${id}`)
      .send({
        name: "Keyed v2",
        auth: { type: "api-key", apiKey: maskedFromGet },
      });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Keyed v2");

    // The DB still has the original secret.
    const stored = getDB().providers.find((p) => p.id === id);
    expect(stored?.auth.apiKey).toBe("sk-realsecret-original-9999");
  });

  it("overwrites the stored apiKey when the client sends a fresh value", async () => {
    const app = buildApp();
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "Keyed",
        type: "openai-compatible",
        baseUrl: "https://api.example.com",
        auth: { type: "api-key", apiKey: "sk-original-1111" },
        capabilities: { temperature: true },
      });
    const id = created.body.id;

    const res = await request(app)
      .put(`/api/providers/${id}`)
      .send({ auth: { type: "api-key", apiKey: "sk-rotated-2222" } });
    expect(res.status).toBe(200);

    const stored = getDB().providers.find((p) => p.id === id);
    expect(stored?.auth.apiKey).toBe("sk-rotated-2222");
  });

  it("refuses to change id or type on a built-in provider", async () => {
    const app = buildApp();
    // Attempt to mutate `type` on claude-code (built-in). Server should
    // return 400 and leave the record unchanged.
    const res = await request(app)
      .put("/api/providers/claude-code")
      .send({ type: "openai-compatible", name: "Hacked" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/built-in|type/i);

    const stored = getDB().providers.find((p) => p.id === "claude-code");
    expect(stored?.type).toBe("claude-cli");
    expect(stored?.name).toBe("Claude Code");
  });

  it("allows updating a built-in provider's non-locked fields (name, baseUrl)", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/providers/ollama")
      .send({ name: "My Ollama", baseUrl: "http://192.168.1.10:11434" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("My Ollama");
    expect(res.body.baseUrl).toBe("http://192.168.1.10:11434");
    // builtin flag survives updates.
    expect(res.body.builtin).toBe(true);
  });

  it("returns 404 when the provider does not exist", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/providers/does-not-exist")
      .send({ name: "ghost" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/providers/:id", () => {
  beforeEach(resetDB);

  it("removes a user-created provider and returns 204", async () => {
    const app = buildApp();
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "Ephemeral",
        type: "openai-compatible",
        baseUrl: "http://localhost:9000",
        auth: { type: "none" },
        capabilities: {},
      });
    const id = created.body.id;

    const del = await request(app).delete(`/api/providers/${id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/providers");
    expect(list.body.find((p: any) => p.id === id)).toBeUndefined();
  });

  it("refuses to delete the claude-code built-in with 400", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/providers/claude-code");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/built-in|builtin/i);
    expect(getDB().providers.some((p) => p.id === "claude-code")).toBe(true);
  });

  it("refuses to delete the ollama built-in with 400", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/providers/ollama");
    expect(res.status).toBe(400);
    expect(getDB().providers.some((p) => p.id === "ollama")).toBe(true);
  });

  it("returns 404 when deleting a non-existent provider", async () => {
    const app = buildApp();
    const res = await request(app).delete("/api/providers/nope-nope-nope");
    expect(res.status).toBe(404);
  });
});

describe("defaults — DB seed + OLLAMA_URL", () => {
  it("ships claude-code and ollama as the default providers", () => {
    const seed = defaultProviders();
    const ids = seed.map((p) => p.id);
    expect(ids).toEqual(["claude-code", "ollama"]);
    expect(seed.every((p) => p.builtin === true)).toBe(true);
  });

  it("ollama default respects OLLAMA_URL when present", () => {
    const prev = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = "http://ollama-box:7777";
    try {
      const seed = defaultProviders();
      const ollama = seed.find((p) => p.id === "ollama");
      expect(ollama?.baseUrl).toBe("http://ollama-box:7777");
    } finally {
      if (prev === undefined) delete process.env.OLLAMA_URL;
      else process.env.OLLAMA_URL = prev;
    }
  });

  it("ollama default falls back to localhost:11434 when OLLAMA_URL is unset", () => {
    const prev = process.env.OLLAMA_URL;
    delete process.env.OLLAMA_URL;
    try {
      const seed = defaultProviders();
      const ollama = seed.find((p) => p.id === "ollama");
      expect(ollama?.baseUrl).toBe("http://localhost:11434");
    } finally {
      if (prev !== undefined) process.env.OLLAMA_URL = prev;
    }
  });
});
