import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { validateSafePath } from "../server/routes/validation";

const home = os.homedir();
const tmp = os.tmpdir();

describe("validateSafePath", () => {
  it("accepts paths under home directory", async () => {
    const result = await validateSafePath(path.join(home, "documents", "test.md"));
    expect(result).not.toBeNull();
    expect(result!.startsWith(home)).toBe(true);
  });

  it("accepts valid home subpaths", async () => {
    const result = await validateSafePath(path.join(home, ".claude", "agents", "my-agent.md"));
    expect(result).not.toBeNull();
    expect(result!.startsWith(home)).toBe(true);
  });

  it("rejects paths outside home (/etc/passwd)", async () => {
    const result = await validateSafePath("/etc/passwd");
    expect(result).toBeNull();
  });

  it("rejects path traversal (../../etc/passwd)", async () => {
    const result = await validateSafePath(path.join(home, "..", "..", "etc", "passwd"));
    expect(result).toBeNull();
  });

  it("rejects null bytes", async () => {
    const result = await validateSafePath(path.join(home, "test\0.md"));
    expect(result).toBeNull();
  });

  it("rejects empty string", async () => {
    const result = await validateSafePath("");
    expect(result).toBeNull();
  });

  it("accepts /tmp paths", async () => {
    const result = await validateSafePath(path.join(tmp, "test-file.txt"));
    expect(result).not.toBeNull();
  });

  it("rejects URL-encoded traversal", async () => {
    // Decode %2e%2e (which is "..") then build a path that escapes home
    const decoded = decodeURIComponent("%2e%2e/%2e%2e/etc/passwd");
    // Use home as base so traversal escapes the home directory
    const malicious = path.join(home, decoded);
    const result = await validateSafePath(malicious);
    expect(result).toBeNull();
  });

  describe("symlink safety", () => {
    const symlinkDir = path.join(tmp, "path-safety-test-" + process.pid);
    const symlinkPath = path.join(symlinkDir, "evil-link");

    beforeAll(() => {
      fs.mkdirSync(symlinkDir, { recursive: true });
      try {
        fs.symlinkSync("/etc", symlinkPath);
      } catch {
        // May fail if symlink already exists
      }
    });

    afterAll(() => {
      try {
        fs.unlinkSync(symlinkPath);
        fs.rmdirSync(symlinkDir);
      } catch {
        // Cleanup best-effort
      }
    });

    it("rejects symlinks pointing outside home/tmp", async () => {
      // The symlink points to /etc, which resolves outside home and tmp
      const testPath = path.join(symlinkPath, "passwd");
      const result = await validateSafePath(testPath);
      expect(result).toBeNull();
    });
  });

  it("returns the home directory itself", async () => {
    const result = await validateSafePath(home);
    expect(result).not.toBeNull();
  });

  it("returns the tmp directory itself", async () => {
    const result = await validateSafePath(tmp);
    expect(result).not.toBeNull();
  });
});
