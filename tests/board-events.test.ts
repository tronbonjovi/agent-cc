// tests/board-events.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BoardEventBus } from "../server/board/events";
import type { BoardEventType } from "../server/board/events";

describe("BoardEventBus", () => {
  let bus: BoardEventBus;

  beforeEach(() => {
    bus = new BoardEventBus();
  });

  it("registers and emits to clients", () => {
    const send = vi.fn();
    bus.addClient(send);
    bus.emit("task-moved", { taskId: "itm-1", column: "queue" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toContain("event: task-moved");
    expect(send.mock.calls[0][0]).toContain('"taskId":"itm-1"');
  });

  it("removes client on cleanup", () => {
    const send = vi.fn();
    const cleanup = bus.addClient(send);
    cleanup();
    bus.emit("task-moved", { taskId: "itm-1" });
    expect(send).not.toHaveBeenCalled();
  });

  it("emits to multiple clients", () => {
    const send1 = vi.fn();
    const send2 = vi.fn();
    bus.addClient(send1);
    bus.addClient(send2);
    bus.emit("task-flagged", { taskId: "itm-1" });
    expect(send1).toHaveBeenCalledOnce();
    expect(send2).toHaveBeenCalledOnce();
  });

  it("removes clients that throw on send", () => {
    const badSend = vi.fn(() => { throw new Error("disconnected"); });
    const goodSend = vi.fn();
    bus.addClient(badSend);
    bus.addClient(goodSend);
    bus.emit("task-moved", { taskId: "itm-1" });
    expect(bus.clientCount).toBe(1);
    expect(goodSend).toHaveBeenCalledOnce();
  });

  it("tracks client count", () => {
    expect(bus.clientCount).toBe(0);
    const cleanup = bus.addClient(vi.fn());
    expect(bus.clientCount).toBe(1);
    cleanup();
    expect(bus.clientCount).toBe(0);
  });
});
