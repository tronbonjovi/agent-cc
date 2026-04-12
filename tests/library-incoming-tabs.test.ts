// tests/library-incoming-tabs.test.ts
// Tests for adding Discover, Prompts, and Bash KB tabs to Library
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LIBRARY_TABS_PATH = path.resolve(__dirname, "../client/src/lib/library-tabs.ts");
const LIBRARY_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const DISCOVER_TAB_PATH = path.resolve(__dirname, "../client/src/components/discover-tab.tsx");
const ANALYTICS_PANEL_PATH = path.resolve(__dirname, "../client/src/components/session-analytics-panel.tsx");

describe("library-tabs.ts — new tab definitions", () => {
  const src = fs.readFileSync(LIBRARY_TABS_PATH, "utf-8");

  it("includes discover tab", () => {
    expect(src).toMatch(/id:\s*["']discover["']/);
    expect(src).toMatch(/label:\s*["']Discover["']/);
  });

  it("includes prompts tab", () => {
    expect(src).toMatch(/id:\s*["']prompts["']/);
    expect(src).toMatch(/label:\s*["']Prompts["']/);
  });

  it("includes bash-kb tab", () => {
    expect(src).toMatch(/id:\s*["']bash-kb["']/);
    expect(src).toMatch(/label:\s*["']Bash KB["']/);
  });

  it("has correct tab order: editor, skills, plugins, mcps, agents, discover, prompts, bash-kb", () => {
    const idMatches = [...src.matchAll(/id:\s*["']([^"']+)["']/g)].map(m => m[1]);
    expect(idMatches).toEqual(["editor", "skills", "plugins", "mcps", "agents", "discover", "prompts", "bash-kb"]);
  });
});

describe("library.tsx — imports and renders new tabs", () => {
  const src = fs.readFileSync(LIBRARY_PAGE_PATH, "utf-8");

  it("imports DiscoverTab", () => {
    expect(src).toMatch(/import.*DiscoverTab.*from/);
  });

  it("imports PromptsPanel from prompts-panel", () => {
    // Cleanup note (messages-redesign-task005): the prompts panel was
    // extracted out of the now-deleted message-history.tsx into its own
    // page module so the legacy file could be removed.
    expect(src).toMatch(/import.*PromptsPanel.*from.*prompts-panel/);
  });

  it("imports BashKnowledgePanel", () => {
    expect(src).toMatch(/import.*BashKnowledgePanel.*from/);
  });

  it("has discover icon in TAB_ICONS", () => {
    expect(src).toMatch(/discover:\s*(Search|Compass)/);
  });

  it("has prompts icon in TAB_ICONS", () => {
    expect(src).toMatch(/prompts:\s*\w+/);
  });

  it("has bash-kb icon in TAB_ICONS", () => {
    expect(src).toMatch(/["']bash-kb["']:\s*\w+/);
  });

  it("renders DiscoverTab component", () => {
    expect(src).toMatch(/<DiscoverTab/);
  });

  it("renders PromptsPanel component for prompts tab", () => {
    expect(src).toMatch(/<PromptsPanel/);
  });

  it("renders BashKnowledgePanel component", () => {
    expect(src).toMatch(/<BashKnowledgePanel/);
  });
});

describe("BashKnowledgePanel is exported from session-analytics-panel", () => {
  const src = fs.readFileSync(ANALYTICS_PANEL_PATH, "utf-8");

  it("exports BashKnowledgePanel", () => {
    expect(src).toMatch(/export\s+function\s+BashKnowledgePanel/);
  });
});
