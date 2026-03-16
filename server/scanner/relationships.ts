import { storage } from "../storage";
import type { Entity } from "@shared/types";
import { decodeProjectKey } from "./utils";

/** Safely get a string property from entity data */
function getStr(entity: Entity, key: string): string {
  const val = entity.data[key];
  return typeof val === "string" ? val : "";
}

/** Safely get a string array property from entity data */
function getStrArr(entity: Entity, key: string): string[] {
  const val = entity.data[key];
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === "string") : [];
}

export function buildRelationships(
  projects: Entity[],
  mcps: Entity[],
  skills: Entity[],
  markdowns: Entity[],
  plugins: Entity[]
): void {
  const projectByDir = new Map<string, Entity>();
  for (const p of projects) {
    const dirName = getStr(p, "dirName") || getStr(p, "projectKey");
    if (dirName) projectByDir.set(dirName, p);
  }

  // === Project <-> MCP relationships ===
  for (const mcp of mcps) {
    const isPlugin = mcp.tags.includes("plugin");
    const sourceFile = getStr(mcp, "sourceFile");

    // MCP defined in a project's .mcp.json (not root)
    if (!isPlugin && !sourceFile.endsWith("/.mcp.json")) {
      for (const project of projects) {
        const dirName = getStr(project, "dirName");
        if (dirName && sourceFile.includes(`/${dirName}/`)) {
          storage.addRelationship({
            sourceId: project.id,
            sourceType: "project",
            targetId: mcp.id,
            targetType: "mcp",
            relation: "defines_mcp",
          });
        }
      }
    }

    // Root MCPs: infer project by matching command/args paths
    if (!isPlugin && sourceFile.endsWith("/.mcp.json")) {
      const command = getStr(mcp, "command");
      const args = getStrArr(mcp, "args");
      const ref = `${command} ${args.join(" ")}`;
      for (const project of projects) {
        const dirName = getStr(project, "dirName");
        if (dirName && ref.includes(dirName)) {
          storage.addRelationship({
            sourceId: project.id,
            sourceType: "project",
            targetId: mcp.id,
            targetType: "mcp",
            relation: "uses_mcp",
          });
        }
      }
    }

    // Plugin MCPs -> connect to plugin entity
    if (isPlugin) {
      const pluginName = mcp.description?.match(/plugin: (.+)\)$/)?.[1];
      if (pluginName) {
        const plugin = plugins.find(
          (p) => p.name === pluginName || p.path.includes(`/${pluginName}`)
        );
        if (plugin) {
          storage.addRelationship({
            sourceId: plugin.id,
            sourceType: "plugin",
            targetId: mcp.id,
            targetType: "mcp",
            relation: "provides_mcp",
          });
        }
      }
    }
  }

  // === Project <-> Skill relationships (content-based inference) ===
  for (const skill of skills) {
    const content = getStr(skill, "content");
    for (const project of projects) {
      const dirName = getStr(project, "dirName");
      if (dirName && (content.includes(dirName) || content.includes(project.name))) {
        storage.addRelationship({
          sourceId: project.id,
          sourceType: "project",
          targetId: skill.id,
          targetType: "skill",
          relation: "has_skill",
        });
        // Annotate skill with projectName for frontend display
        skill.data.projectName = project.name;
      }
    }
  }

  // === Project <-> Markdown relationships ===
  for (const md of markdowns) {
    // CLAUDE.md files -> match by project directory
    if (md.name === "CLAUDE.md") {
      for (const project of projects) {
        const dirName = getStr(project, "dirName");
        if (dirName && md.path.includes(`/${dirName}/`)) {
          storage.addRelationship({
            sourceId: project.id,
            sourceType: "project",
            targetId: md.id,
            targetType: "markdown",
            relation: "has_claude_md",
          });
        }
      }
    }

    // Memory files -> link to project via decoded project key
    const category = getStr(md, "category");
    if (category === "memory" && md.path.includes("/memory/")) {
      const match = md.path.match(/\/projects\/([^/]+)\/memory\//);
      if (match) {
        const decoded = decodeProjectKey(match[1]);
        for (const project of projects) {
          if (decoded === project.path || decoded.startsWith(project.path + "/") || project.path.startsWith(decoded + "/")) {
            storage.addRelationship({
              sourceId: project.id,
              sourceType: "project",
              targetId: md.id,
              targetType: "markdown",
              relation: "has_memory",
            });
            break;
          }
        }
      }
    }

    // SKILL.md files -> link to matching skill
    if (md.name === "SKILL.md") {
      const skillDirName = md.path.split("/skills/")[1]?.split("/")[0];
      if (skillDirName) {
        const skill = skills.find((s) => s.name === skillDirName);
        if (skill) {
          storage.addRelationship({
            sourceId: skill.id,
            sourceType: "skill",
            targetId: md.id,
            targetType: "markdown",
            relation: "has_docs",
          });
        }
      }
    }
  }
}
