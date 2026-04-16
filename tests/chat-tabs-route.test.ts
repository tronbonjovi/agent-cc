/**
 * Route tests for GET/PUT /api/chat/tabs — the persistence surface for chat
 * UI tab state. The route reads/writes `chatUIState` on the JSON DB.
 *
 * We mock `server/db` so tests never touch a real `~/.agent-cc/agent-cc.json`.
 * The mock holds an in-memory DBData slice so GET-after-PUT round-trips work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

type ChatUIStateShape = {
  openTabs: Array<{ conversationId: string; title: string }>;
  activeTabId: string | null;
  tabOrder: string[];
};

// In-memory DB slice reset per-test.
let fakeDB: { chatUIState?: ChatUIStateShape };

vi.mock("../server/db", () => {
  return {
    getDB: () => fakeDB,
    save: vi.fn(),
    saveSync: vi.fn(),
  };
});

import chatTabsRouter from "../server/routes/chat-tabs";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatTabsRouter);
  return app;
}

describe("chat-tabs route", () => {
  beforeEach(() => {
    fakeDB = {};
  });

  it("GET /api/chat/tabs returns the migration-safe default when chatUIState is absent", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/chat/tabs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      openTabs: [],
      activeTabId: null,
      tabOrder: [],
    });
  });

  it("GET /api/chat/tabs returns the persisted value when present", async () => {
    fakeDB.chatUIState = {
      openTabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
      ],
      activeTabId: "b",
      tabOrder: ["a", "b"],
    };
    const app = buildApp();
    const res = await request(app).get("/api/chat/tabs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeDB.chatUIState);
  });

  it("PUT /api/chat/tabs persists the new state, GET returns it", async () => {
    const app = buildApp();
    const payload: ChatUIStateShape = {
      openTabs: [{ conversationId: "z", title: "Z" }],
      activeTabId: "z",
      tabOrder: ["z"],
    };

    const putRes = await request(app).put("/api/chat/tabs").send(payload);
    expect(putRes.status).toBe(200);

    // Verify DB slice was updated in place via the save() writer path.
    expect(fakeDB.chatUIState).toEqual(payload);

    // Round-trip through GET.
    const getRes = await request(app).get("/api/chat/tabs");
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(payload);
  });

  it("PUT /api/chat/tabs rejects a body missing required fields with 400", async () => {
    const app = buildApp();
    // Missing activeTabId + tabOrder.
    const res = await request(app)
      .put("/api/chat/tabs")
      .send({ openTabs: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    // DB must not have been touched.
    expect(fakeDB.chatUIState).toBeUndefined();
  });

  it("PUT /api/chat/tabs rejects a body with the wrong shape with 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .put("/api/chat/tabs")
      .send({
        openTabs: "not-an-array",
        activeTabId: null,
        tabOrder: [],
      });
    expect(res.status).toBe(400);
  });

  it("PUT /api/chat/tabs accepts a valid empty state (all tabs closed)", async () => {
    const app = buildApp();
    const payload: ChatUIStateShape = {
      openTabs: [],
      activeTabId: null,
      tabOrder: [],
    };
    const res = await request(app).put("/api/chat/tabs").send(payload);
    expect(res.status).toBe(200);
    expect(fakeDB.chatUIState).toEqual(payload);
  });
});
