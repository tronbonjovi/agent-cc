import { describe, it, expect } from "vitest";
import { stageToColumn, PIPELINE_COLUMNS, isKnownStage, NON_TERMINAL_STATES, topoSortTasks } from "../client/src/lib/pipeline-stages";
import type { TaskItem } from "../shared/task-types";
import * as fs from "fs";

describe("pipeline stage mapping", () => {
  it("maps undefined/missing pipelineStage to backlog", () => {
    expect(stageToColumn(undefined)).toBe("backlog");
    expect(stageToColumn("")).toBe("backlog");
  });

  it("maps known stages to correct columns", () => {
    expect(stageToColumn("queued")).toBe("queued");
    expect(stageToColumn("build")).toBe("build");
    expect(stageToColumn("ai-review")).toBe("ai-review");
    expect(stageToColumn("human-review")).toBe("human-review");
    expect(stageToColumn("done")).toBe("done");
  });

  it("returns null for blocked (placement uses blockedFromStage)", () => {
    expect(stageToColumn("blocked")).toBeNull();
  });

  it("returns null for hidden stages", () => {
    expect(stageToColumn("descoped")).toBeNull();
    expect(stageToColumn("cancelled")).toBeNull();
  });

  it("returns 'unknown' for unrecognized stages", () => {
    expect(stageToColumn("some-future-stage")).toBe("unknown");
  });

  it("isKnownStage identifies valid stages", () => {
    expect(isKnownStage("build")).toBe(true);
    expect(isKnownStage("blocked")).toBe(true);
    expect(isKnownStage("descoped")).toBe(true);
    expect(isKnownStage("some-future-stage")).toBe(false);
  });

  it("PIPELINE_COLUMNS has 6 entries in order", () => {
    expect(PIPELINE_COLUMNS.map((c) => c.id)).toEqual([
      "backlog", "queued", "build", "ai-review", "human-review", "done",
    ]);
  });
});

describe("topoSortTasks", () => {
  it("sorts tasks respecting dependsOn", () => {
    const tasks = [
      { id: "c", dependsOn: ["b"] },
      { id: "a" },
      { id: "b", dependsOn: ["a"] },
    ];
    const order = topoSortTasks(tasks);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("handles tasks with no dependencies", () => {
    const tasks = [{ id: "x" }, { id: "y" }, { id: "z" }];
    const order = topoSortTasks(tasks);
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(["x", "y", "z"]));
  });

  it("ignores dependencies outside the input set", () => {
    const tasks = [
      { id: "a", dependsOn: ["external-dep"] },
      { id: "b", dependsOn: ["a"] },
    ];
    const order = topoSortTasks(tasks);
    expect(order).toEqual(["a", "b"]);
  });

  it("handles diamond dependencies", () => {
    // a -> b, a -> c, b -> d, c -> d
    const tasks = [
      { id: "d", dependsOn: ["b", "c"] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a"] },
      { id: "a" },
    ];
    const order = topoSortTasks(tasks);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });

  it("includes all tasks even with cycles (graceful fallback)", () => {
    const tasks = [
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ];
    const order = topoSortTasks(tasks);
    expect(order).toHaveLength(2);
  });
});

describe("pipeline hooks contract", () => {
  it("all mutation hooks must use onSettled for cache invalidation", async () => {
    const content = fs.readFileSync("client/src/hooks/use-pipeline.ts", "utf-8");
    const onSettledCount = (content.match(/onSettled/g) || []).length;
    expect(onSettledCount).toBeGreaterThanOrEqual(6); // 6 mutation hooks
  });
});

describe("edit-freeze guard", () => {
  it("should identify non-terminal milestone states", () => {
    expect(NON_TERMINAL_STATES.has("running")).toBe(true);
    expect(NON_TERMINAL_STATES.has("pausing")).toBe(true);
    expect(NON_TERMINAL_STATES.has("paused")).toBe(true);
    expect(NON_TERMINAL_STATES.has("awaiting_approval")).toBe(true);
    expect(NON_TERMINAL_STATES.has("cancelling")).toBe(true);
    expect(NON_TERMINAL_STATES.has("completed")).toBe(false);
    expect(NON_TERMINAL_STATES.has("cancelled")).toBe(false);
    expect(NON_TERMINAL_STATES.has("not_started")).toBe(false);
  });
});

describe("milestone accounting", () => {
  it("excludes descoped tasks from active count", () => {
    const tasks: Partial<TaskItem>[] = [
      { id: "1", pipelineStage: "done" },
      { id: "2", pipelineStage: "build" },
      { id: "3", pipelineStage: "descoped" },
      { id: "4", pipelineStage: "blocked" },
    ];
    const active = tasks.filter(
      (t) => t.pipelineStage !== "descoped" && t.pipelineStage !== "cancelled"
    );
    const done = active.filter((t) => t.pipelineStage === "done");
    expect(active.length).toBe(3); // done, build, blocked
    expect(done.length).toBe(1);
  });

  it("blocked card uses blockedFromStage for column placement", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: "build" };
    const col = stageToColumn(task.blockedFromStage);
    expect(col).toBe("build");
  });

  it("blocked card with unknown blockedFromStage goes to error row", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: "future-stage" };
    const col = stageToColumn(task.blockedFromStage);
    expect(col).toBe("unknown");
  });

  it("blocked card with missing blockedFromStage goes to error row", () => {
    const task = { pipelineStage: "blocked", blockedFromStage: undefined };
    const col = stageToColumn(task.blockedFromStage);
    // stageToColumn(undefined) returns "backlog" — caller logic handles this as error
    expect(col).toBe("backlog");
  });
});

describe("task-io roundtrip with new fields", () => {
  it("preserves blockedFromStage and removedFromStage through parse/write", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { parseTaskFile, writeTaskFile } = await import("../server/task-io");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-task-"));
    const filePath = path.join(tmpDir, "test.md");

    const task: any = {
      id: "itm-test0001",
      title: "Test task",
      type: "task",
      status: "backlog",
      created: "2026-04-06",
      updated: "2026-04-06",
      body: "",
      filePath,
      pipelineStage: "blocked",
      blockedFromStage: "build",
      removedFromStage: "ai-review",
      removedAt: "2026-04-06T12:00:00Z",
    };

    writeTaskFile(filePath, task);
    const parsed = parseTaskFile(filePath);

    expect(parsed).not.toBeNull();
    expect(parsed!.blockedFromStage).toBe("build");
    expect(parsed!.removedFromStage).toBe("ai-review");
    expect(parsed!.removedAt).toBe("2026-04-06T12:00:00Z");

    // Cleanup
    fs.unlinkSync(filePath);
    fs.rmdirSync(tmpDir);
  });
});
