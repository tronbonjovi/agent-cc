import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "task-scanner-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

const { scanProjectTasks, mapWorkflowToTaskItem } = await import("../server/scanner/task-scanner");
import { taskFileIndex, taskFileKey } from "../server/task-io";

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
    expect(result.config.statuses).toEqual(["queue", "todo", "in-progress", "blocked", "review", "done"]);
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

describe("mapWorkflowToTaskItem", () => {
  it("correctly maps all fields from claude-workflow frontmatter", () => {
    const frontmatter = {
      id: "workflow-bridge-task001",
      title: "Workflow task discovery",
      status: "in-progress",
      milestone: "workflow-bridge",
      dependsOn: ["setup-task001", "setup-task002"],
      created: "2026-04-05",
      updated: "2026-04-06",
      complexity: "standard",
      parallelSafe: true,
      phase: "foundation",
      filesTouch: ["server/scanner/task-scanner.ts", "tests/task-scanner.test.ts"],
    };
    const body = "\n## Description\n\nSome task body.\n";
    const filePath = "/tmp/project/.claude/roadmap/workflow-bridge/workflow-bridge-task001.md";

    const result = mapWorkflowToTaskItem(frontmatter, body, filePath);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("workflow-bridge-task001");
    expect(result!.title).toBe("Workflow task discovery");
    expect(result!.type).toBe("task");
    expect(result!.status).toBe("in-progress");
    expect(result!.parent).toBe("workflow-bridge");
    expect(result!.dependsOn).toEqual(["setup-task001", "setup-task002"]);
    expect(result!.created).toBe("2026-04-05");
    expect(result!.updated).toBe("2026-04-06");
    expect(result!.body).toBe(body);
    expect(result!.filePath).toBe(filePath);
    expect(result!.labels).toContain("complexity:standard");
    expect(result!.labels).toContain("parallel-safe");
    expect(result!.labels).toContain("phase:foundation");
    expect(result!.labels).toContain("touches:server/scanner/task-scanner.ts");
    expect(result!.labels).toContain("touches:tests/task-scanner.test.ts");
  });

  it("handles minimal frontmatter (only required fields)", () => {
    const frontmatter = {
      id: "simple-task",
      title: "Simple task",
      status: "todo",
      created: "2026-04-05",
      updated: "2026-04-05",
    };
    const result = mapWorkflowToTaskItem(frontmatter, "", "/tmp/p/.claude/roadmap/m1/simple-task.md");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("simple-task");
    expect(result!.type).toBe("task");
    expect(result!.labels).toBeUndefined();
    expect(result!.parent).toBeUndefined();
    expect(result!.dependsOn).toBeUndefined();
  });

  it("returns null when required fields are missing", () => {
    expect(mapWorkflowToTaskItem({ title: "No ID" }, "", "/tmp/x.md")).toBeNull();
    expect(mapWorkflowToTaskItem({ id: "no-title" }, "", "/tmp/x.md")).toBeNull();
    expect(mapWorkflowToTaskItem({}, "", "/tmp/x.md")).toBeNull();
  });
});

describe("workflow task scanning", () => {
  const wfTmpDir = path.join(os.tmpdir(), "task-scanner-wf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

  function writeWorkflowTask(milestone: string, filename: string, frontmatter: string, body: string = "") {
    const dir = path.join(wfTmpDir, ".claude", "roadmap", milestone);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), `---\n${frontmatter}\n---\n${body}`);
  }

  beforeEach(() => {
    fs.rmSync(wfTmpDir, { recursive: true, force: true });
    fs.mkdirSync(wfTmpDir, { recursive: true });
    taskFileIndex.clear();
  });

  afterAll(() => {
    fs.rmSync(wfTmpDir, { recursive: true, force: true });
  });

  it("discovers task files in .claude/roadmap/<milestone>/ directories", () => {
    writeWorkflowTask("milestone-one", "task001.md",
      'id: m1-task001\ntitle: First Task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');
    writeWorkflowTask("milestone-two", "task002.md",
      'id: m2-task002\ntitle: Second Task\nstatus: done\ncreated: "2026-04-05"\nupdated: "2026-04-06"');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    const tasks = result.items.filter(i => i.type === "task");
    expect(tasks).toHaveLength(2);

    const ids = tasks.map(i => i.id).sort();
    expect(ids).toEqual(["m1-task001", "m2-task002"]);

    // Synthetic milestones also created
    const milestones = result.items.filter(i => i.type === "milestone");
    expect(milestones).toHaveLength(2);
  });

  it("skips ROADMAP.md, MILESTONE.md, TASK.md, ARCHIVE.md", () => {
    writeWorkflowTask("m1", "real-task.md",
      'id: real-task\ntitle: Real Task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');
    writeWorkflowTask("m1", "ROADMAP.md", 'id: roadmap\ntitle: Roadmap\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');
    writeWorkflowTask("m1", "MILESTONE.md", 'id: milestone\ntitle: Milestone\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');
    writeWorkflowTask("m1", "TASK.md", 'id: task-tmpl\ntitle: Task Template\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');
    writeWorkflowTask("m1", "ARCHIVE.md", 'id: archive\ntitle: Archive\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    const tasks = result.items.filter(i => i.type === "task");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("real-task");
  });

  it("skips files in drafts/ subdirectory", () => {
    writeWorkflowTask("m1", "real-task.md",
      'id: real-task\ntitle: Real Task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');

    // Create a drafts/ subdirectory inside a milestone
    const draftsDir = path.join(wfTmpDir, ".claude", "roadmap", "m1", "drafts");
    fs.mkdirSync(draftsDir, { recursive: true });
    fs.writeFileSync(path.join(draftsDir, "draft-task.md"),
      '---\nid: draft-task\ntitle: Draft\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\n');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    const tasks = result.items.filter(i => i.type === "task");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("real-task");
  });

  it("preserves semantic IDs (no itm-hex generation)", () => {
    writeWorkflowTask("m1", "workflow-bridge-task001.md",
      'id: workflow-bridge-task001\ntitle: Bridge Task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    expect(result.items[0].id).toBe("workflow-bridge-task001");
    expect(result.items[0].id).not.toMatch(/^itm-/);
  });

  it("registers workflow tasks in taskFileIndex with correct path", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-task001\ntitle: Indexed Task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"');

    scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");

    const scopedKey = taskFileKey("wf-proj", "m1-task001");
    expect(taskFileIndex.has(scopedKey)).toBe(true);
    expect(taskFileIndex.get(scopedKey)).toContain("/roadmap/m1/task001.md");

    // Also has legacy unscoped key
    expect(taskFileIndex.has("m1-task001")).toBe(true);
  });

  it("works when .claude/roadmap/ does not exist (no error)", () => {
    // wfTmpDir has no .claude/roadmap/ — just the bare directory
    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    expect(result.items).toEqual([]);
    expect(result.malformedCount).toBe(0);
  });

  it("existing .claude/tasks/*.md scanning is unchanged when roadmap also exists", () => {
    // Create both tasks/ and roadmap/
    const tasksDir = path.join(wfTmpDir, ".claude", "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, "task-old-aaaa.md"),
      '---\nid: itm-aaaaaaaa\ntitle: Old Task\ntype: task\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\n---\nOld body.\n');

    writeWorkflowTask("m1", "new-task.md",
      'id: m1-new-task\ntitle: New Workflow Task\nstatus: in-progress\ncreated: "2026-04-06"\nupdated: "2026-04-06"');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    const tasks = result.items.filter(i => i.type === "task");
    expect(tasks).toHaveLength(2);

    const oldTask = result.items.find(i => i.id === "itm-aaaaaaaa");
    const newTask = result.items.find(i => i.id === "m1-new-task");

    expect(oldTask).toBeDefined();
    expect(oldTask!.title).toBe("Old Task");
    expect(oldTask!.body).toContain("Old body.");

    expect(newTask).toBeDefined();
    expect(newTask!.title).toBe("New Workflow Task");
    expect(newTask!.type).toBe("task");
  });

  it("maps complexity, parallelSafe, phase, filesTouch to labels", () => {
    writeWorkflowTask("m1", "labeled-task.md",
      'id: labeled-task\ntitle: Labeled\nstatus: todo\ncreated: "2026-04-05"\nupdated: "2026-04-05"\ncomplexity: complex\nparallelSafe: true\nphase: integration\nfilesTouch:\n  - server/foo.ts\n  - client/bar.tsx');

    const result = scanProjectTasks(wfTmpDir, "wf-proj", "Workflow Project");
    const task = result.items[0];
    expect(task.labels).toContain("complexity:complex");
    expect(task.labels).toContain("parallel-safe");
    expect(task.labels).toContain("phase:integration");
    expect(task.labels).toContain("touches:server/foo.ts");
    expect(task.labels).toContain("touches:client/bar.tsx");
  });
});

describe("synthetic milestone creation", () => {
  const msTmpDir = path.join(os.tmpdir(), "task-scanner-ms-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

  function writeWorkflowTask(milestone: string, filename: string, frontmatter: string, body: string = "") {
    const dir = path.join(msTmpDir, ".claude", "roadmap", milestone);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), `---\n${frontmatter}\n---\n${body}`);
  }

  function writeRoadmapMd(content: string) {
    const roadmapDir = path.join(msTmpDir, ".claude", "roadmap");
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, "ROADMAP.md"), content);
  }

  function writeMilestoneMd(content: string) {
    const roadmapDir = path.join(msTmpDir, ".claude", "roadmap");
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, "MILESTONE.md"), content);
  }

  beforeEach(() => {
    fs.rmSync(msTmpDir, { recursive: true, force: true });
    fs.mkdirSync(msTmpDir, { recursive: true });
    taskFileIndex.clear();
  });

  afterAll(() => {
    fs.rmSync(msTmpDir, { recursive: true, force: true });
  });

  it("creates a synthetic milestone for each milestone directory", () => {
    writeWorkflowTask("pipeline-removal", "task001.md",
      'id: pr-task001\ntitle: Remove pipeline\nstatus: done\nmilestone: pipeline-removal\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-task001\ntitle: Bridge tasks\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-03"\nupdated: "2026-04-04"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const milestones = result.items.filter(i => i.type === "milestone");
    expect(milestones).toHaveLength(2);

    const msIds = milestones.map(m => m.id).sort();
    expect(msIds).toEqual(["pipeline-removal", "workflow-bridge"]);
  });

  it("milestone id matches directory name, title is title-cased", () => {
    writeWorkflowTask("pipeline-removal", "task001.md",
      'id: pr-task001\ntitle: Remove pipeline\nstatus: done\nmilestone: pipeline-removal\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms).toBeDefined();
    expect(ms!.id).toBe("pipeline-removal");
    expect(ms!.title).toBe("Pipeline Removal");
  });

  it("workflow tasks have parent set to their milestone directory name", () => {
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-task001\ntitle: Bridge tasks\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-03"\nupdated: "2026-04-04"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const task = result.items.find(i => i.type === "task");
    expect(task).toBeDefined();
    expect(task!.parent).toBe("workflow-bridge");
  });

  it("milestone status computed: all done -> done", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: done\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: completed\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("done");
  });

  it("milestone status computed: any in-progress -> in-progress", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: in-progress\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("in-progress");
  });

  it("milestone status computed: any in_progress -> in-progress", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: in_progress\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: backlog\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("in-progress");
  });

  it("milestone status computed: else backlog", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: backlog\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("queue");
  });

  it("empty milestone directory creates milestone with status backlog", () => {
    const emptyMs = path.join(msTmpDir, ".claude", "roadmap", "empty-milestone");
    fs.mkdirSync(emptyMs, { recursive: true });

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms).toBeDefined();
    expect(ms!.id).toBe("empty-milestone");
    expect(ms!.title).toBe("Empty Milestone");
    expect(ms!.status).toBe("queue");
  });

  it("milestone created/updated derived from child task dates", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-05"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: done\nmilestone: m1\ncreated: "2026-03-28"\nupdated: "2026-04-07"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.created).toBe("2026-03-28"); // earliest
    expect(ms!.updated).toBe("2026-04-07"); // latest
  });

  it("milestone filePath points to milestone directory", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.filePath).toContain("/roadmap/m1");
    expect(ms!.filePath).not.toContain(".md");
  });

  it("milestone registered in taskFileIndex", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const scopedKey = taskFileKey("ms-proj", "m1");
    expect(taskFileIndex.has(scopedKey)).toBe(true);
    expect(taskFileIndex.has("m1")).toBe(true);
  });

  it("ROADMAP.md description populates milestone body", () => {
    writeWorkflowTask("pipeline-removal", "task001.md",
      'id: pr-t1\ntitle: T1\nstatus: done\nmilestone: pipeline-removal\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeRoadmapMd(`---
title: Project Roadmap
---

| Milestone | Status | Progress | Description |
|-----------|--------|----------|-------------|
| pipeline-removal | completed | 1/1 | Clean removal of the abandoned task automation pipeline |
`);

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.body).toBe("Clean removal of the abandoned task automation pipeline");
  });

  it("ROADMAP.md status column is ignored for milestone status (v0.5.0+)", () => {
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-t1\ntitle: T1\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeRoadmapMd(`---
title: Project Roadmap
---

| Milestone | Status | Progress | Description |
|-----------|--------|----------|-------------|
| workflow-bridge | in_progress | 0/4 | Bridge workflow tasks to the kanban board |
`);

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    // ROADMAP.md status is stale (workflow-framework v0.5.0+ doesn't update it on task changes).
    // Milestone status should be computed from children: only todo tasks → backlog.
    expect(ms!.status).toBe("queue");
  });

  it("status_override from MILESTONE.md takes precedence over computed status", () => {
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-t1\ntitle: T1\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeMilestoneMd(`## workflow-bridge
- **Status:** in_progress
- **status_override:** done
`);

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("done");
  });

  it("MILESTONE.md with null status_override does not override", () => {
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-t1\ntitle: T1\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeMilestoneMd(`## workflow-bridge
- **Status:** in_progress
- **status_override:** null
`);

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    // null means no override, so computed status should be used (backlog since only todo)
    expect(ms!.status).toBe("queue");
  });

  it("MILESTONE.md override takes precedence over ROADMAP.md override", () => {
    writeWorkflowTask("workflow-bridge", "task001.md",
      'id: wb-t1\ntitle: T1\nstatus: todo\nmilestone: workflow-bridge\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeRoadmapMd(`---
title: Project Roadmap
---

| Milestone | Status | Progress | Description |
|-----------|--------|----------|-------------|
| workflow-bridge | in_progress | 0/4 | Bridge workflow tasks to the kanban board |
`);
    writeMilestoneMd(`## workflow-bridge
- **Status:** in_progress
- **status_override:** blocked
`);

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms!.status).toBe("blocked");
  });

  it("gracefully handles missing ROADMAP.md and MILESTONE.md", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');

    // No ROADMAP.md or MILESTONE.md — should not error
    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const ms = result.items.find(i => i.type === "milestone");
    expect(ms).toBeDefined();
    expect(ms!.body).toBe("");
    expect(ms!.status).toBe("queue");
  });

  it("existing workflow task scanning still works with milestones added", () => {
    writeWorkflowTask("m1", "task001.md",
      'id: m1-t1\ntitle: T1\nstatus: todo\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-02"');
    writeWorkflowTask("m1", "task002.md",
      'id: m1-t2\ntitle: T2\nstatus: done\nmilestone: m1\ncreated: "2026-04-01"\nupdated: "2026-04-03"');

    const result = scanProjectTasks(msTmpDir, "ms-proj", "MS Project");
    const tasks = result.items.filter(i => i.type === "task");
    const milestones = result.items.filter(i => i.type === "milestone");

    expect(tasks).toHaveLength(2);
    expect(milestones).toHaveLength(1);
    expect(result.items).toHaveLength(3); // 2 tasks + 1 milestone
  });
});
