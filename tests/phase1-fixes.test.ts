import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "os";

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
