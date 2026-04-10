// tests/board-types.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnOrder, isValidColumn } from "../client/src/lib/board-columns";

describe("board-columns", () => {
  it("defines exactly 4 columns in order", () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual([
      "queue", "in-progress", "review", "done",
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
    expect(columnOrder("queue")).toBe(0);
    expect(columnOrder("done")).toBe(3);
    expect(columnOrder("unknown")).toBe(-1);
  });

  it("isValidColumn validates column names", () => {
    expect(isValidColumn("queue")).toBe(true);
    expect(isValidColumn("in-progress")).toBe(true);
    expect(isValidColumn("review")).toBe(true);
    expect(isValidColumn("done")).toBe(true);
    expect(isValidColumn("backlog")).toBe(false);
    expect(isValidColumn("ready")).toBe(false);
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
      column: "queue",
      project: "proj-1",
      projectName: "My Project",
      projectColor: "#3b82f6",
      priority: "medium",
      dependsOn: [],
      tags: [],
      flagged: false,
      session: null,
      createdAt: "2026-04-07",
      updatedAt: "2026-04-07",
    };
    expect(task.id).toBe("itm-abc12345");
    expect(task.flagged).toBe(false);
  });

  it("BoardColumn type matches column ids", () => {
    const col: import("../shared/board-types").BoardColumn = "queue";
    expect(col).toBe("queue");
  });

  it("SessionEnrichment can be created with complete data", () => {
    const session: import("../shared/board-types").SessionEnrichment = {
      sessionId: "sess-abc123",
      isActive: true,
      model: "claude-3-5-sonnet",
      lastActivity: "Running analysis",
      lastActivityTs: "2026-04-08T10:30:00Z",
      messageCount: 42,
      costUsd: 0.15,
      inputTokens: 2048,
      outputTokens: 512,
      healthScore: "good",
      toolErrors: 0,
      durationMinutes: 15,
    };
    expect(session.sessionId).toBe("sess-abc123");
    expect(session.isActive).toBe(true);
    expect(session.healthScore).toBe("good");
  });

  it("BoardTask can include SessionEnrichment data", () => {
    const enrichedTask: import("../shared/board-types").BoardTask = {
      id: "itm-task-001",
      title: "Data Processing",
      description: "Process user data",
      column: "in-progress",
      project: "proj-2",
      projectName: "Analytics",
      projectColor: "#10b981",
      priority: "high",
      dependsOn: [],
      tags: ["urgent"],
      flagged: false,
      session: {
        sessionId: "sess-data-proc",
        isActive: true,
        model: "claude-3-5-sonnet",
        lastActivity: "Processing batch",
        lastActivityTs: "2026-04-08T11:00:00Z",
        messageCount: 18,
        costUsd: 0.08,
        inputTokens: 1024,
        outputTokens: 256,
        healthScore: "fair",
        toolErrors: 1,
        durationMinutes: 5,
      },
      createdAt: "2026-04-08",
      updatedAt: "2026-04-08",
    };
    expect(enrichedTask.session).not.toBeNull();
    expect(enrichedTask.session?.healthScore).toBe("fair");
    expect(enrichedTask.session?.costUsd).toBe(0.08);
  });
});
