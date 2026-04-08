import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for the terminal panel toggle behavior.
 *
 * The terminal panel has a single toggle button that:
 * - Collapses the panel when open (setCollapsed(true))
 * - Expands the panel when collapsed (setCollapsed(false))
 *
 * The toolbar (with the toggle button) is always visible in both states,
 * so the button stays in the same position.
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
    unreadInstanceIds: new Set<string>(),
  });
});

describe("terminal panel toggle", () => {
  it("starts expanded (collapsed=false)", () => {
    const state = useTerminalGroupStore.getState();
    expect(state.collapsed).toBe(false);
  });

  it("toggles from expanded to collapsed", () => {
    const { setCollapsed } = useTerminalGroupStore.getState();
    // Simulate toggle: when open, set collapsed to true
    const currentCollapsed = useTerminalGroupStore.getState().collapsed;
    setCollapsed(!currentCollapsed);
    expect(useTerminalGroupStore.getState().collapsed).toBe(true);
  });

  it("toggles from collapsed to expanded", () => {
    const { setCollapsed } = useTerminalGroupStore.getState();
    // Start collapsed
    setCollapsed(true);
    expect(useTerminalGroupStore.getState().collapsed).toBe(true);
    // Toggle back
    const currentCollapsed = useTerminalGroupStore.getState().collapsed;
    setCollapsed(!currentCollapsed);
    expect(useTerminalGroupStore.getState().collapsed).toBe(false);
  });

  it("toggle cycles correctly through multiple toggles", () => {
    const { setCollapsed } = useTerminalGroupStore.getState();
    // open -> collapsed -> open -> collapsed
    expect(useTerminalGroupStore.getState().collapsed).toBe(false);

    setCollapsed(!useTerminalGroupStore.getState().collapsed);
    expect(useTerminalGroupStore.getState().collapsed).toBe(true);

    setCollapsed(!useTerminalGroupStore.getState().collapsed);
    expect(useTerminalGroupStore.getState().collapsed).toBe(false);

    setCollapsed(!useTerminalGroupStore.getState().collapsed);
    expect(useTerminalGroupStore.getState().collapsed).toBe(true);
  });

  it("preserves height when toggling collapsed state", () => {
    const { setCollapsed, setHeight } = useTerminalGroupStore.getState();
    setHeight(450);
    setCollapsed(true);
    setCollapsed(false);
    expect(useTerminalGroupStore.getState().height).toBe(450);
  });
});
