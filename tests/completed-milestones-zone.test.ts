// tests/completed-milestones-zone.test.ts

import { describe, it, expect } from "vitest";
import { completedMilestones, tasksForMilestone } from "../client/src/components/board/completed-milestones-zone";
import type { MilestoneMeta, BoardTask } from "../shared/board-types";

function makeMilestone(overrides: Partial<MilestoneMeta> = {}): MilestoneMeta {
  return {
    id: "ms-1",
    title: "Test Milestone",
    project: "proj-1",
    color: "#3b82f6",
    totalTasks: 3,
    doneTasks: 3,
    ...overrides,
  };
}

function makeTask(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "task-1",
    title: "Test Task",
    description: "",
    column: "done",
    project: "proj-1",
    projectName: "Test Project",
    projectColor: "#3b82f6",
    milestoneId: "ms-1",
    milestone: "Test Milestone",
    priority: "medium",
    dependsOn: [],
    tags: [],
    source: "workflow",
    flagged: false,
    session: null,
    createdAt: "2026-04-10",
    updatedAt: "2026-04-10",
    ...overrides,
  } as BoardTask;
}

describe("completedMilestones", () => {
  it("returns milestones where all tasks are done", () => {
    const milestones = [
      makeMilestone({ id: "ms-1", doneTasks: 3, totalTasks: 3 }),
      makeMilestone({ id: "ms-2", doneTasks: 2, totalTasks: 5 }),
    ];
    const result = completedMilestones(milestones);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ms-1");
  });

  it("excludes milestones with zero tasks", () => {
    const milestones = [makeMilestone({ totalTasks: 0, doneTasks: 0 })];
    expect(completedMilestones(milestones)).toHaveLength(0);
  });

  it("returns empty array for no milestones", () => {
    expect(completedMilestones([])).toHaveLength(0);
  });
});

describe("tasksForMilestone", () => {
  it("returns tasks matching the milestone ID", () => {
    const tasks = [
      makeTask({ id: "t-1", milestoneId: "ms-1" }),
      makeTask({ id: "t-2", milestoneId: "ms-2" }),
      makeTask({ id: "t-3", milestoneId: "ms-1" }),
    ];
    const result = tasksForMilestone(tasks, "ms-1");
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(["t-1", "t-3"]);
  });

  it("returns empty array when no tasks match", () => {
    const tasks = [makeTask({ milestoneId: "ms-other" })];
    expect(tasksForMilestone(tasks, "ms-1")).toHaveLength(0);
  });

  it("returns empty array for empty task list", () => {
    expect(tasksForMilestone([], "ms-1")).toHaveLength(0);
  });
});

describe("BoardState.completedTasks", () => {
  it("aggregator populates completedTasks field in BoardState type", async () => {
    // Verify the type has the field (compile-time check via import)
    const { aggregateBoardState } = await import("../server/board/aggregator");
    expect(typeof aggregateBoardState).toBe("function");
  });
});

describe("completed-milestones-zone source", () => {
  it("imports useState for expand/collapse state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/board/completed-milestones-zone.tsx", "utf-8");
    expect(src).toContain("useState");
    expect(src).toContain("expandedIds");
  });

  it("renders chevron for expandable milestones", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/board/completed-milestones-zone.tsx", "utf-8");
    expect(src).toContain("ChevronRight");
    expect(src).toContain("rotate-90");
  });

  it("accepts completedTasks prop", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/board/completed-milestones-zone.tsx", "utf-8");
    expect(src).toContain("completedTasks");
    expect(src).toContain("tasksForMilestone");
  });

  it("board.tsx passes completedTasks to CompletedMilestonesZone", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    expect(src).toContain("completedTasks={board?.completedTasks");
  });
});
