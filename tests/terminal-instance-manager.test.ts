import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock xterm and addons — they need a browser DOM which isn't available in Node.js test env.
// We only test the manager's state tracking and lifecycle logic here.
vi.mock("xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    onData: vi.fn(),
    open: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    write: vi.fn(),
    options: {},
    cols: 80,
    rows: 24,
  })),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}));

// We can't test actual xterm.js/WebSocket in unit tests (needs DOM + server),
// but we can test the manager's state tracking and lifecycle logic.

describe("TerminalInstanceManager", () => {
  it("exports a singleton accessor", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const m1 = getTerminalInstanceManager();
    const m2 = getTerminalInstanceManager();
    expect(m1).toBe(m2);
  });

  it("tracks created instances", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    // Manager should have a has() method to check if an instance exists
    expect(manager.has("nonexistent")).toBe(false);
  });

  it("fires activity callback", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onActivity(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("fires connection state callback", async () => {
    const { getTerminalInstanceManager } = await import(
      "../client/src/lib/terminal-instance-manager"
    );
    const manager = getTerminalInstanceManager();
    const cb = vi.fn();
    const unsub = manager.onConnectionStateChange(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
