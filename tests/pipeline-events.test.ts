import { describe, it, expect, vi } from "vitest";
import { PipelineEventBus } from "../server/pipeline/events";

describe("PipelineEventBus", () => {
  it("sends events to registered clients", () => {
    const bus = new PipelineEventBus();
    const mockSend = vi.fn();

    bus.addClient(mockSend);
    bus.emit("task-stage-changed", { taskId: "t-1", stage: "build" });

    expect(mockSend).toHaveBeenCalledOnce();
    const sent = mockSend.mock.calls[0][0];
    expect(sent).toContain("event: task-stage-changed");
    expect(sent).toContain('"taskId":"t-1"');
  });

  it("removes clients cleanly", () => {
    const bus = new PipelineEventBus();
    const mockSend = vi.fn();

    const remove = bus.addClient(mockSend);
    remove();
    bus.emit("task-stage-changed", { taskId: "t-1", stage: "build" });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handles multiple clients", () => {
    const bus = new PipelineEventBus();
    const mock1 = vi.fn();
    const mock2 = vi.fn();

    bus.addClient(mock1);
    bus.addClient(mock2);
    bus.emit("milestone-started", { milestoneRunId: "m-1" });

    expect(mock1).toHaveBeenCalledOnce();
    expect(mock2).toHaveBeenCalledOnce();
  });

  it("does not crash if a client throws", () => {
    const bus = new PipelineEventBus();
    const badClient = vi.fn(() => { throw new Error("dead connection"); });
    const goodClient = vi.fn();

    bus.addClient(badClient);
    bus.addClient(goodClient);
    bus.emit("task-progress", { taskId: "t-1", activity: "running tests" });

    expect(goodClient).toHaveBeenCalledOnce();
  });
});
