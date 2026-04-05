import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import type { Entity, EntityType } from "@shared/types";

// Set AGENT_CC_DATA before importing storage/db so the module uses our temp dir
const tmpDir = path.join(os.tmpdir(), "cc-rel-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.AGENT_CC_DATA = tmpDir;

// Dynamic import so env var is read at module init time
const { Storage } = await import("../server/storage");
const { getDB } = await import("../server/db");
const { buildRelationships } = await import("../server/scanner/relationships");

function makeEntity(id: string, type: EntityType, extra?: Partial<Entity>): Entity {
  return {
    id,
    type,
    name: extra?.name ?? `Entity ${id}`,
    path: extra?.path ?? `/test/${id}`,
    description: extra?.description ?? null,
    lastModified: extra?.lastModified ?? null,
    tags: extra?.tags ?? [],
    health: extra?.health ?? "ok",
    data: extra?.data ?? {},
    scannedAt: extra?.scannedAt ?? new Date().toISOString(),
  };
}

function resetDB(): void {
  const db = getDB();
  for (const key of Object.keys(db.entities)) delete db.entities[key];
  db.relationships = [];
  db.nextRelId = 1;
  db.markdownBackups = [];
  db.nextBackupId = 1;
  db.discoveryCache = {};
  db.customNodes = [];
  db.customEdges = [];
  db.entityOverrides = {};
}

describe("buildRelationships", () => {
  let storage: InstanceType<typeof Storage>;

  beforeEach(() => {
    const dbPath = path.join(tmpDir, "agent-cc.json");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const tmpPath = dbPath + ".tmp";
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    resetDB();
    storage = new Storage();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates project-MCP relationship when MCP sourceFile is under project path", () => {
    const project = makeEntity("proj1", "project", {
      name: "MyProject",
      path: "/home/user/myproject",
      data: { dirName: "myproject", projectKey: "myproject" },
    });
    const mcp = makeEntity("mcp1", "mcp", {
      name: "My MCP",
      path: "/home/user/myproject/.mcp.json",
      data: { sourceFile: "/home/user/myproject/.mcp.json", command: "node", args: ["server.js"] },
    });

    buildRelationships([project], [mcp], [], [], []);

    const rels = storage.getAllRelationships();
    const defines = rels.filter((r) => r.relation === "defines_mcp");
    expect(defines).toHaveLength(1);
    expect(defines[0].sourceId).toBe("proj1");
    expect(defines[0].targetId).toBe("mcp1");
    expect(defines[0].sourceType).toBe("project");
    expect(defines[0].targetType).toBe("mcp");
  });

  it("creates project-skill relationship when skill path is under project path", () => {
    const project = makeEntity("proj1", "project", {
      name: "MyProject",
      path: "/home/user/myproject",
      data: { dirName: "myproject", projectKey: "myproject" },
    });
    const skill = makeEntity("skill1", "skill", {
      name: "my-skill",
      path: "/home/user/myproject/.claude/skills/my-skill",
      data: { content: "some content", userInvocable: true, args: null },
    });

    buildRelationships([project], [], [skill], [], []);

    const rels = storage.getAllRelationships();
    const hasSkill = rels.filter((r) => r.relation === "has_skill");
    expect(hasSkill).toHaveLength(1);
    expect(hasSkill[0].sourceId).toBe("proj1");
    expect(hasSkill[0].targetId).toBe("skill1");
    expect(hasSkill[0].sourceType).toBe("project");
    expect(hasSkill[0].targetType).toBe("skill");
  });

  it("creates project-markdown relationship when markdown path matches project dirName", () => {
    const project = makeEntity("proj1", "project", {
      name: "MyProject",
      path: "/home/user/myproject",
      data: { dirName: "myproject", projectKey: "myproject" },
    });
    const md = makeEntity("md1", "markdown", {
      name: "CLAUDE.md",
      path: "/home/user/myproject/CLAUDE.md",
      data: { category: "claude-md", sizeBytes: 100, preview: "test", frontmatter: null },
    });

    buildRelationships([project], [], [], [md], []);

    const rels = storage.getAllRelationships();
    const hasClaudeMd = rels.filter((r) => r.relation === "has_claude_md");
    expect(hasClaudeMd).toHaveLength(1);
    expect(hasClaudeMd[0].sourceId).toBe("proj1");
    expect(hasClaudeMd[0].targetId).toBe("md1");
  });

  it("creates no relationships for unrelated entities", () => {
    const project = makeEntity("proj1", "project", {
      name: "MyProject",
      path: "/home/user/myproject",
      data: { dirName: "myproject", projectKey: "myproject" },
    });
    const mcp = makeEntity("mcp1", "mcp", {
      name: "Other MCP",
      path: "/home/user/other/.mcp.json",
      data: { sourceFile: "/home/user/other/.mcp.json", command: "other-cmd", args: [] },
    });
    const skill = makeEntity("skill1", "skill", {
      name: "other-skill",
      path: "/somewhere/else/skill",
      data: { content: "unrelated content", userInvocable: true, args: null },
    });
    const md = makeEntity("md1", "markdown", {
      name: "README.md",
      path: "/somewhere/else/README.md",
      data: { category: "readme", sizeBytes: 50, preview: "readme", frontmatter: null },
    });

    buildRelationships([project], [mcp], [skill], [md], []);

    const rels = storage.getAllRelationships();
    // The global MCP will be linked with "uses_mcp" since it's unconnected and not a plugin
    const nonGlobal = rels.filter((r) => r.relation !== "uses_mcp");
    expect(nonGlobal).toHaveLength(0);
  });

  it("creates plugin-skill relationship when skill belongs to a plugin", () => {
    const plugin = makeEntity("plug1", "plugin", {
      name: "my-plugin",
      path: "/home/user/.claude/plugins/my-plugin",
      data: { marketplace: null, installed: true, blocked: false, hasMCP: false },
    });
    const skill = makeEntity("skill1", "skill", {
      name: "plugin-skill",
      path: "/home/user/.claude/plugins/my-plugin/skills/plugin-skill",
      data: { content: "plugin skill content", userInvocable: true, args: null },
    });

    buildRelationships([], [], [skill], [], [plugin]);

    const rels = storage.getAllRelationships();
    const pluginSkill = rels.filter((r) => r.relation === "has_skill" && r.sourceType === "plugin");
    expect(pluginSkill).toHaveLength(1);
    expect(pluginSkill[0].sourceId).toBe("plug1");
    expect(pluginSkill[0].targetId).toBe("skill1");
    expect(pluginSkill[0].sourceType).toBe("plugin");
    expect(pluginSkill[0].targetType).toBe("skill");
  });

  it("links global MCPs to all projects via uses_mcp", () => {
    const project1 = makeEntity("proj1", "project", {
      name: "Project A",
      path: "/home/user/project-a",
      data: { dirName: "project-a", projectKey: "project-a" },
    });
    const project2 = makeEntity("proj2", "project", {
      name: "Project B",
      path: "/home/user/project-b",
      data: { dirName: "project-b", projectKey: "project-b" },
    });
    // MCP that lives outside both projects and has no matching dirName in args
    const mcp = makeEntity("mcp1", "mcp", {
      name: "Global MCP",
      path: "/home/user/.mcp.json",
      data: { sourceFile: "/home/user/.mcp.json", command: "global-cmd", args: [] },
    });

    buildRelationships([project1, project2], [mcp], [], [], []);

    const rels = storage.getAllRelationships();
    const usesMcp = rels.filter((r) => r.relation === "uses_mcp");
    expect(usesMcp).toHaveLength(2);
    expect(usesMcp.map((r) => r.sourceId).sort()).toEqual(["proj1", "proj2"]);
    expect(usesMcp.every((r) => r.targetId === "mcp1")).toBe(true);
  });

  it("links plugin MCP to plugin entity via provides_mcp", () => {
    const plugin = makeEntity("plug1", "plugin", {
      name: "test-plugin",
      path: "/home/user/.claude/plugins/test-plugin",
      data: { marketplace: null, installed: true, blocked: false, hasMCP: true },
    });
    const mcp = makeEntity("mcp1", "mcp", {
      name: "Plugin MCP",
      path: "/home/user/.claude/plugins/test-plugin/.mcp.json",
      description: "MCP (plugin: test-plugin)",
      tags: ["plugin"],
      data: { sourceFile: "/home/user/.claude/plugins/test-plugin/.mcp.json", command: "node", args: [] },
    });

    buildRelationships([], [mcp], [], [], [plugin]);

    const rels = storage.getAllRelationships();
    const providesMcp = rels.filter((r) => r.relation === "provides_mcp");
    expect(providesMcp).toHaveLength(1);
    expect(providesMcp[0].sourceId).toBe("plug1");
    expect(providesMcp[0].targetId).toBe("mcp1");
    expect(providesMcp[0].sourceType).toBe("plugin");
    expect(providesMcp[0].targetType).toBe("mcp");
  });
});
