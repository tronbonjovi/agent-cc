import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-io-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

const { parseTaskFile, writeTaskFile, parseConfigFile, writeConfigFile, generateTaskId, taskFilename } = await import("../server/task-io");

describe("task-io", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generateTaskId", () => {
    it("generates itm- prefixed IDs", () => {
      const id = generateTaskId();
      expect(id).toMatch(/^itm-[a-f0-9]{8}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateTaskId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("taskFilename", () => {
    it("generates slug from type and title", () => {
      expect(taskFilename("task", "Implement OAuth Login", "a1b2c3d4")).toBe("task-implement-oauth-login-a1b2.md");
    });

    it("handles special characters", () => {
      expect(taskFilename("milestone", "Phase 1: Auth & Setup!", "e5f6g7h8")).toBe("milestone-phase-1-auth-setup-e5f6.md");
    });

    it("truncates long slugs", () => {
      const longTitle = "This is a very long task title that should be truncated to a reasonable length";
      const filename = taskFilename("task", longTitle, "a1b2c3d4");
      expect(filename.length).toBeLessThan(80);
      expect(filename).toMatch(/^task-.*-a1b2\.md$/);
    });
  });

  describe("parseTaskFile", () => {
    it("parses valid task file", () => {
      const content = `---\nid: itm-a1b2c3d4\ntitle: Test Task\ntype: task\nstatus: todo\npriority: high\nlabels: [auth, backend]\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\n\nThis is the task body.\n`;
      const filePath = path.join(tmpDir, "task-test-a1b2.md");
      fs.writeFileSync(filePath, content);
      const result = parseTaskFile(filePath);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("itm-a1b2c3d4");
      expect(result!.title).toBe("Test Task");
      expect(result!.type).toBe("task");
      expect(result!.status).toBe("todo");
      expect(result!.priority).toBe("high");
      expect(result!.labels).toEqual(["auth", "backend"]);
      expect(result!.body.trim()).toBe("This is the task body.");
    });

    it("returns null for missing required fields", () => {
      const content = `---\ntitle: No ID\ntype: task\n---\n`;
      const filePath = path.join(tmpDir, "bad-task.md");
      fs.writeFileSync(filePath, content);
      const result = parseTaskFile(filePath);
      expect(result).toBeNull();
    });

    it("returns null for non-existent file", () => {
      const result = parseTaskFile(path.join(tmpDir, "nope.md"));
      expect(result).toBeNull();
    });
  });

  describe("writeTaskFile", () => {
    it("writes task with frontmatter and body", () => {
      const filePath = path.join(tmpDir, "task-write-test-abcd.md");
      writeTaskFile(filePath, {
        id: "itm-abcd1234",
        title: "Write Test",
        type: "task",
        status: "todo",
        priority: "medium",
        labels: ["test"],
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "Task body here.",
        filePath,
      });
      expect(fs.existsSync(filePath)).toBe(true);
      const parsed = parseTaskFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe("itm-abcd1234");
      expect(parsed!.title).toBe("Write Test");
      expect(parsed!.body.trim()).toBe("Task body here.");
    });

    it("uses atomic write pattern", () => {
      const filePath = path.join(tmpDir, "task-atomic-test-efgh.md");
      writeTaskFile(filePath, {
        id: "itm-efgh5678",
        title: "Atomic Test",
        type: "task",
        status: "todo",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "",
        filePath,
      });
      expect(fs.existsSync(filePath + ".tmp")).toBe(false);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("persists sessionId round-trip", () => {
      const filePath = path.join(tmpDir, "task-session-id-ijkl.md");
      writeTaskFile(filePath, {
        id: "itm-ijkl9999",
        title: "Session Test",
        type: "task",
        status: "in-progress",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "Test session ID",
        filePath,
        sessionId: "abc-123-def",
      });
      const parsed = parseTaskFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.sessionId).toBe("abc-123-def");
    });

    it("handles missing sessionId as undefined", () => {
      const filePath = path.join(tmpDir, "task-no-session-id-mnop.md");
      writeTaskFile(filePath, {
        id: "itm-mnop8888",
        title: "No Session ID",
        type: "task",
        status: "todo",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "No session ID",
        filePath,
      });
      const parsed = parseTaskFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.sessionId).toBeUndefined();
    });
  });

  describe("parseConfigFile", () => {
    it("parses valid config", () => {
      const content = `---\ntype: task-config\nstatuses: [backlog, todo, in-progress, review, done]\ntypes: [roadmap, milestone, task]\ndefault_type: task\ndefault_priority: medium\ncolumn_order:\n  backlog: [itm-a1b2c3d4]\n  todo: []\n---\n`;
      const filePath = path.join(tmpDir, "_config.md");
      fs.writeFileSync(filePath, content);
      const config = parseConfigFile(filePath);
      expect(config).not.toBeNull();
      expect(config!.statuses).toEqual(["backlog", "todo", "in-progress", "review", "done"]);
      expect(config!.columnOrder.backlog).toEqual(["itm-a1b2c3d4"]);
    });

    it("returns null for missing file", () => {
      const config = parseConfigFile(path.join(tmpDir, "missing-config.md"));
      expect(config).toBeNull();
    });
  });

  describe("writeConfigFile", () => {
    it("writes config with all fields", () => {
      const filePath = path.join(tmpDir, "_config-write.md");
      writeConfigFile(filePath, {
        statuses: ["todo", "done"],
        types: ["task"],
        defaultType: "task",
        defaultPriority: "low",
        columnOrder: { todo: ["itm-1"], done: [] },
      });
      const parsed = parseConfigFile(filePath);
      expect(parsed).not.toBeNull();
      expect(parsed!.statuses).toEqual(["todo", "done"]);
      expect(parsed!.columnOrder.todo).toEqual(["itm-1"]);
    });
  });
});
