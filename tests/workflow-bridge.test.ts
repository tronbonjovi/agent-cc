import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import matter from "gray-matter";

import { scanProjectTasks, mapWorkflowToTaskItem } from "../server/scanner/task-scanner";
import { statusToColumn, mapTaskToBoard } from "../server/board/aggregator";
import { updateTaskField, taskFileIndex, taskFileKey, parseTaskFile } from "../server/task-io";

const tmpDir = path.join(
  os.tmpdir(),
  "workflow-bridge-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)
);

const PROJECT_ID = "test-project";
const PROJECT_NAME = "Test Project";

function writeWorkflowTask(
  dir: string,
  milestone: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body = ""
) {
  const msDir = path.join(dir, ".claude", "roadmap", milestone);
  fs.mkdirSync(msDir, { recursive: true });
  const content = matter.stringify(body, frontmatter);
  fs.writeFileSync(path.join(msDir, filename), content);
}

function writeRegularTask(
  dir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body = ""
) {
  const tasksDir = path.join(dir, ".claude", "tasks");
  fs.mkdirSync(tasksDir, { recursive: true });
  const content = matter.stringify(body, frontmatter);
  fs.writeFileSync(path.join(tasksDir, filename), content);
}

describe("workflow-bridge integration", () => {
  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    taskFileIndex.clear();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- 1. Discovery ----
  describe("discovery", () => {
    it("scans workflow task files and maps frontmatter to TaskItem", () => {
      writeWorkflowTask(tmpDir, "test-milestone", "test-milestone-task001.md", {
        id: "test-milestone-task001",
        title: "Test Task One",
        milestone: "test-milestone",
        status: "pending",
        complexity: "standard",
        parallelSafe: true,
        phase: "testing",
        filesTouch: ["server/foo.ts"],
        dependsOn: [],
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);
      const task = result.items.find(i => i.id === "test-milestone-task001");

      expect(task).toBeDefined();
      expect(task!.id).toBe("test-milestone-task001");
      expect(task!.title).toBe("Test Task One");
      expect(task!.type).toBe("task");
      expect(task!.parent).toBe("test-milestone");
      expect(task!.labels).toContain("complexity:standard");
      expect(task!.labels).toContain("parallel-safe");
      expect(task!.labels).toContain("phase:testing");
      expect(task!.labels).toContain("touches:server/foo.ts");
    });
  });

  // ---- 2. Status mapping ----
  describe("status mapping", () => {
    it("maps workflow statuses to correct board columns", () => {
      expect(statusToColumn("pending")).toBe("backlog");
      expect(statusToColumn("in_progress")).toBe("in-progress");
      expect(statusToColumn("review")).toBe("review");
      expect(statusToColumn("completed")).toBe("done");
      expect(statusToColumn("blocked")).toBe("in-progress");
      expect(statusToColumn("cancelled")).toBe("done");
    });

    it("flags blocked workflow tasks on the board", () => {
      writeWorkflowTask(tmpDir, "flag-test", "flag-test-task001.md", {
        id: "flag-test-task001",
        title: "Blocked Task",
        milestone: "flag-test",
        status: "blocked",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);
      const task = result.items.find(i => i.id === "flag-test-task001");
      expect(task).toBeDefined();

      const milestones = result.items.filter(i => i.type === "milestone");
      const boardTask = mapTaskToBoard(task!, PROJECT_ID, PROJECT_NAME, "#3b82f6", milestones);

      expect(boardTask).toBeDefined();
      expect(boardTask!.column).toBe("in-progress");
      expect(boardTask!.flagged).toBe(true);
      expect(boardTask!.flagReason).toBe("Blocked in workflow");
    });
  });

  // ---- 3. Board move (write-back) ----
  describe("board move write-back", () => {
    it("reverse-maps board column to workflow status when updating a roadmap file", () => {
      const taskId = "writeback-task001";
      writeWorkflowTask(tmpDir, "writeback-ms", "writeback-task001.md", {
        id: taskId,
        title: "Writeback Test",
        milestone: "writeback-ms",
        status: "pending",
        created: "2026-01-01",
        updated: "2026-01-01",
      });

      // Scan to populate taskFileIndex
      scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);

      // Verify task was indexed
      const key = taskFileKey(PROJECT_ID, taskId);
      expect(taskFileIndex.has(key)).toBe(true);

      // Move task to in-progress via board column name
      updateTaskField(taskId, "status", "in-progress", PROJECT_ID);

      // Read file back and verify workflow-format status
      const filePath = taskFileIndex.get(key)!;
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);

      expect(parsed.data.status).toBe("in_progress"); // workflow format, not board format
      expect(parsed.data.updated).not.toBe("2026-01-01"); // timestamp changed
    });

    it("preserves workflow-specific frontmatter fields after write-back", () => {
      const taskId = "preserve-task001";
      writeWorkflowTask(tmpDir, "preserve-ms", "preserve-task001.md", {
        id: taskId,
        title: "Preserve Test",
        milestone: "preserve-ms",
        status: "pending",
        complexity: "standard",
        parallelSafe: true,
        phase: "testing",
        filesTouch: ["server/foo.ts"],
        created: "2026-01-01",
        updated: "2026-01-01",
      });

      scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);
      updateTaskField(taskId, "status", "in-progress", PROJECT_ID);

      const filePath = taskFileIndex.get(taskFileKey(PROJECT_ID, taskId))!;
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);

      // Workflow-specific fields must survive the round-trip
      expect(parsed.data.milestone).toBe("preserve-ms");
      expect(parsed.data.complexity).toBe("standard");
      expect(parsed.data.parallelSafe).toBe(true);
      expect(parsed.data.phase).toBe("testing");
      expect(parsed.data.filesTouch).toEqual(["server/foo.ts"]);
      // Status should be in workflow format
      expect(parsed.data.status).toBe("in_progress");
    });
  });

  // ---- 4. Milestone grouping ----
  describe("milestone grouping", () => {
    it("creates synthetic milestone with computed status from children", () => {
      const ms = "grouping-test";
      writeWorkflowTask(tmpDir, ms, "grouping-test-task001.md", {
        id: "grouping-test-task001",
        title: "Done Task",
        milestone: ms,
        status: "completed",
        created: "2026-04-08",
        updated: "2026-04-08",
      });
      writeWorkflowTask(tmpDir, ms, "grouping-test-task002.md", {
        id: "grouping-test-task002",
        title: "Active Task",
        milestone: ms,
        status: "in_progress",
        created: "2026-04-08",
        updated: "2026-04-08",
      });
      writeWorkflowTask(tmpDir, ms, "grouping-test-task003.md", {
        id: "grouping-test-task003",
        title: "Pending Task",
        milestone: ms,
        status: "pending",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);

      // Verify synthetic milestone
      const milestone = result.items.find(i => i.type === "milestone" && i.id === ms);
      expect(milestone).toBeDefined();
      expect(milestone!.title).toBe("Grouping Test"); // title-cased from dir name
      expect(milestone!.status).toBe("in-progress"); // one child is in_progress

      // Verify all 3 tasks have parent set
      const children = result.items.filter(i => i.type === "task" && i.parent === ms);
      expect(children).toHaveLength(3);
    });
  });

  // ---- 5. Session linking ----
  describe("session linking", () => {
    it("passes sessionId through from workflow frontmatter to TaskItem", () => {
      writeWorkflowTask(tmpDir, "session-test", "session-test-task001.md", {
        id: "session-test-task001",
        title: "Session Linked Task",
        milestone: "session-test",
        status: "in_progress",
        sessionId: "test-session-123",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);
      const task = result.items.find(i => i.id === "session-test-task001");

      expect(task).toBeDefined();
      expect(task!.sessionId).toBe("test-session-123");
    });

    it("returns undefined sessionId when not present in frontmatter", () => {
      writeWorkflowTask(tmpDir, "no-session", "no-session-task001.md", {
        id: "no-session-task001",
        title: "No Session Task",
        milestone: "no-session",
        status: "pending",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);
      const task = result.items.find(i => i.id === "no-session-task001");

      expect(task).toBeDefined();
      expect(task!.sessionId).toBeUndefined();
    });
  });

  // ---- 6. Coexistence ----
  describe("coexistence", () => {
    it("discovers both regular tasks and workflow tasks without collisions", () => {
      // Regular task in .claude/tasks/
      writeRegularTask(tmpDir, "regular-task.md", {
        id: "regular-001",
        title: "Regular Task",
        type: "task",
        status: "backlog",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      // Workflow task in .claude/roadmap/
      writeWorkflowTask(tmpDir, "coexist-ms", "coexist-ms-task001.md", {
        id: "coexist-ms-task001",
        title: "Workflow Task",
        milestone: "coexist-ms",
        status: "pending",
        created: "2026-04-08",
        updated: "2026-04-08",
      });

      const result = scanProjectTasks(tmpDir, PROJECT_ID, PROJECT_NAME);

      const regular = result.items.find(i => i.id === "regular-001");
      const workflow = result.items.find(i => i.id === "coexist-ms-task001");

      // Both exist
      expect(regular).toBeDefined();
      expect(workflow).toBeDefined();

      // No ID collision
      expect(regular!.id).not.toBe(workflow!.id);

      // Both are type "task"
      expect(regular!.type).toBe("task");
      expect(workflow!.type).toBe("task");

      // Workflow task has parent, regular does not
      expect(workflow!.parent).toBe("coexist-ms");
      expect(regular!.parent).toBeUndefined();
    });
  });
});
