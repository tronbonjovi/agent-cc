import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-scanner-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

const { scanProjectTasks } = await import("../server/scanner/task-scanner");

describe("task-scanner", () => {
  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty board state when no tasks directory exists", () => {
    const result = scanProjectTasks(tmpDir, "test-id", "test-project");
    expect(result.items).toEqual([]);
    expect(result.config.statuses).toEqual(["backlog", "todo", "in-progress", "blocked", "review", "done"]);
    expect(result.malformedCount).toBe(0);
  });

  it("discovers task files in .claude/tasks/", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    fs.writeFileSync(path.join(tasksDir, "_config.md"), `---\ntype: task-config\nstatuses: [todo, done]\ntypes: [task]\ndefault_type: task\ndefault_priority: medium\ncolumn_order:\n  todo: [itm-aaaaaaaa]\n  done: []\n---\n`);

    fs.writeFileSync(path.join(tasksDir, "task-test-aaaa.md"), `---\nid: itm-aaaaaaaa\ntitle: Test Task\ntype: task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\n\nBody text.\n`);

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("itm-aaaaaaaa");
    expect(result.items[0].title).toBe("Test Task");
    expect(result.config.statuses).toEqual(["todo", "done"]);
    expect(result.config.columnOrder.todo).toEqual(["itm-aaaaaaaa"]);
  });

  it("counts malformed files", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    fs.writeFileSync(path.join(tasksDir, "task-valid-aaaa.md"), `---\nid: itm-valid001\ntitle: Valid\ntype: task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\n`);

    fs.writeFileSync(path.join(tasksDir, "task-bad-bbbb.md"), `---\ntitle: Bad Task\n---\n`);

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(1);
    expect(result.malformedCount).toBe(1);
  });

  it("ignores non-md files and _config.md", () => {
    const tasksDir = path.join(tmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });

    fs.writeFileSync(path.join(tasksDir, "_config.md"), `---\ntype: task-config\nstatuses: [todo]\ntypes: [task]\ndefault_type: task\ndefault_priority: medium\ncolumn_order: {}\n---\n`);
    fs.writeFileSync(path.join(tasksDir, "notes.txt"), "not a task");

    const result = scanProjectTasks(tasksDir.replace("/.claude/tasks", ""), "test-id", "test-project");
    expect(result.items).toHaveLength(0);
    expect(result.malformedCount).toBe(0);
  });
});
