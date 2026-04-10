import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-io-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

const { parseTaskFile, writeTaskFile, parseConfigFile, writeConfigFile, generateTaskId, taskFilename, updateTaskField, taskFileIndex, taskFileKey } = await import("../server/task-io");

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

  describe("updateTaskField — workflow reverse mapping", () => {
    it("converts board column to workflow status for roadmap files", () => {
      const filePath = path.join(tmpDir, "task-wf-reverse-aaaa.md");
      // Simulate a workflow file path (contains /roadmap/)
      const workflowPath = path.join(tmpDir, "roadmap", "milestone-1", "task-wf-reverse-aaaa.md");
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      writeTaskFile(workflowPath, {
        id: "itm-aaaa1111", title: "Workflow Reverse", type: "task",
        status: "pending", created: "2026-04-08", updated: "2026-04-07",
        body: "Test body.", filePath: workflowPath,
      });
      const key = taskFileKey("proj-wf", "itm-aaaa1111");
      taskFileIndex.set(key, workflowPath);

      updateTaskField("itm-aaaa1111", "status", "in-progress", "proj-wf");

      const parsed = parseTaskFile(workflowPath);
      expect(parsed!.status).toBe("in_progress");
    });

    it("maps 'queue' to 'pending' for workflow files", () => {
      const workflowPath = path.join(tmpDir, "roadmap", "m1", "task-queue-bbbb.md");
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      writeTaskFile(workflowPath, {
        id: "itm-bbbb2222", title: "Queue Test", type: "task",
        status: "in_progress", created: "2026-04-08", updated: "2026-04-07",
        body: "", filePath: workflowPath,
      });
      taskFileIndex.set(taskFileKey("proj-wf2", "itm-bbbb2222"), workflowPath);

      updateTaskField("itm-bbbb2222", "status", "queue", "proj-wf2");
      expect(parseTaskFile(workflowPath)!.status).toBe("pending");
    });

    it("maps 'review' to 'review' for workflow files", () => {
      const workflowPath = path.join(tmpDir, "roadmap", "m1", "task-review-dddd.md");
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      writeTaskFile(workflowPath, {
        id: "itm-dddd4444", title: "Review Test", type: "task",
        status: "pending", created: "2026-04-08", updated: "2026-04-07",
        body: "", filePath: workflowPath,
      });
      taskFileIndex.set(taskFileKey("proj-wf4", "itm-dddd4444"), workflowPath);

      updateTaskField("itm-dddd4444", "status", "review", "proj-wf4");
      expect(parseTaskFile(workflowPath)!.status).toBe("review");
    });

    it("maps 'done' to 'completed' for workflow files", () => {
      const workflowPath = path.join(tmpDir, "roadmap", "m1", "task-done-eeee.md");
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      writeTaskFile(workflowPath, {
        id: "itm-eeee5555", title: "Done Test", type: "task",
        status: "in_progress", created: "2026-04-08", updated: "2026-04-07",
        body: "", filePath: workflowPath,
      });
      taskFileIndex.set(taskFileKey("proj-wf5", "itm-eeee5555"), workflowPath);

      updateTaskField("itm-eeee5555", "status", "done", "proj-wf5");
      expect(parseTaskFile(workflowPath)!.status).toBe("completed");
    });

    it("refreshes updated timestamp on status write", () => {
      const workflowPath = path.join(tmpDir, "roadmap", "m1", "task-ts-ffff.md");
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      writeTaskFile(workflowPath, {
        id: "itm-ffff6666", title: "Timestamp Test", type: "task",
        status: "pending", created: "2026-04-01", updated: "2026-04-01",
        body: "", filePath: workflowPath,
      });
      taskFileIndex.set(taskFileKey("proj-wf6", "itm-ffff6666"), workflowPath);

      updateTaskField("itm-ffff6666", "status", "in-progress", "proj-wf6");
      const parsed = parseTaskFile(workflowPath);
      const today = new Date().toISOString().split("T")[0];
      expect(parsed!.updated).toBe(today);
    });

    it("does NOT apply reverse mapping for regular task files", () => {
      const regularPath = path.join(tmpDir, "tasks", "task-regular-gggg.md");
      fs.mkdirSync(path.dirname(regularPath), { recursive: true });
      writeTaskFile(regularPath, {
        id: "itm-gggg7777", title: "Regular Task", type: "task",
        status: "backlog", created: "2026-04-08", updated: "2026-04-07",
        body: "", filePath: regularPath,
      });
      taskFileIndex.set(taskFileKey("proj-reg", "itm-gggg7777"), regularPath);

      updateTaskField("itm-gggg7777", "status", "in-progress", "proj-reg");
      const parsed = parseTaskFile(regularPath);
      // Regular tasks keep the board column name as-is
      expect(parsed!.status).toBe("in-progress");
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
