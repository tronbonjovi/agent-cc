import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// Mock runFullScan so it doesn't actually scan during tests
vi.mock("../server/scanner/index", () => ({
  runFullScan: vi.fn().mockResolvedValue(undefined),
}));

describe("library file operations", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-ops-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
    // Reset modules so CLAUDE_DIR / LIBRARY_DIR pick up the new HOME
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs a skill from library to active directory", async () => {
    // Set up library skill
    const libSkillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(path.join(libSkillDir, "SKILL.md"), "---\nname: my-skill\n---\nContent");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "my-skill");

    expect(result.success).toBe(true);
    const activeDir = path.join(tmpDir, ".claude", "skills", "my-skill");
    expect(fs.existsSync(path.join(activeDir, "SKILL.md"))).toBe(true);
    // Library copy should be removed (moved, not copied)
    expect(fs.existsSync(libSkillDir)).toBe(false);
  });

  it("uninstalls a skill from active to library directory", async () => {
    // Set up active skill
    const activeDir = path.join(tmpDir, ".claude", "skills", "my-skill");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, "SKILL.md"), "---\nname: my-skill\n---\nContent");

    const { uninstallItem } = await import("../server/routes/library");
    const result = await uninstallItem("skills", "my-skill");

    expect(result.success).toBe(true);
    const libDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    expect(fs.existsSync(path.join(libDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(activeDir)).toBe(false);
  });

  it("removes a library item permanently", async () => {
    const libSkillDir = path.join(tmpDir, ".claude", "library", "skills", "my-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(path.join(libSkillDir, "SKILL.md"), "content");

    const { removeItem } = await import("../server/routes/library");
    const result = await removeItem("skills", "my-skill");

    expect(result.success).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);
  });

  it("returns error when installing non-existent library item", async () => {
    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns collision warning when target already exists", async () => {
    // Library copy
    const libDir = path.join(tmpDir, ".claude", "library", "skills", "conflict");
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, "SKILL.md"), "library version");

    // Active copy already exists
    const activeDir = path.join(tmpDir, ".claude", "skills", "conflict");
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, "SKILL.md"), "active version");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("skills", "conflict");
    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("handles agent files (single .md, not directory)", async () => {
    const agentsLibDir = path.join(tmpDir, ".claude", "library", "agents");
    fs.mkdirSync(agentsLibDir, { recursive: true });
    fs.writeFileSync(path.join(agentsLibDir, "reviewer.md"), "---\nname: reviewer\n---\nReview");

    const { installItem } = await import("../server/routes/library");
    const result = await installItem("agents", "reviewer.md");

    expect(result.success).toBe(true);
    const activePath = path.join(tmpDir, ".claude", "agents", "reviewer.md");
    expect(fs.existsSync(activePath)).toBe(true);
  });
});
