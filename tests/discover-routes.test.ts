import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { buildGitHubQuery, ensureLibraryDir } from "../server/routes/discover";

describe("discover routes", () => {
  describe("buildGitHubQuery", () => {
    it("builds correct GitHub search query for skills", () => {
      const query = buildGitHubQuery("skills", "terminal");
      expect(query).toContain("SKILL.md");
      expect(query).toContain("terminal");
    });

    it("builds correct GitHub search query for agents", () => {
      const query = buildGitHubQuery("agents", "coding");
      expect(query).toContain("claude");
      expect(query).toContain("agent");
      expect(query).toContain("coding");
    });

    it("builds correct GitHub search query for plugins", () => {
      const query = buildGitHubQuery("plugins", "linter");
      expect(query).toContain("claude");
      expect(query).toContain("plugin");
      expect(query).toContain("linter");
    });

    it("returns empty string for unknown type", () => {
      const query = buildGitHubQuery("unknown" as any, "test");
      expect(query).toBe("");
    });

    it("handles empty search term", () => {
      const query = buildGitHubQuery("skills", "");
      expect(query).toContain("SKILL.md");
    });
  });

  describe("save to library", () => {
    let tmpDir: string;
    let origHome: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-save-"));
      origHome = process.env.HOME || "";
      process.env.HOME = tmpDir;
    });

    afterEach(() => {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("creates library directory structure on first save", () => {
      const dir = ensureLibraryDir("skills", "my-skill");
      expect(fs.existsSync(dir)).toBe(true);
      expect(dir).toContain(path.join(".claude", "library", "skills", "my-skill"));
    });

    it("returns existing directory without error on repeat call", () => {
      const dir1 = ensureLibraryDir("agents", "reviewer");
      const dir2 = ensureLibraryDir("agents", "reviewer");
      expect(dir1).toBe(dir2);
      expect(fs.existsSync(dir2)).toBe(true);
    });

    it("creates separate directories for different types", () => {
      const skillDir = ensureLibraryDir("skills", "my-tool");
      const agentDir = ensureLibraryDir("agents", "my-tool");
      expect(skillDir).not.toBe(agentDir);
      expect(skillDir).toContain("skills");
      expect(agentDir).toContain("agents");
    });
  });
});
