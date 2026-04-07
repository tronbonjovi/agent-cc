// tests/board-ui.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";
import type { BoardTask, BoardFilter } from "../shared/board-types";

// Test the filter logic that will live in the hook
function applyFilters(tasks: BoardTask[], filter: BoardFilter): BoardTask[] {
  return tasks.filter(t => {
    if (filter.projects?.length && !filter.projects.includes(t.project)) return false;
    if (filter.milestones?.length && (!t.milestoneId || !filter.milestones.includes(t.milestoneId))) return false;
    if (filter.priorities?.length && !filter.priorities.includes(t.priority)) return false;
    if (filter.columns?.length && !filter.columns.includes(t.column)) return false;
    if (filter.flagged !== undefined && t.flagged !== filter.flagged) return false;
    if (filter.assignee === "human" && (!t.assignee || t.assignee === "ai")) return false;
    if (filter.assignee === "ai" && t.assignee !== "ai") return false;
    if (filter.assignee === "unassigned" && t.assignee) return false;
    return true;
  });
}

function makeTask(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "itm-1", title: "T", description: "", column: "backlog",
    project: "p1", projectName: "P", projectColor: "#000",
    priority: "medium", dependsOn: [], tags: [], flagged: false,
    createdAt: "2026-04-07", updatedAt: "2026-04-07",
    ...overrides,
  };
}

describe("board-ui filter logic", () => {
  const tasks = [
    makeTask({ id: "t1", project: "p1", column: "backlog", priority: "high" }),
    makeTask({ id: "t2", project: "p2", column: "in-progress", priority: "medium", assignee: "ai" }),
    makeTask({ id: "t3", project: "p1", column: "done", priority: "low", flagged: true }),
    makeTask({ id: "t4", project: "p2", column: "review", milestoneId: "m1" }),
  ];

  it("filters by project", () => {
    const result = applyFilters(tasks, { projects: ["p1"] });
    expect(result.map(t => t.id)).toEqual(["t1", "t3"]);
  });

  it("filters by column", () => {
    const result = applyFilters(tasks, { columns: ["backlog", "done"] });
    expect(result.map(t => t.id)).toEqual(["t1", "t3"]);
  });

  it("filters by priority", () => {
    const result = applyFilters(tasks, { priorities: ["high"] });
    expect(result.map(t => t.id)).toEqual(["t1"]);
  });

  it("filters by assignee=ai", () => {
    const result = applyFilters(tasks, { assignee: "ai" });
    expect(result.map(t => t.id)).toEqual(["t2"]);
  });

  it("filters by flagged", () => {
    const result = applyFilters(tasks, { flagged: true });
    expect(result.map(t => t.id)).toEqual(["t3"]);
  });

  it("combines multiple filters", () => {
    const result = applyFilters(tasks, { projects: ["p2"], columns: ["review"] });
    expect(result.map(t => t.id)).toEqual(["t4"]);
  });

  it("returns all tasks with empty filter", () => {
    const result = applyFilters(tasks, {});
    expect(result).toHaveLength(4);
  });
});
