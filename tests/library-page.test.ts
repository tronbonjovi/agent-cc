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
  it("has exactly 5 tabs", () => {
    expect(LIBRARY_TABS).toHaveLength(5);
  });

  it("tab ids are skills, plugins, mcps, agents, editor", () => {
    expect(LIBRARY_TAB_IDS).toEqual([
      "skills",
      "plugins",
      "mcps",
      "agents",
      "editor",
    ]);
  });

  it("default tab is skills", () => {
    expect(DEFAULT_TAB).toBe("skills");
  });

  it("tab labels match expected values", () => {
    expect(tabLabel("skills")).toBe("Skills");
    expect(tabLabel("plugins")).toBe("Plugins");
    expect(tabLabel("mcps")).toBe("MCP Servers");
    expect(tabLabel("agents")).toBe("Agents");
    expect(tabLabel("editor")).toBe("Info");
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

  it("falls back to skills for null", () => {
    expect(resolveTab(null)).toBe("skills");
  });

  it("falls back to skills for undefined", () => {
    expect(resolveTab(undefined)).toBe("skills");
  });

  it("falls back to skills for empty string", () => {
    expect(resolveTab("")).toBe("skills");
  });

  it("falls back to skills for invalid tab names", () => {
    expect(resolveTab("bogus")).toBe("skills");
    expect(resolveTab("SKILLS")).toBe("skills"); // case-sensitive
    expect(resolveTab("mcp")).toBe("skills");
    expect(resolveTab("skill")).toBe("skills");
  });

  it("simulates URL search param flow", () => {
    // Simulate: /library?tab=mcps
    const params = new URLSearchParams("?tab=mcps");
    expect(resolveTab(params.get("tab"))).toBe("mcps");

    // Simulate: /library (no tab param)
    const empty = new URLSearchParams("");
    expect(resolveTab(empty.get("tab"))).toBe("skills");

    // Simulate: /library?tab=invalid
    const bad = new URLSearchParams("?tab=invalid");
    expect(resolveTab(bad.get("tab"))).toBe("skills");
  });
});
