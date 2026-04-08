import { describe, it, expect, beforeEach } from "vitest";

// Reset store between tests
let useTerminalGroupStore: any;

beforeEach(async () => {
  // Dynamic import to get fresh module — zustand stores are singletons
  const mod = await import("../client/src/stores/terminal-group-store");
  useTerminalGroupStore = mod.useTerminalGroupStore;
  // Reset to initial state
  useTerminalGroupStore.setState({
    groups: [],
    activeGroupId: null,
    focusedInstanceId: null,
    height: 300,
    collapsed: false,
    unreadInstanceIds: new Set<string>(),
  });
});

describe("terminal group store", () => {
  it("starts with empty groups", () => {
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toEqual([]);
    expect(state.activeGroupId).toBeNull();
  });

  it("createGroup adds a group and activates it", () => {
    const { createGroup } = useTerminalGroupStore.getState();
    createGroup("test-group", "test-instance", "bash");
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe("test-group");
    expect(state.groups[0].instances).toHaveLength(1);
    expect(state.groups[0].instances[0].id).toBe("test-instance");
    expect(state.groups[0].instances[0].name).toBe("bash");
    expect(state.activeGroupId).toBe("test-group");
  });

  it("splitGroup adds an instance to the active group", () => {
    const { createGroup, splitGroup } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "bash");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances).toHaveLength(2);
    expect(state.groups[0].instances[1].id).toBe("i2");
  });

  it("removeInstance removes instance from group", () => {
    const { createGroup, splitGroup, removeInstance } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "bash");
    removeInstance("g1", "i2");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances).toHaveLength(1);
    expect(state.groups[0].instances[0].id).toBe("i1");
  });

  it("removeInstance removes entire group when last instance is killed", () => {
    const { createGroup, removeInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    removeInstance("g1", "i1");
    const state = useTerminalGroupStore.getState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].id).toBe("g2");
    expect(state.activeGroupId).toBe("g2");
  });

  it("removeInstance activates nearest group when active group is removed", () => {
    const { createGroup, removeInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    createGroup("g3", "i3", "bash");
    // Active is g3 (last created). Remove it.
    removeInstance("g3", "i3");
    const state = useTerminalGroupStore.getState();
    expect(state.activeGroupId).toBe("g2");
  });

  it("setActiveGroup switches the active group", () => {
    const { createGroup, setActiveGroup } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    createGroup("g2", "i2", "bash");
    setActiveGroup("g1");
    expect(useTerminalGroupStore.getState().activeGroupId).toBe("g1");
  });

  it("renameInstance updates the instance name", () => {
    const { createGroup, renameInstance } = useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    renameInstance("i1", "dev server");
    const state = useTerminalGroupStore.getState();
    expect(state.groups[0].instances[0].name).toBe("dev server");
  });

  it("markUnread / clearUnread track activity", () => {
    const { createGroup, markUnread, clearUnread } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    markUnread("i1");
    expect(useTerminalGroupStore.getState().unreadInstanceIds.has("i1")).toBe(true);
    clearUnread("i1");
    expect(useTerminalGroupStore.getState().unreadInstanceIds.has("i1")).toBe(false);
  });

  it("toSerializable produces correct shape for server persistence", () => {
    const { createGroup, splitGroup, toSerializable } =
      useTerminalGroupStore.getState();
    createGroup("g1", "i1", "bash");
    splitGroup("g1", "i2", "zsh");
    const data = toSerializable();
    expect(data).toEqual({
      height: 300,
      collapsed: false,
      explorerWidth: 140,
      groups: [
        {
          id: "g1",
          instances: [
            { id: "i1", name: "bash" },
            { id: "i2", name: "zsh" },
          ],
        },
      ],
      activeGroupId: "g1",
    });
  });
});
