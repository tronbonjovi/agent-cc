import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

describe("getExtraPaths() tilde expansion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("expands ~/projects to ${os.homedir()}/projects", async () => {
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: [],
            extraProjectDirs: ["~/projects"],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    const { getExtraPaths } = await import("../server/scanner/utils");
    const result = getExtraPaths();
    expect(result.extraProjectDirs).toEqual([`${os.homedir()}/projects`]);
  });

  it("expands ~ alone to os.homedir()", async () => {
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: [],
            extraProjectDirs: ["~"],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    const { getExtraPaths } = await import("../server/scanner/utils");
    const result = getExtraPaths();
    expect(result.extraProjectDirs).toEqual([os.homedir()]);
  });

  it("leaves absolute paths like /opt/projects unchanged", async () => {
    vi.doMock("../server/db", () => ({
      getDB: () => ({
        appSettings: {
          scanPaths: {
            extraMcpFiles: [],
            extraProjectDirs: ["/opt/projects"],
            extraSkillDirs: [],
            extraPluginDirs: [],
          },
        },
      }),
    }));

    const { getExtraPaths } = await import("../server/scanner/utils");
    const result = getExtraPaths();
    expect(result.extraProjectDirs).toEqual(["/opt/projects"]);
  });
});

describe("isProcessAlive() PID checking", () => {
  it("returns true for the current process PID", async () => {
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a non-existent PID (99999999)", async () => {
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it("returns false for PID 0", async () => {
    const { isProcessAlive } = await import("../server/scanner/live-scanner");
    expect(isProcessAlive(0)).toBe(false);
  });
});

describe("findSessionFile fallback", () => {
  const tmpDir = path.join(os.tmpdir(), "cc-phase1-test-" + Date.now());
  const projectsDir = path.join(tmpDir, "projects");
  const projDir = path.join(projectsDir, "-home-user-myproject");

  beforeEach(() => {
    fs.mkdirSync(projDir, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns exact match when file is fresh", async () => {
    const sessionId = "aaaa-bbbb-cccc";
    const exactPath = path.join(projDir, `${sessionId}.jsonl`);
    fs.writeFileSync(exactPath, '{"type":"system"}\n');
    const now = new Date();
    fs.utimesSync(exactPath, now, now);

    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile(sessionId, projectsDir);
    expect(result).toContain(`${sessionId}.jsonl`);
  });

  it("returns most recent JSONL when exact match is stale", async () => {
    const oldSessionId = "aaaa-bbbb-cccc";
    const oldPath = path.join(projDir, `${oldSessionId}.jsonl`);
    fs.writeFileSync(oldPath, '{"type":"system"}\n');
    const staleTime = new Date(Date.now() - 600_000);
    fs.utimesSync(oldPath, staleTime, staleTime);

    const newSessionId = "dddd-eeee-ffff";
    const newPath = path.join(projDir, `${newSessionId}.jsonl`);
    fs.writeFileSync(newPath, '{"type":"system"}\n');
    const now = new Date();
    fs.utimesSync(newPath, now, now);

    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile(oldSessionId, projectsDir);
    expect(result).toContain(`${newSessionId}.jsonl`);
  });

  it("returns null when no match exists", async () => {
    const { findSessionFile } = await import("../server/scanner/live-scanner");
    const result = findSessionFile("nonexistent-id", projectsDir);
    expect(result).toBeNull();
  });
});

describe("modelsInUse consistency", () => {
  it("getLiveData returns modelsInUse as an array", async () => {
    const { getLiveData } = await import("../server/scanner/live-scanner");
    const data = getLiveData();
    expect(data).toHaveProperty("stats");
    expect(data.stats).toHaveProperty("modelsInUse");
    expect(Array.isArray(data.stats.modelsInUse)).toBe(true);
    expect(data.stats).toHaveProperty("agentsToday");
    expect(typeof data.stats.agentsToday).toBe("number");
  });
});

describe("TRASH_DIR location", () => {
  it("TRASH_DIR should be under home directory, not /tmp", async () => {
    const { TRASH_DIR } = await import("../server/config");
    const home = os.homedir();

    expect(TRASH_DIR).toContain(".claude-command-center");
    expect(TRASH_DIR).toContain("trash");
    expect(TRASH_DIR.startsWith(home.replace(/\\/g, "/"))).toBe(true);
  });
});
