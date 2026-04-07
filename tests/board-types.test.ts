// tests/board-types.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";

describe("board-columns", () => {
  it("defines exactly 5 columns in order", () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual([
      "backlog", "ready", "in-progress", "review", "done",
    ]);
  });

  it("each column has id, label, and color", () => {
    for (const col of BOARD_COLUMNS) {
      expect(col).toHaveProperty("id");
      expect(col).toHaveProperty("label");
      expect(col).toHaveProperty("color");
    }
  });

  it("columnOrder returns numeric index", () => {
    expect(columnOrder("backlog")).toBe(0);
    expect(columnOrder("done")).toBe(4);
    expect(columnOrder("unknown")).toBe(-1);
  });

  it("isValidColumn validates column names", () => {
    expect(isValidColumn("backlog")).toBe(true);
    expect(isValidColumn("ready")).toBe(true);
    expect(isValidColumn("in-progress")).toBe(true);
    expect(isValidColumn("review")).toBe(true);
    expect(isValidColumn("done")).toBe(true);
    expect(isValidColumn("build")).toBe(false);
    expect(isValidColumn("")).toBe(false);
  });
});

describe("board-types", () => {
  it("BoardTask has required fields", () => {
    const task: import("../shared/board-types").BoardTask = {
      id: "itm-abc12345",
      title: "Test task",
      description: "A test",
      column: "backlog",
      project: "proj-1",
      projectName: "My Project",
      projectColor: "#3b82f6",
      priority: "medium",
      dependsOn: [],
      tags: [],
      flagged: false,
      createdAt: "2026-04-07",
      updatedAt: "2026-04-07",
    };
    expect(task.id).toBe("itm-abc12345");
    expect(task.flagged).toBe(false);
  });

  it("BoardColumn type matches column ids", () => {
    const col: import("../shared/board-types").BoardColumn = "backlog";
    expect(col).toBe("backlog");
  });
});
