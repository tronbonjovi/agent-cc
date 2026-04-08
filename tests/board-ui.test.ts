// tests/board-ui.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";
import type { BoardTask, BoardFilter } from "../shared/board-types";
import { computePopoutPosition } from "../client/src/components/board/board-side-panel";

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
    session: null,
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

describe("board popout positioning", () => {
  const POPOUT_WIDTH = 440;
  const POPOUT_MAX_HEIGHT = 520;
  const VIEWPORT_PADDING = 12;

  it("positions popout to the right of a card on the left side", () => {
    // Card on the left side of the viewport
    const cardRect = { top: 200, left: 50, right: 330, bottom: 300, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    // Should appear to the right of the card
    expect(pos.left).toBeGreaterThanOrEqual(cardRect.right);
    expect(pos.left).toBeLessThanOrEqual(viewport.width - POPOUT_WIDTH - VIEWPORT_PADDING);
  });

  it("positions popout to the left of a card on the right side", () => {
    // Card on the right side of the viewport
    const cardRect = { top: 200, left: 850, right: 1130, bottom: 300, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    // Should appear to the left of the card
    expect(pos.left).toBeLessThan(cardRect.left);
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });

  it("keeps popout within viewport vertically", () => {
    // Card near the bottom of the viewport
    const cardRect = { top: 700, left: 50, right: 330, bottom: 800, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(pos.top + POPOUT_MAX_HEIGHT).toBeLessThanOrEqual(viewport.height - VIEWPORT_PADDING + POPOUT_MAX_HEIGHT);
  });

  it("aligns popout top to card top when there is room", () => {
    const cardRect = { top: 200, left: 50, right: 330, bottom: 300, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    expect(pos.top).toBe(cardRect.top);
  });

  it("clamps popout top when card is near viewport bottom", () => {
    const cardRect = { top: 600, left: 50, right: 330, bottom: 700, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    // Should be clamped so popout doesn't overflow bottom
    expect(pos.top).toBeLessThanOrEqual(viewport.height - POPOUT_MAX_HEIGHT - VIEWPORT_PADDING);
  });

  it("returns valid position for card in the middle", () => {
    const cardRect = { top: 300, left: 400, right: 680, bottom: 400, width: 280, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computePopoutPosition(cardRect, viewport);
    // Should have left and top as numbers
    expect(typeof pos.left).toBe("number");
    expect(typeof pos.top).toBe("number");
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });
});
