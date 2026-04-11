import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("library lifecycle", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-lifecycle-"));
    origHome = process.env.HOME || "";
    process.env.HOME = tmpDir;
    // Reset module cache so modules re-evaluate os.homedir() with new HOME
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("full lifecycle: save → scan → install → uninstall → remove", async () => {
    const claudeDir = path.join(tmpDir, ".claude");

    // 1. Save to library (simulate download)
    const libSkillDir = path.join(claudeDir, "library", "skills", "test-skill");
    fs.mkdirSync(libSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(libSkillDir, "SKILL.md"),
      "---\nname: test-skill\ndescription: Test\n---\nContent"
    );

    // 2. Scanner should find it (dynamic import to pick up new HOME)
    const { scanLibrary } = await import("../server/scanner/library-scanner");
    let items = scanLibrary();
    expect(items).toHaveLength(1);
    expect(items[0].data.libraryStatus).toBe("uninstalled");

    // 3. Install — moves from library to active directory
    const { installItem } = await import("../server/routes/library");
    const installResult = await installItem("skills", "test-skill");
    expect(installResult.success).toBe(true);
    expect(
      fs.existsSync(path.join(claudeDir, "skills", "test-skill", "SKILL.md"))
    ).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);

    // 4. Uninstall — moves from active back to library
    const { uninstallItem } = await import("../server/routes/library");
    const uninstallResult = await uninstallItem("skills", "test-skill");
    expect(uninstallResult.success).toBe(true);
    expect(
      fs.existsSync(path.join(claudeDir, "skills", "test-skill"))
    ).toBe(false);
    expect(
      fs.existsSync(path.join(libSkillDir, "SKILL.md"))
    ).toBe(true);

    // 5. Remove — permanently deletes from library
    const { removeItem } = await import("../server/routes/library");
    const removeResult = await removeItem("skills", "test-skill");
    expect(removeResult.success).toBe(true);
    expect(fs.existsSync(libSkillDir)).toBe(false);

    // 6. Scanner returns empty after removal
    // Need fresh import since LIBRARY_DIR is module-scope cached
    vi.resetModules();
    const { scanLibrary: scanLibrary2 } = await import(
      "../server/scanner/library-scanner"
    );
    items = scanLibrary2();
    expect(items).toHaveLength(0);
  });
});
