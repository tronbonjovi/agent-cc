/**
 * Pure-logic tests for the client-side chat settings Zustand store plus the
 * server-side global defaults route.
 *
 * Matches the pattern from `chat-tabs-store.test.ts`: the store lives under
 * `client/src/stores/` but tests live in top-level `tests/` so vitest's
 * `exclude: ["client"]` doesn't drop them silently. We import the store
 * directly and mock `fetch`.
 *
 * The contract we verify:
 *
 *   - `getSettings(conversationId)` falls through to `globalDefaults` when
 *     no override is set, and merges (override-wins) when one is set.
 *   - `updateSettings` merges partials — existing override fields survive.
 *   - `clearSettings` removes the override so `getSettings` falls back to
 *     defaults.
 *   - `loadGlobalDefaults` GETs the endpoint and hydrates.
 *   - `saveGlobalDefaults` PUTs and reverts on failure.
 *   - The route layer (supertest against the settings router) returns
 *     defaults on GET and validates/persists on PUT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { useChatSettingsStore } from "../client/src/stores/chat-settings-store";

const originalFetch = global.fetch;

function resetStore() {
  useChatSettingsStore.setState({
    globalDefaults: {
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      effort: "medium",
    },
    overrides: {},
    loaded: false,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOk(body: unknown = { ok: true }): FetchMock {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as FetchMock;
  global.fetch = fn as unknown as typeof global.fetch;
  return fn;
}

function mockFetchFail(): FetchMock {
  const fn = vi.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: "boom" }),
  })) as unknown as FetchMock;
  global.fetch = fn as unknown as typeof global.fetch;
  return fn;
}

describe("chat-settings store", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("getSettings returns global defaults when no override exists", () => {
    const s = useChatSettingsStore.getState().getSettings("conv-1");
    expect(s).toEqual({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      effort: "medium",
    });
  });

  it("getSettings merges overrides with defaults (override wins)", () => {
    useChatSettingsStore.getState().updateSettings("conv-1", {
      model: "claude-opus-4-6",
      thinking: true,
    });

    const s = useChatSettingsStore.getState().getSettings("conv-1");
    // `providerId` and `effort` come from defaults; `model` and `thinking`
    // come from the override.
    expect(s).toEqual({
      providerId: "claude-code",
      model: "claude-opus-4-6",
      effort: "medium",
      thinking: true,
    });
  });

  it("getSettings isolates per-conversation overrides — conv-2 still sees defaults", () => {
    useChatSettingsStore.getState().updateSettings("conv-1", {
      model: "claude-opus-4-6",
    });
    const conv2 = useChatSettingsStore.getState().getSettings("conv-2");
    expect(conv2.model).toBe("claude-sonnet-4-6");
  });

  it("updateSettings merges partials — existing override fields survive", () => {
    const { updateSettings, getSettings } = useChatSettingsStore.getState();
    updateSettings("conv-1", { model: "claude-opus-4-6" });
    updateSettings("conv-1", { thinking: true });
    // Second update shouldn't clobber the first — both fields should stick.
    const s = getSettings("conv-1");
    expect(s.model).toBe("claude-opus-4-6");
    expect(s.thinking).toBe(true);
  });

  it("clearSettings removes overrides, getSettings falls back to defaults", () => {
    const { updateSettings, clearSettings, getSettings } =
      useChatSettingsStore.getState();
    updateSettings("conv-1", { model: "claude-opus-4-6", thinking: true });
    clearSettings("conv-1");
    const s = getSettings("conv-1");
    expect(s).toEqual({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      effort: "medium",
    });
  });

  it("clearSettings on an unknown conversationId is a no-op", () => {
    // Shouldn't throw, shouldn't mutate overrides for any other tab.
    useChatSettingsStore.getState().updateSettings("conv-1", {
      model: "x",
    });
    useChatSettingsStore.getState().clearSettings("conv-nope");
    expect(useChatSettingsStore.getState().overrides["conv-1"]).toEqual({
      model: "x",
    });
  });

  it("loadGlobalDefaults hydrates from GET /api/settings/chat-defaults", async () => {
    const body = {
      providerId: "ollama",
      model: "llama3.2:8b",
      temperature: 0.7,
    };
    const fetchMock = mockFetchOk(body);

    await useChatSettingsStore.getState().loadGlobalDefaults();

    const s = useChatSettingsStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.globalDefaults.providerId).toBe("ollama");
    expect(s.globalDefaults.model).toBe("llama3.2:8b");
    expect(s.globalDefaults.temperature).toBe(0.7);
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/chat-defaults");
  });

  it("loadGlobalDefaults tolerates malformed responses — keeps fallback defaults", async () => {
    mockFetchOk({ weird: "shape" });
    await useChatSettingsStore.getState().loadGlobalDefaults();
    const s = useChatSettingsStore.getState();
    expect(s.loaded).toBe(true);
    // Still the fallback we reset to in beforeEach.
    expect(s.globalDefaults.providerId).toBe("claude-code");
    expect(s.globalDefaults.model).toBe("claude-sonnet-4-6");
  });

  it("saveGlobalDefaults PUTs the new shape and updates local state", async () => {
    const fetchMock = mockFetchOk();
    const next = {
      providerId: "ollama",
      model: "llama3.2:8b",
      temperature: 0.5,
    };

    await useChatSettingsStore.getState().saveGlobalDefaults(next);

    expect(useChatSettingsStore.getState().globalDefaults).toEqual(next);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/settings/chat-defaults");
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual(next);
  });

  it("saveGlobalDefaults reverts on PUT failure", async () => {
    mockFetchFail();
    const original = useChatSettingsStore.getState().globalDefaults;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      useChatSettingsStore.getState().saveGlobalDefaults({
        providerId: "broken",
        model: "broken",
      }),
    ).rejects.toBeDefined();

    // Reverted to the snapshot we took before the (simulated) PUT.
    expect(useChatSettingsStore.getState().globalDefaults).toEqual(original);

    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Route layer — GET/PUT /api/settings/chat-defaults
// ---------------------------------------------------------------------------

type ChatDefaultsShape = {
  providerId: string;
  model: string;
  effort?: string;
  thinking?: boolean;
  webSearch?: boolean;
  systemPrompt?: string;
  projectPath?: string;
  temperature?: number;
};

let fakeDB: { chatDefaults?: ChatDefaultsShape; appSettings?: unknown };

vi.mock("../server/db", async () => {
  const actual = await vi.importActual<typeof import("../server/db")>(
    "../server/db",
  );
  return {
    ...actual,
    getDB: () => fakeDB,
    save: vi.fn(),
    saveSync: vi.fn(),
  };
});

// Stub storage so the existing /api/settings handlers imported by the router
// don't crash on the mocked DB (they pull appSettings through storage).
vi.mock("../server/storage", () => ({
  storage: {
    getAppSettings: () => ({}),
    updateAppSettings: (patch: unknown) => patch,
  },
}));

vi.mock("../server/scanner/utils", () => ({
  clearProjectDirsCache: vi.fn(),
}));

import settingsRouter from "../server/routes/settings";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(settingsRouter);
  return app;
}

describe("chat-defaults route", () => {
  beforeEach(() => {
    fakeDB = {};
  });

  it("GET /api/settings/chat-defaults returns the default shape when nothing is persisted", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/settings/chat-defaults");
    expect(res.status).toBe(200);
    expect(res.body.providerId).toBe("claude-code");
    expect(res.body.model).toBe("claude-sonnet-4-6");
    expect(res.body.effort).toBe("medium");
  });

  it("GET /api/settings/chat-defaults returns the persisted value when present", async () => {
    fakeDB.chatDefaults = {
      providerId: "ollama",
      model: "llama3.2:8b",
      temperature: 0.6,
    };
    const app = buildApp();
    const res = await request(app).get("/api/settings/chat-defaults");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeDB.chatDefaults);
  });

  it("PUT /api/settings/chat-defaults persists the new state, GET returns it", async () => {
    const app = buildApp();
    const payload: ChatDefaultsShape = {
      providerId: "ollama",
      model: "llama3.2:8b",
      temperature: 0.4,
    };

    const putRes = await request(app)
      .put("/api/settings/chat-defaults")
      .send(payload);
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual(payload);

    // fakeDB.chatDefaults was updated in place by the handler.
    expect(fakeDB.chatDefaults).toEqual(payload);

    const getRes = await request(app).get("/api/settings/chat-defaults");
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(payload);
  });

  it("PUT /api/settings/chat-defaults rejects missing required fields", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({ providerId: "ollama" }); // model missing
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/model/);
  });

  it("PUT /api/settings/chat-defaults rejects temperature out of range", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/settings/chat-defaults")
      .send({
        providerId: "ollama",
        model: "llama3.2:8b",
        temperature: 5,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/temperature/);
  });
});
