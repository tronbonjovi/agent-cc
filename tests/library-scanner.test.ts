import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("library-scanner", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-scan-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("scans skills from ~/.claude/library/skills/", async () => {
    const skillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
      "---",
      "name: my-skill",
      "description: A test skill",
      "user-invocable: true",
      "---",
      "",
      "Do the thing.",
    ].join("\n"));

    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("skill");
    expect(items[0].name).toBe("my-skill");
    expect(items[0].data.libraryStatus).toBe("uninstalled");
    expect(items[0].data.entityKind).toBe("skill");
    expect(items[0].tags).toContain("library");
  });

  it("scans agents from ~/.claude/library/agents/", async () => {
    const agentDir = path.join(tmpDir, ".claude", "library", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "reviewer.md"), [
      "---",
      "name: reviewer",
      "description: Code reviewer agent",
      "model: sonnet",
      "---",
      "",
      "Review code carefully.",
    ].join("\n"));

    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("skill");
    expect(items[0].name).toBe("reviewer");
    expect(items[0].data.libraryStatus).toBe("uninstalled");
    expect(items[0].data.entityKind).toBe("agent");
    expect(items[0].tags).toContain("library");
    expect(items[0].tags).toContain("agent");
  });

  it("scans plugins from ~/.claude/library/plugins/", async () => {
    const pluginDir = path.join(tmpDir, ".claude", "library", "plugins", "my-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "package.json"), JSON.stringify({
      name: "my-plugin",
      description: "A test plugin",
    }));

    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("plugin");
    expect(items[0].name).toBe("my-plugin");
    expect(items[0].data.libraryStatus).toBe("uninstalled");
    expect(items[0].data.entityKind).toBe("plugin");
    expect(items[0].tags).toContain("library");
  });

  it("returns empty array when library dir does not exist", async () => {
    const { scanLibrary } = await import("../server/scanner/library-scanner");
    const items = scanLibrary();
    expect(items).toEqual([]);
  });
});
