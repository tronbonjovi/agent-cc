import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-routes-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.COMMAND_CENTER_DATA = tmpDir;

// Dynamic imports so env var is picked up at module init time
const { Storage } = await import("../server/storage");
const { getDB } = await import("../server/db");
const { entityId } = await import("../server/scanner/utils");

function setupProjectEntity(storage: InstanceType<typeof Storage>, projectPath: string): string {
  const id = entityId(`project:${projectPath}`);
  storage.upsertEntity({
    id,
    type: "project",
    name: "Test Project",
    path: projectPath,
    description: null,
    lastModified: null,
    tags: [],
    health: "ok",
    data: { projectKey: "test", sessionCount: 0, sessionSize: 0, hasClaudeMd: false, hasMemory: false },
    scannedAt: new Date().toISOString(),
  });
  return id;
}

describe("task routes", () => {
  let storage: InstanceType<typeof Storage>;
  let projectPath: string;
  let projectId: string;

  beforeEach(() => {
    const db = getDB();
    for (const key of Object.keys(db.entities)) delete db.entities[key];
    db.relationships = [];
    storage = new Storage();
    projectPath = path.join(tmpDir, "test-project-" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(projectPath, { recursive: true });
    projectId = setupProjectEntity(storage, projectPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("scanProjectTasks via route logic", () => {
    it("returns empty board for project without tasks", async () => {
      const { scanProjectTasks } = await import("../server/scanner/task-scanner");
      const board = scanProjectTasks(projectPath, projectId, "Test Project");
      expect(board.items).toEqual([]);
      expect(board.config.statuses).toHaveLength(8);
    });

    it("returns tasks when they exist", async () => {
      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(
        path.join(tasksDir, "_config.md"),
        `---\ntype: task-config\nstatuses: [todo, done]\ntypes: [task]\ndefault_type: task\ndefault_priority: medium\ncolumn_order:\n  todo: [itm-route001]\n  done: []\n---\n`
      );
      fs.writeFileSync(
        path.join(tasksDir, "task-test-rout.md"),
        `---\nid: itm-route001\ntitle: Route Test Task\ntype: task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\n\nTest body.\n`
      );
      const { scanProjectTasks } = await import("../server/scanner/task-scanner");
      const board = scanProjectTasks(projectPath, projectId, "Test Project");
      expect(board.items).toHaveLength(1);
      expect(board.items[0].title).toBe("Route Test Task");
    });
  });

  describe("task-io round-trip", () => {
    it("writes and reads back a task file", async () => {
      const { writeTaskFile, parseTaskFile, generateTaskId, taskFilename } = await import("../server/task-io");
      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });

      const id = generateTaskId();
      const now = "2026-04-04";
      const task = {
        id,
        title: "My Round Trip Task",
        type: "task",
        status: "todo",
        priority: "medium",
        created: now,
        updated: now,
        body: "Some body text.",
        filePath: "",
      };
      const filename = taskFilename(task.type, task.title, id);
      task.filePath = path.join(tasksDir, filename).replace(/\\/g, "/");

      writeTaskFile(task.filePath, task);
      const read = parseTaskFile(task.filePath);

      expect(read).not.toBeNull();
      expect(read!.id).toBe(id);
      expect(read!.title).toBe("My Round Trip Task");
      expect(read!.status).toBe("todo");
      expect(read!.body.trim()).toBe("Some body text.");
    });
  });

  describe("config read/write", () => {
    it("returns DEFAULT_TASK_CONFIG when no config file exists", async () => {
      const { parseConfigFile } = await import("../server/task-io");
      const { DEFAULT_TASK_CONFIG } = await import("../server/task-io").then(() => import("@shared/task-types"));
      const result = parseConfigFile(path.join(projectPath, ".claude", "tasks", "_config.md"));
      expect(result).toBeNull();
      expect(DEFAULT_TASK_CONFIG.statuses).toHaveLength(8);
    });

    it("writes and reads back a config file", async () => {
      const { writeConfigFile, parseConfigFile } = await import("../server/task-io");
      const { DEFAULT_TASK_CONFIG } = await import("@shared/task-types");
      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      const configPath = path.join(tasksDir, "_config.md");

      const config = { ...DEFAULT_TASK_CONFIG, columnOrder: { todo: ["itm-abc1"], done: [] } };
      writeConfigFile(configPath, config);
      const read = parseConfigFile(configPath);

      expect(read).not.toBeNull();
      expect(read!.statuses).toEqual(DEFAULT_TASK_CONFIG.statuses);
      expect(read!.columnOrder["todo"]).toEqual(["itm-abc1"]);
    });
  });

  describe("getProjectPath helper logic", () => {
    it("returns null for unknown projectId", () => {
      const entity = storage.getEntity("nonexistent-id");
      expect(entity).toBeNull();
    });

    it("returns entity with correct path for registered project", () => {
      const entity = storage.getEntity(projectId);
      expect(entity).not.toBeNull();
      expect(entity!.type).toBe("project");
      expect(entity!.path).toBe(projectPath);
    });
  });

  describe("task CRUD flow", () => {
    it("creates, reads, updates, and deletes a task via I/O functions", async () => {
      const { writeConfigFile, generateTaskId, writeTaskFile, parseTaskFile, taskFilename } = await import("../server/task-io");
      const { DEFAULT_TASK_CONFIG } = await import("@shared/task-types");

      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      writeConfigFile(path.join(tasksDir, "_config.md"), { ...DEFAULT_TASK_CONFIG });

      const id = generateTaskId();
      expect(id).toMatch(/^itm-[a-f0-9]{8}$/);

      const filename = taskFilename("task", "Integration Test", id);
      const filePath = path.join(tasksDir, filename);

      writeTaskFile(filePath, {
        id,
        title: "Integration Test",
        type: "task",
        status: "todo",
        priority: "high",
        labels: ["test"],
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "Test body content.",
        filePath,
      });

      const task = parseTaskFile(filePath);
      expect(task).not.toBeNull();
      expect(task!.id).toBe(id);
      expect(task!.title).toBe("Integration Test");
      expect(task!.priority).toBe("high");
      expect(task!.body.trim()).toBe("Test body content.");

      task!.status = "done";
      task!.updated = "2026-04-06";
      writeTaskFile(filePath, task!);

      const updated = parseTaskFile(filePath);
      expect(updated!.status).toBe("done");
      expect(updated!.updated).toBe("2026-04-06");

      fs.unlinkSync(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("scans project with hierarchy", async () => {
      const { writeConfigFile, writeTaskFile, generateTaskId, taskFilename } = await import("../server/task-io");
      const { scanProjectTasks } = await import("../server/scanner/task-scanner");
      const { DEFAULT_TASK_CONFIG } = await import("@shared/task-types");

      const tasksDir = path.join(projectPath, ".claude", "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });

      const config = { ...DEFAULT_TASK_CONFIG };
      const milestoneId = generateTaskId();
      const taskId = generateTaskId();
      config.columnOrder = { todo: [milestoneId, taskId] };
      writeConfigFile(path.join(tasksDir, "_config.md"), config);

      writeTaskFile(path.join(tasksDir, taskFilename("milestone", "MVP", milestoneId)), {
        id: milestoneId,
        title: "MVP",
        type: "milestone",
        status: "todo",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "",
        filePath: path.join(tasksDir, taskFilename("milestone", "MVP", milestoneId)),
      });

      writeTaskFile(path.join(tasksDir, taskFilename("task", "Build auth", taskId)), {
        id: taskId,
        title: "Build auth",
        type: "task",
        status: "todo",
        parent: milestoneId,
        priority: "high",
        created: "2026-04-05",
        updated: "2026-04-05",
        body: "",
        filePath: path.join(tasksDir, taskFilename("task", "Build auth", taskId)),
      });

      const board = scanProjectTasks(projectPath, projectId, "Test Project");
      expect(board.items).toHaveLength(2);

      const milestone = board.items.find((i) => i.type === "milestone");
      const task = board.items.find((i) => i.type === "task");
      expect(milestone).toBeDefined();
      expect(task).toBeDefined();
      expect(task!.parent).toBe(milestoneId);
      expect(board.config.columnOrder.todo).toContain(milestoneId);
      expect(board.config.columnOrder.todo).toContain(taskId);
    });
  });
});
