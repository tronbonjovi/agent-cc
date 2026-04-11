import path from "path";
import fs from "fs";
import matter from "gray-matter";
import { entityId, safeReadText, getFileStat, LIBRARY_DIR, now, dirExists, fileExists, normPath, listDirs } from "./utils";
import type { Entity } from "@shared/types";

type LibraryEntityKind = "skill" | "agent" | "plugin";

interface LibraryItem extends Entity {
  data: Record<string, unknown> & {
    libraryStatus: "uninstalled";
    entityKind: LibraryEntityKind;
  };
}

function scanLibrarySkills(): LibraryItem[] {
  const skillsDir = normPath(LIBRARY_DIR, "skills");
  if (!dirExists(skillsDir)) return [];

  const results: LibraryItem[] = [];
  for (const skillDir of listDirs(skillsDir)) {
    const skillFile = normPath(skillDir, "SKILL.md");
    if (!fileExists(skillFile)) continue;

    const content = safeReadText(skillFile);
    if (!content) continue;

    const stat = getFileStat(skillFile);
    const skillName = path.basename(skillDir);

    let frontmatter: Record<string, any> = {};
    let body = content;
    try {
      const parsed = matter(content);
      frontmatter = parsed.data;
      body = parsed.content;
    } catch {}

    results.push({
      id: entityId(`library:skill:${skillFile}`),
      type: "skill",
      name: frontmatter.name || skillName,
      path: skillFile,
      description: frontmatter.description || null,
      lastModified: stat?.mtime ?? null,
      tags: frontmatter["user-invocable"] ? ["invocable", "library"] : ["library"],
      health: "ok",
      data: {
        libraryStatus: "uninstalled",
        entityKind: "skill",
        userInvocable: frontmatter["user-invocable"] === true,
        args: frontmatter.args || null,
        content: body.trim().slice(0, 1500),
      },
      scannedAt: now(),
    });
  }
  return results;
}

function scanLibraryAgents(): LibraryItem[] {
  const agentsDir = normPath(LIBRARY_DIR, "agents");
  if (!dirExists(agentsDir)) return [];

  const results: LibraryItem[] = [];
  try {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const filePath = normPath(agentsDir, entry.name);
      const content = safeReadText(filePath);
      if (!content) continue;

      const stat = getFileStat(filePath);
      let frontmatter: Record<string, any> = {};
      let body = content;
      try {
        const parsed = matter(content);
        frontmatter = parsed.data;
        body = parsed.content;
      } catch {}

      const name = frontmatter.name || entry.name.replace(/\.md$/, "");
      results.push({
        id: entityId(`library:agent:${filePath}`),
        type: "skill", // stored as skill entity type for entity system compatibility
        name,
        path: filePath,
        description: frontmatter.description || null,
        lastModified: stat?.mtime ?? null,
        tags: ["library", "agent"],
        health: "ok",
        data: {
          libraryStatus: "uninstalled",
          entityKind: "agent",
          model: frontmatter.model || null,
          content: body.trim().slice(0, 1500),
        },
        scannedAt: now(),
      });
    }
  } catch {}
  return results;
}

function scanLibraryPlugins(): LibraryItem[] {
  const pluginsDir = normPath(LIBRARY_DIR, "plugins");
  if (!dirExists(pluginsDir)) return [];

  const results: LibraryItem[] = [];
  for (const pluginDir of listDirs(pluginsDir)) {
    const pluginName = path.basename(pluginDir);
    const stat = getFileStat(pluginDir);

    // Try to find description from manifest.json, plugin.json, or package.json
    let description: string | null = null;
    for (const manifest of ["manifest.json", "plugin.json", "package.json"]) {
      const manifestPath = normPath(pluginDir, manifest);
      if (fileExists(manifestPath)) {
        try {
          const data = JSON.parse(safeReadText(manifestPath) || "{}");
          description = data.description || null;
          if (description) break;
        } catch {}
      }
    }

    results.push({
      id: entityId(`library:plugin:${pluginDir}`),
      type: "plugin",
      name: pluginName,
      path: pluginDir,
      description,
      lastModified: stat?.mtime ?? null,
      tags: ["library"],
      health: "ok",
      data: {
        libraryStatus: "uninstalled",
        entityKind: "plugin",
      },
      scannedAt: now(),
    });
  }
  return results;
}

/** Scan all library directories for uninstalled items */
export function scanLibrary(): LibraryItem[] {
  return [
    ...scanLibrarySkills(),
    ...scanLibraryAgents(),
    ...scanLibraryPlugins(),
  ];
}
