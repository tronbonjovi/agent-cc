import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { entityId, fileExists, dirExists } from "../server/scanner/utils";

const tmpDir = path.join(os.tmpdir(), "cc-project-scanner-test-" + Date.now());
const mockProjectDir = path.join(tmpDir, "mock-project");

beforeAll(() => {
  fs.mkdirSync(mockProjectDir, { recursive: true });

  // Create mock project files
  fs.writeFileSync(
    path.join(mockProjectDir, "package.json"),
    JSON.stringify({ name: "mock-project", version: "1.0.0", dependencies: { express: "^4.18.0" } }),
  );
  fs.writeFileSync(
    path.join(mockProjectDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "es2020" } }),
  );
  fs.writeFileSync(
    path.join(mockProjectDir, "CLAUDE.md"),
    "# Mock Project\n\nA test project for scanner coverage.\n",
  );
  fs.mkdirSync(path.join(mockProjectDir, ".git"), { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("project-scanner", () => {
  it("can be imported and scanProjects is a function", async () => {
    const mod = await import("../server/scanner/project-scanner");
    expect(typeof mod.scanProjects).toBe("function");
  });
});

describe("entityId", () => {
  it("produces stable 16-char hex IDs for project paths", () => {
    const id = entityId(mockProjectDir);
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    // Deterministic: same input produces same output
    expect(entityId(mockProjectDir)).toBe(id);
  });

  it("produces different IDs for different paths", () => {
    const id1 = entityId("/tmp/project-a");
    const id2 = entityId("/tmp/project-b");
    expect(id1).not.toBe(id2);
  });
});

describe("fileExists", () => {
  it("detects package.json", () => {
    expect(fileExists(path.join(mockProjectDir, "package.json"))).toBe(true);
  });

  it("detects tsconfig.json", () => {
    expect(fileExists(path.join(mockProjectDir, "tsconfig.json"))).toBe(true);
  });

  it("detects CLAUDE.md", () => {
    expect(fileExists(path.join(mockProjectDir, "CLAUDE.md"))).toBe(true);
  });

  it("returns false for non-existent file", () => {
    expect(fileExists(path.join(mockProjectDir, "nonexistent.txt"))).toBe(false);
  });
});

describe("dirExists", () => {
  it("detects .git directory", () => {
    expect(dirExists(path.join(mockProjectDir, ".git"))).toBe(true);
  });

  it("returns false for non-existent directory", () => {
    expect(dirExists(path.join(mockProjectDir, "nonexistent-dir"))).toBe(false);
  });

  it("returns false when path points to a file", () => {
    expect(dirExists(path.join(mockProjectDir, "package.json"))).toBe(false);
  });
});
