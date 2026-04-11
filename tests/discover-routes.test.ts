import { describe, it, expect } from "vitest";
import { buildGitHubQuery } from "../server/routes/discover";

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
});
