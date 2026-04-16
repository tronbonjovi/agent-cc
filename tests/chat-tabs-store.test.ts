/**
 * Pure-logic tests for the client-side chat tabs Zustand store.
 *
 * The store lives under `client/src/stores/` but vitest's `exclude: ["client"]`
 * means tests in that tree would silently never run. Per the M6 contract,
 * every test file for this task lives in top-level `tests/`. We import the
 * store directly and mock `fetch` — no React Testing Library, no JSX.
 *
 * The contract we verify:
 *
 *   - `openTab` / `closeTab` / `setActiveTab` / `reorder` perform an
 *     optimistic local mutation, then PUT the full new state to
 *     `/api/chat/tabs`. On PUT failure the local state reverts.
 *   - `load` GETs `/api/chat/tabs` and hydrates tabs/activeTabId/order.
 *   - A fresh store has empty tabs, null activeTabId, empty order, loaded=false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChatTabsStore } from "../client/src/stores/chat-tabs-store";

type FetchMock = ReturnType<typeof vi.fn>;

const originalFetch = global.fetch;

function resetStore() {
  useChatTabsStore.setState({
    tabs: [],
    activeTabId: null,
    order: [],
    loaded: false,
  });
}

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

describe("chat-tabs store", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("openTab adds a tab, sets it active, persists via PUT", async () => {
    const fetchMock = mockFetchOk();

    await useChatTabsStore.getState().openTab("conv-1", "First");

    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual([{ conversationId: "conv-1", title: "First" }]);
    expect(s.activeTabId).toBe("conv-1");
    expect(s.order).toEqual(["conv-1"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat/tabs");
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      openTabs: [{ conversationId: "conv-1", title: "First" }],
      activeTabId: "conv-1",
      tabOrder: ["conv-1"],
    });
  });

  it("openTab is a no-op for an existing conversationId (except activating it)", async () => {
    mockFetchOk();
    // Seed two tabs with the second one active.
    useChatTabsStore.setState({
      tabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
      ],
      activeTabId: "b",
      order: ["a", "b"],
      loaded: true,
    });

    await useChatTabsStore.getState().openTab("a", "A-renamed");

    const s = useChatTabsStore.getState();
    // tabs order unchanged, title unchanged (we don't rename on re-open),
    // but active switches to the re-opened tab.
    expect(s.tabs).toEqual([
      { conversationId: "a", title: "A" },
      { conversationId: "b", title: "B" },
    ]);
    expect(s.order).toEqual(["a", "b"]);
    expect(s.activeTabId).toBe("a");
  });

  it("closeTab removes from tabs and order, clears activeTabId when it was the active one", async () => {
    mockFetchOk();
    useChatTabsStore.setState({
      tabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
      ],
      activeTabId: "a",
      order: ["a", "b"],
      loaded: true,
    });

    await useChatTabsStore.getState().closeTab("a");

    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual([{ conversationId: "b", title: "B" }]);
    expect(s.order).toEqual(["b"]);
    // When the active tab closes, the next tab in order becomes active.
    expect(s.activeTabId).toBe("b");
  });

  it("closeTab on the last tab nulls activeTabId", async () => {
    mockFetchOk();
    useChatTabsStore.setState({
      tabs: [{ conversationId: "a", title: "A" }],
      activeTabId: "a",
      order: ["a"],
      loaded: true,
    });

    await useChatTabsStore.getState().closeTab("a");

    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual([]);
    expect(s.order).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  it("setActiveTab updates activeTabId and persists", async () => {
    const fetchMock = mockFetchOk();
    useChatTabsStore.setState({
      tabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
      ],
      activeTabId: "a",
      order: ["a", "b"],
      loaded: true,
    });

    await useChatTabsStore.getState().setActiveTab("b");

    expect(useChatTabsStore.getState().activeTabId).toBe("b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.activeTabId).toBe("b");
  });

  it("reorder replaces the order array and persists", async () => {
    const fetchMock = mockFetchOk();
    useChatTabsStore.setState({
      tabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
        { conversationId: "c", title: "C" },
      ],
      activeTabId: "a",
      order: ["a", "b", "c"],
      loaded: true,
    });

    await useChatTabsStore.getState().reorder(["c", "a", "b"]);

    const s = useChatTabsStore.getState();
    expect(s.order).toEqual(["c", "a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.tabOrder).toEqual(["c", "a", "b"]);
  });

  it("load hydrates from GET /api/chat/tabs", async () => {
    const body = {
      openTabs: [
        { conversationId: "x", title: "X" },
        { conversationId: "y", title: "Y" },
      ],
      activeTabId: "y",
      tabOrder: ["x", "y"],
    };
    const fetchMock = mockFetchOk(body);

    await useChatTabsStore.getState().load();

    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual(body.openTabs);
    expect(s.activeTabId).toBe("y");
    expect(s.order).toEqual(["x", "y"]);
    expect(s.loaded).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat/tabs");
  });

  it("load tolerates missing fields in backend response (defensive defaults)", async () => {
    mockFetchOk({});
    await useChatTabsStore.getState().load();
    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
    expect(s.order).toEqual([]);
    expect(s.loaded).toBe(true);
  });

  it("optimistic openTab reverts on PUT failure", async () => {
    mockFetchFail();

    // Start from empty, expect rejection and a fully reverted state.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      useChatTabsStore.getState().openTab("conv-err", "Oops"),
    ).rejects.toBeDefined();

    const s = useChatTabsStore.getState();
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
    expect(s.order).toEqual([]);

    errSpy.mockRestore();
  });

  it("optimistic setActiveTab reverts on PUT failure", async () => {
    mockFetchFail();
    useChatTabsStore.setState({
      tabs: [
        { conversationId: "a", title: "A" },
        { conversationId: "b", title: "B" },
      ],
      activeTabId: "a",
      order: ["a", "b"],
      loaded: true,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      useChatTabsStore.getState().setActiveTab("b"),
    ).rejects.toBeDefined();

    // Active tab reverted to original "a".
    expect(useChatTabsStore.getState().activeTabId).toBe("a");

    errSpy.mockRestore();
  });
});
