/**
 * OAuth flow + token management — chat-provider-system task004.
 *
 * Two layers of coverage:
 *
 *   1. Pure `oauth.ts` helpers — `generateAuthUrl`, `exchangeCode`,
 *      `refreshAccessToken`, `getValidToken`. fetch is stubbed via
 *      `vi.stubGlobal` so we drive token-endpoint behavior per test.
 *
 *   2. Route layer — `/auth`, `/auth/callback`, `/disconnect`, `/status` on
 *      the providers router. Supertest drives the HTTP surface; the same
 *      tmp-DB + hoisted `AGENT_CC_DATA` trick as `provider-crud.test.ts` so
 *      we never touch the dev user's real DB.
 *
 * The key security invariants these tests pin down:
 *
 *   - `GET /api/providers` NEVER returns `oauthTokens` (or `clientSecret`).
 *   - Callback with a bad/missing `state` is rejected (CSRF guard).
 *   - `getValidToken` refreshes before expiry (5-min buffer).
 *   - `disconnect` clears the stored token record.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ProviderConfig } from "../shared/types";

const { tempDir, originalEnv } = vi.hoisted(() => {
  const fsMod = require("fs") as typeof import("fs");
  const osMod = require("os") as typeof import("os");
  const pathMod = require("path") as typeof import("path");
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "provider-oauth-"));
  const prev = process.env.AGENT_CC_DATA;
  process.env.AGENT_CC_DATA = dir;
  return { tempDir: dir, originalEnv: prev };
});

// Dynamic imports after env override so db.ts resolves tmp dir.
const providersRouter = (await import("../server/routes/providers")).default;
const oauthMod = await import("../server/providers/oauth");
const { getDB, saveSync, defaultProviders } = await import("../server/db");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(providersRouter);
  return app;
}

/** Adds a user-created OAuth provider to the DB and returns its ProviderConfig.
 *
 * Appends to the existing `db.providers` list rather than replacing it, so
 * a single test can seed multiple OAuth providers (see the cross-provider
 * CSRF test). Callers who need a pristine DB should call `resetDB()` first
 * via `beforeEach(resetDB)`. */
function seedOauthProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  const p: ProviderConfig = {
    id: "custom-oauth",
    name: "Custom OAuth",
    type: "openai-compatible",
    baseUrl: "https://api.example.com",
    auth: {
      type: "oauth",
      oauthConfig: {
        authUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
        clientId: "client-abc",
        clientSecret: "secret-xyz",
        scopes: ["read", "write"],
      },
    },
    capabilities: { temperature: true },
    ...overrides,
  };
  const db = getDB();
  if (!db.providers) db.providers = defaultProviders();
  // Replace if an id collision exists (so overrides within the same test
  // don't stack up), otherwise append.
  const existingIdx = db.providers.findIndex((x) => x.id === p.id);
  if (existingIdx === -1) db.providers.push(p);
  else db.providers[existingIdx] = p;
  saveSync();
  return p;
}

function resetDB() {
  const db = getDB();
  db.providers = defaultProviders();
  saveSync();
  // Flush any pending CSRF state from previous tests by re-importing helpers.
  oauthMod.__clearAuthStateStoreForTests();
}

afterAll(() => {
  if (originalEnv === undefined) delete process.env.AGENT_CC_DATA;
  else process.env.AGENT_CC_DATA = originalEnv;
});

// ---------------------------------------------------------------------------
// oauth.ts — pure helpers
// ---------------------------------------------------------------------------

describe("generateAuthUrl", () => {
  beforeEach(resetDB);

  it("builds an authorization URL with client_id, redirect_uri, response_type, scope, and state", () => {
    const provider = seedOauthProvider();
    const callbackUrl = "http://localhost:5100/api/providers/custom-oauth/auth/callback";
    const authUrl = oauthMod.generateAuthUrl(provider, callbackUrl);

    const parsed = new URL(authUrl);
    expect(parsed.origin + parsed.pathname).toBe("https://auth.example.com/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-abc");
    expect(parsed.searchParams.get("redirect_uri")).toBe(callbackUrl);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("read write");
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state!.length).toBeGreaterThanOrEqual(16);
  });

  it("records state→providerId in the CSRF store for later callback validation", () => {
    const provider = seedOauthProvider();
    const authUrl = oauthMod.generateAuthUrl(provider, "http://localhost/cb");
    const state = new URL(authUrl).searchParams.get("state")!;
    expect(oauthMod.__peekAuthStateForTests(state)).toBe("custom-oauth");
  });
});

describe("exchangeCode", () => {
  beforeEach(resetDB);

  it("POSTs grant_type=authorization_code + code + redirect_uri + client creds to tokenUrl", async () => {
    const provider = seedOauthProvider();
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://auth.example.com/token");
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(init!.body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("the-code");
      expect(body.get("redirect_uri")).toBe("http://localhost/cb");
      expect(body.get("client_id")).toBe("client-abc");
      expect(body.get("client_secret")).toBe("secret-xyz");
      return new Response(
        JSON.stringify({ access_token: "AT1", refresh_token: "RT1", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const now = Date.now();
      const tokens = await oauthMod.exchangeCode(provider, "the-code", "http://localhost/cb");
      expect(tokens.accessToken).toBe("AT1");
      expect(tokens.refreshToken).toBe("RT1");
      // expiresAt ≈ now + 3600*1000 (small skew OK)
      expect(tokens.expiresAt).toBeGreaterThanOrEqual(now + 3500_000);
      expect(tokens.expiresAt).toBeLessThanOrEqual(now + 3700_000);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits client_secret when the provider did not configure one", async () => {
    const provider = seedOauthProvider({
      auth: {
        type: "oauth",
        oauthConfig: {
          authUrl: "https://auth.example.com/authorize",
          tokenUrl: "https://auth.example.com/token",
          clientId: "pub-only",
        },
      },
    });
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(init!.body as string);
      expect(body.has("client_secret")).toBe(false);
      return new Response(
        JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await oauthMod.exchangeCode(provider, "c", "http://localhost/cb");
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws when the token endpoint returns non-2xx", async () => {
    const provider = seedOauthProvider();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad code", { status: 400 })));
    try {
      await expect(
        oauthMod.exchangeCode(provider, "c", "http://localhost/cb"),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("refreshAccessToken", () => {
  beforeEach(resetDB);

  it("POSTs grant_type=refresh_token with the stored refresh_token + client credentials", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "old",
      refreshToken: "RT-stored",
      expiresAt: Date.now() - 1_000,
    };
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(init!.body as string);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("RT-stored");
      expect(body.get("client_id")).toBe("client-abc");
      expect(body.get("client_secret")).toBe("secret-xyz");
      return new Response(
        JSON.stringify({ access_token: "AT-new", refresh_token: "RT-new", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const tokens = await oauthMod.refreshAccessToken(provider);
      expect(tokens.accessToken).toBe("AT-new");
      expect(tokens.refreshToken).toBe("RT-new");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the existing refresh_token when the server does not return a new one", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "old",
      refreshToken: "RT-keep",
      expiresAt: Date.now() - 1_000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ access_token: "AT-rotated", expires_in: 1800 }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      const tokens = await oauthMod.refreshAccessToken(provider);
      expect(tokens.accessToken).toBe("AT-rotated");
      expect(tokens.refreshToken).toBe("RT-keep");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws if the provider has no stored refresh token", async () => {
    const provider = seedOauthProvider();
    await expect(oauthMod.refreshAccessToken(provider)).rejects.toThrow();
  });
});

describe("getValidToken", () => {
  beforeEach(resetDB);

  it("returns the cached access token when not expired (with 5-min buffer)", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "still-valid",
      refreshToken: "RT",
      expiresAt: Date.now() + 10 * 60_000, // 10 minutes out
    };
    saveSync();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const token = await oauthMod.getValidToken(provider);
      expect(token).toBe("still-valid");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes when the access token is within the 5-minute buffer window", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "about-to-expire",
      refreshToken: "RT-old",
      expiresAt: Date.now() + 2 * 60_000, // 2 minutes — inside buffer
    };
    // Persist so getValidToken can save the refreshed record back.
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "AT-refreshed",
              refresh_token: "RT-refreshed",
              expires_in: 3600,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      const token = await oauthMod.getValidToken(provider);
      expect(token).toBe("AT-refreshed");

      // Stored back in DB.
      const stored = getDB().providers.find((p) => p.id === provider.id)!;
      expect(stored.auth.oauthTokens?.accessToken).toBe("AT-refreshed");
      expect(stored.auth.oauthTokens?.refreshToken).toBe("RT-refreshed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes when the access token is already past expiresAt", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "expired",
      refreshToken: "RT",
      expiresAt: Date.now() - 60_000,
    };
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ access_token: "AT-post-expiry", expires_in: 3600 }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      const token = await oauthMod.getValidToken(provider);
      expect(token).toBe("AT-post-expiry");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws if the provider has no tokens at all (user never connected)", async () => {
    const provider = seedOauthProvider();
    delete provider.auth.oauthTokens;
    await expect(oauthMod.getValidToken(provider)).rejects.toThrow();
  });

  it("throws when the refresh call fails (caller should surface re-authenticate)", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "expired",
      refreshToken: "RT",
      expiresAt: Date.now() - 60_000,
    };
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    try {
      await expect(oauthMod.getValidToken(provider)).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// Routes — /auth, /auth/callback, /disconnect, /status
// ---------------------------------------------------------------------------

describe("GET /api/providers/:id/auth", () => {
  beforeEach(resetDB);

  it("returns an authUrl that carries state + client_id + redirect_uri", async () => {
    seedOauthProvider();
    const app = buildApp();
    const res = await request(app).get("/api/providers/custom-oauth/auth");
    expect(res.status).toBe(200);
    expect(typeof res.body.authUrl).toBe("string");
    const parsed = new URL(res.body.authUrl);
    expect(parsed.searchParams.get("client_id")).toBe("client-abc");
    expect(parsed.searchParams.get("state")).toBeTruthy();
    const redirect = parsed.searchParams.get("redirect_uri")!;
    expect(redirect).toMatch(
      /\/api\/providers\/custom-oauth\/auth\/callback$/,
    );
  });

  it("returns 404 for an unknown provider id", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/providers/no-such/auth");
    expect(res.status).toBe(404);
  });

  it("returns 400 when the provider is not configured for oauth", async () => {
    const app = buildApp();
    // claude-code has auth.type === "none".
    const res = await request(app).get("/api/providers/claude-code/auth");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/providers/:id/auth/callback", () => {
  beforeEach(resetDB);

  it("exchanges code for tokens, stores them server-side, and returns a self-closing HTML page", async () => {
    const provider = seedOauthProvider();
    const app = buildApp();

    // Initiate to seed a valid state.
    const initRes = await request(app).get(`/api/providers/${provider.id}/auth`);
    const state = new URL(initRes.body.authUrl).searchParams.get("state")!;

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "AT-cb",
              refresh_token: "RT-cb",
              expires_in: 3600,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      const res = await request(app)
        .get(`/api/providers/${provider.id}/auth/callback`)
        .query({ code: "exchange-me", state });
      expect(res.status).toBe(200);
      expect(res.text).toContain("window.close()");

      const stored = getDB().providers.find((p) => p.id === provider.id)!;
      expect(stored.auth.oauthTokens?.accessToken).toBe("AT-cb");
      expect(stored.auth.oauthTokens?.refreshToken).toBe("RT-cb");
      expect(typeof stored.auth.oauthTokens?.expiresAt).toBe("number");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a callback with no state (CSRF guard)", async () => {
    const provider = seedOauthProvider();
    const app = buildApp();
    const res = await request(app)
      .get(`/api/providers/${provider.id}/auth/callback`)
      .query({ code: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects a callback whose state is not in the CSRF store", async () => {
    const provider = seedOauthProvider();
    const app = buildApp();
    const res = await request(app)
      .get(`/api/providers/${provider.id}/auth/callback`)
      .query({ code: "x", state: "forged-state-value" });
    expect(res.status).toBe(400);
  });

  it("rejects a callback whose state was issued for a different provider", async () => {
    const a = seedOauthProvider({ id: "provider-a" });
    seedOauthProvider({ id: "provider-b" });
    const app = buildApp();

    // Initiate on provider-a, then try to use that state on provider-b.
    const init = await request(app).get(`/api/providers/${a.id}/auth`);
    const state = new URL(init.body.authUrl).searchParams.get("state")!;

    const res = await request(app)
      .get(`/api/providers/provider-b/auth/callback`)
      .query({ code: "x", state });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/providers/:id/disconnect", () => {
  beforeEach(resetDB);

  it("clears stored oauth tokens and reports connected: false", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 60_000,
    };
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    const app = buildApp();
    const res = await request(app).post(`/api/providers/${provider.id}/disconnect`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);

    const stored = getDB().providers.find((p) => p.id === provider.id)!;
    expect(stored.auth.oauthTokens).toBeUndefined();
  });

  it("returns 404 for an unknown provider", async () => {
    const app = buildApp();
    const res = await request(app).post(`/api/providers/does-not-exist/disconnect`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/providers/:id/status", () => {
  beforeEach(resetDB);

  it("reports connected: false when no tokens are stored", async () => {
    const provider = seedOauthProvider();
    const app = buildApp();
    const res = await request(app).get(`/api/providers/${provider.id}/status`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  it("reports connected: true once tokens are stored", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 60_000,
    };
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    const app = buildApp();
    const res = await request(app).get(`/api/providers/${provider.id}/status`);
    expect(res.body.connected).toBe(true);
  });

  it("returns 404 for an unknown provider", async () => {
    const app = buildApp();
    const res = await request(app).get(`/api/providers/nope/status`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/providers — oauth secret leakage guard", () => {
  beforeEach(resetDB);

  it("never exposes oauthTokens or clientSecret on the wire", async () => {
    const provider = seedOauthProvider();
    provider.auth.oauthTokens = {
      accessToken: "SECRET-ACCESS-TOKEN",
      refreshToken: "SECRET-REFRESH-TOKEN",
      expiresAt: Date.now() + 3600_000,
    };
    const db = getDB();
    db.providers = db.providers.map((x) => (x.id === provider.id ? provider : x));
    saveSync();

    const app = buildApp();
    const res = await request(app).get("/api/providers");
    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain("SECRET-ACCESS-TOKEN");
    expect(payload).not.toContain("SECRET-REFRESH-TOKEN");
    expect(payload).not.toContain("secret-xyz"); // clientSecret
  });
});

// Keep reference so `tempDir` doesn't get marked unused by TS lint.
void tempDir;
