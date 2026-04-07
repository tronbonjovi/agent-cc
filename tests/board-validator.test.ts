// tests/board-validator.test.ts
import { describe, it, expect } from "vitest";
import { validateMove, checkAutoUnflag } from "../server/board/validator";
import type { BoardTask } from "../shared/board-types";

function makeTask(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "itm-1", title: "T", description: "", column: "backlog",
    project: "p1", projectName: "P", projectColor: "#000",
    priority: "medium", dependsOn: [], tags: [], flagged: false,
    createdAt: "2026-04-07", updatedAt: "2026-04-07",
    ...overrides,
  };
}

describe("validateMove", () => {
  it("allows move with no dependencies", () => {
    const task = makeTask({ id: "itm-1" });
    const allTasks = [task];
    const result = validateMove(task, "in-progress", allTasks);
    expect(result.allowed).toBe(true);
    expect(result.flag).toBeUndefined();
  });

  it("allows move when all dependencies are done", () => {
    const dep = makeTask({ id: "itm-dep", column: "done" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep]);
    expect(result.allowed).toBe(true);
  });

  it("flags task when dependency is not done", () => {
    const dep = makeTask({ id: "itm-dep", column: "ready" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep]);
    expect(result.allowed).toBe(true); // move is allowed, just flagged
    expect(result.flag).toBeDefined();
    expect(result.flag!.flagged).toBe(true);
    expect(result.flag!.reason).toContain("itm-dep");
  });

  it("flags when multiple dependencies are unfinished", () => {
    const dep1 = makeTask({ id: "itm-d1", title: "Dep 1", column: "backlog" });
    const dep2 = makeTask({ id: "itm-d2", title: "Dep 2", column: "in-progress" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-d1", "itm-d2"] });
    const result = validateMove(task, "in-progress", [task, dep1, dep2]);
    expect(result.flag!.reason).toContain("Dep 1");
    expect(result.flag!.reason).toContain("Dep 2");
  });

  it("does not flag when moving to backlog or ready", () => {
    const dep = makeTask({ id: "itm-dep", column: "backlog" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "ready", [task, dep]);
    expect(result.flag).toBeUndefined();
  });

  it("skips validation when force=true", () => {
    const dep = makeTask({ id: "itm-dep", column: "backlog" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"] });
    const result = validateMove(task, "in-progress", [task, dep], true);
    expect(result.allowed).toBe(true);
    expect(result.flag).toBeUndefined();
  });

  it("ignores missing dependencies gracefully", () => {
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-ghost"] });
    const result = validateMove(task, "in-progress", [task]);
    expect(result.flag).toBeDefined();
    expect(result.flag!.reason).toContain("itm-ghost");
  });
});

describe("checkAutoUnflag", () => {
  it("returns unflag=true when all deps are now done", () => {
    const dep = makeTask({ id: "itm-dep", column: "done" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"], flagged: true, flagReason: "..." });
    const result = checkAutoUnflag(task, [task, dep]);
    expect(result).toBe(true);
  });

  it("returns unflag=false when deps still not done", () => {
    const dep = makeTask({ id: "itm-dep", column: "review" });
    const task = makeTask({ id: "itm-1", dependsOn: ["itm-dep"], flagged: true });
    const result = checkAutoUnflag(task, [task, dep]);
    expect(result).toBe(false);
  });

  it("returns false for tasks that aren't flagged", () => {
    const task = makeTask({ id: "itm-1", dependsOn: [], flagged: false });
    const result = checkAutoUnflag(task, [task]);
    expect(result).toBe(false);
  });
});
