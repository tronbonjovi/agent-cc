import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("terminal manager", () => {
  it("tracks active terminals by id", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();
    expect(manager.getActiveCount()).toBe(0);
  });

  it("cleans up all terminals on shutdown", async () => {
    const { TerminalManager } = await import("../server/terminal");
    const manager = new TerminalManager();
    manager.shutdown();
    expect(manager.getActiveCount()).toBe(0);
  });
});

describe("terminal panel state", () => {
  it("returns default panel state from storage", async () => {
    const { storage } = await import("../server/storage");
    const state = storage.getTerminalPanel();
    expect(state).toHaveProperty("height");
    expect(state).toHaveProperty("collapsed");
    expect(state).toHaveProperty("tabs");
    expect(state.tabs).toEqual([]);
  });

  it("updates panel state", async () => {
    const { storage } = await import("../server/storage");
    const updated = storage.updateTerminalPanel({ height: 400, collapsed: true });
    expect(updated.height).toBe(400);
    expect(updated.collapsed).toBe(true);
  });
});
