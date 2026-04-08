import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for the terminal explorer panel horizontal resize.
 *
 * The explorer panel (right side of terminal) has a drag handle on its
 * left edge that allows horizontal resizing. Width is stored in the
 * terminal group store and persisted.
 */

let useTerminalGroupStore: any;

beforeEach(async () => {
  const mod = await import("../client/src/stores/terminal-group-store");
  useTerminalGroupStore = mod.useTerminalGroupStore;
  useTerminalGroupStore.setState({
    groups: [],
    activeGroupId: null,
    focusedInstanceId: null,
    height: 300,
    collapsed: false,
    explorerWidth: 140,
    unreadInstanceIds: new Set<string>(),
  });
});

describe("terminal explorer resize — store", () => {
  it("has default explorerWidth of 140", () => {
    const state = useTerminalGroupStore.getState();
    expect(state.explorerWidth).toBe(140);
  });

  it("setExplorerWidth updates the width", () => {
    const { setExplorerWidth } = useTerminalGroupStore.getState();
    setExplorerWidth(250);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(250);
  });

  it("setExplorerWidth clamps to minimum of 100", () => {
    const { setExplorerWidth } = useTerminalGroupStore.getState();
    setExplorerWidth(50);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(100);
  });

  it("setExplorerWidth clamps to maximum of 400", () => {
    const { setExplorerWidth } = useTerminalGroupStore.getState();
    setExplorerWidth(600);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(400);
  });

  it("setExplorerWidth allows values within bounds", () => {
    const { setExplorerWidth } = useTerminalGroupStore.getState();
    setExplorerWidth(100);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(100);
    setExplorerWidth(400);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(400);
    setExplorerWidth(200);
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(200);
  });

  it("explorerWidth is included in toSerializable output", () => {
    const { setExplorerWidth, toSerializable } = useTerminalGroupStore.getState();
    setExplorerWidth(250);
    const data = useTerminalGroupStore.getState().toSerializable();
    expect(data.explorerWidth).toBe(250);
  });

  it("loadFromServer restores explorerWidth", () => {
    const { loadFromServer } = useTerminalGroupStore.getState();
    loadFromServer({
      height: 300,
      collapsed: false,
      groups: [],
      activeGroupId: null,
      explorerWidth: 275,
    });
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(275);
  });

  it("loadFromServer uses default 140 when explorerWidth not in data", () => {
    const { loadFromServer } = useTerminalGroupStore.getState();
    loadFromServer({
      height: 300,
      collapsed: false,
      groups: [],
      activeGroupId: null,
    });
    expect(useTerminalGroupStore.getState().explorerWidth).toBe(140);
  });
});
