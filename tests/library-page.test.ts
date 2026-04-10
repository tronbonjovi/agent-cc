// tests/library-page.test.ts
import { describe, it, expect } from "vitest";
import {
  LIBRARY_TABS,
  LIBRARY_TAB_IDS,
  DEFAULT_TAB,
  resolveTab,
  tabLabel,
} from "../client/src/lib/library-tabs";

describe("library tabs", () => {
  it("has exactly 8 tabs", () => {
    expect(LIBRARY_TABS).toHaveLength(8);
  });

  it("tab ids are editor, skills, plugins, mcps, agents, discover, prompts, bash-kb", () => {
    expect(LIBRARY_TAB_IDS).toEqual([
      "editor",
      "skills",
      "plugins",
      "mcps",
      "agents",
      "discover",
      "prompts",
      "bash-kb",
    ]);
  });

  it("default tab is editor", () => {
    expect(DEFAULT_TAB).toBe("editor");
  });

  it("tab labels match expected values", () => {
    expect(tabLabel("editor")).toBe("Info");
    expect(tabLabel("skills")).toBe("Skills");
    expect(tabLabel("plugins")).toBe("Plugins");
    expect(tabLabel("mcps")).toBe("MCP Servers");
    expect(tabLabel("agents")).toBe("Agents");
  });
});

describe("resolveTab — URL param parsing", () => {
  it("returns the tab id for valid values", () => {
    expect(resolveTab("skills")).toBe("skills");
    expect(resolveTab("plugins")).toBe("plugins");
    expect(resolveTab("mcps")).toBe("mcps");
    expect(resolveTab("agents")).toBe("agents");
    expect(resolveTab("editor")).toBe("editor");
  });

  it("falls back to editor for null", () => {
    expect(resolveTab(null)).toBe("editor");
  });

  it("falls back to editor for undefined", () => {
    expect(resolveTab(undefined)).toBe("editor");
  });

  it("falls back to editor for empty string", () => {
    expect(resolveTab("")).toBe("editor");
  });

  it("falls back to editor for invalid tab names", () => {
    expect(resolveTab("bogus")).toBe("editor");
    expect(resolveTab("SKILLS")).toBe("editor"); // case-sensitive
    expect(resolveTab("mcp")).toBe("editor");
    expect(resolveTab("skill")).toBe("editor");
  });

  it("simulates URL search param flow", () => {
    // Simulate: /library?tab=mcps
    const params = new URLSearchParams("?tab=mcps");
    expect(resolveTab(params.get("tab"))).toBe("mcps");

    // Simulate: /library (no tab param)
    const empty = new URLSearchParams("");
    expect(resolveTab(empty.get("tab"))).toBe("editor");

    // Simulate: /library?tab=invalid
    const bad = new URLSearchParams("?tab=invalid");
    expect(resolveTab(bad.get("tab"))).toBe("editor");
  });
});
