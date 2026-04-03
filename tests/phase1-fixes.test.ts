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
