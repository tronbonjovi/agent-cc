import { describe, it, expect } from "vitest";

describe("scanner module imports", () => {
  describe("markdown-scanner", () => {
    it("exports scanMarkdown as a function", async () => {
      const mod = await import("../server/scanner/markdown-scanner");
      expect(typeof mod.scanMarkdown).toBe("function");
    });
  });

  describe("skill-scanner", () => {
    it("exports scanSkills as a function", async () => {
      const mod = await import("../server/scanner/skill-scanner");
      expect(typeof mod.scanSkills).toBe("function");
    });
  });

  describe("plugin-scanner", () => {
    it("exports scanPlugins as a function", async () => {
      const mod = await import("../server/scanner/plugin-scanner");
      expect(typeof mod.scanPlugins).toBe("function");
    });
  });

  describe("agent-scanner", () => {
    it("exports scanAgentDefinitions as a function", async () => {
      const mod = await import("../server/scanner/agent-scanner");
      expect(typeof mod.scanAgentDefinitions).toBe("function");
    });

    it("exports getCachedDefinitions as a function", async () => {
      const mod = await import("../server/scanner/agent-scanner");
      expect(typeof mod.getCachedDefinitions).toBe("function");
    });

    it("exports getCachedExecutions as a function", async () => {
      const mod = await import("../server/scanner/agent-scanner");
      expect(typeof mod.getCachedExecutions).toBe("function");
    });

    it("exports getCachedAgentStats as a function", async () => {
      const mod = await import("../server/scanner/agent-scanner");
      expect(typeof mod.getCachedAgentStats).toBe("function");
    });

    it("getCachedDefinitions returns an array", async () => {
      const { getCachedDefinitions } = await import("../server/scanner/agent-scanner");
      const result = getCachedDefinitions();
      expect(Array.isArray(result)).toBe(true);
    });

    it("getCachedExecutions returns an array", async () => {
      const { getCachedExecutions } = await import("../server/scanner/agent-scanner");
      const result = getCachedExecutions();
      expect(Array.isArray(result)).toBe(true);
    });

    it("getCachedAgentStats returns object with expected shape", async () => {
      const { getCachedAgentStats } = await import("../server/scanner/agent-scanner");
      const stats = getCachedAgentStats();
      expect(typeof stats).toBe("object");
      expect(typeof stats.totalExecutions).toBe("number");
      expect(typeof stats.totalDefinitions).toBe("number");
      expect(typeof stats.sessionsWithAgents).toBe("number");
      expect(typeof stats.byType).toBe("object");
      expect(typeof stats.byModel).toBe("object");
    });
  });

  describe("config-scanner", () => {
    it("can be imported", async () => {
      const mod = await import("../server/scanner/config-scanner");
      expect(mod).toBeDefined();
    });
  });

  describe("graph-config-scanner", () => {
    it("can be imported", async () => {
      const mod = await import("../server/scanner/graph-config-scanner");
      expect(mod).toBeDefined();
    });
  });

  describe("live-scanner", () => {
    it("can be imported", async () => {
      const mod = await import("../server/scanner/live-scanner");
      expect(mod).toBeDefined();
    });
  });
});
