// tests/library-redirects.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");
const appSource = fs.readFileSync(APP_PATH, "utf-8");

const OLD_PAGES_DIR = path.resolve(__dirname, "../client/src/pages");

describe("Library redirects — old entity routes redirect to Library tabs", () => {
  const redirectMap: Record<string, string> = {
    "/skills": "/library?tab=skills",
    "/plugins": "/library?tab=plugins",
    "/mcps": "/library?tab=mcps",
    "/agents": "/library?tab=agents",
    "/markdown": "/library?tab=editor",
  };

  for (const [oldRoute, newRoute] of Object.entries(redirectMap)) {
    it(`${oldRoute} redirects to ${newRoute}`, () => {
      // The route should exist in the Switch
      const routePattern = new RegExp(
        `Route\\s+path=["']${oldRoute.replace("/", "\\/")}["'][^>]*>\\s*<Redirect\\s+to=["']${newRoute.replace(/[?=]/g, "\\$&")}["']`
      );
      expect(appSource).toMatch(routePattern);
    });
  }

  it("/markdown/:id still works as a standalone route (not a redirect)", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/markdown\/:id["']/);
    // Should render MarkdownEdit, not a redirect
    expect(appSource).toMatch(/MarkdownEdit/);
  });
});

describe("Stale imports removed from App.tsx", () => {
  const removedPages = ["Skills", "Plugins", "MCPs", "Agents", "MarkdownFiles"];

  for (const page of removedPages) {
    it(`does not import ${page} page component`, () => {
      const importPattern = new RegExp(
        `const\\s+${page}\\s*=\\s*lazy\\s*\\(`
      );
      expect(appSource).not.toMatch(importPattern);
    });
  }

  it("still imports MarkdownEdit (editor detail page)", () => {
    expect(appSource).toMatch(/const\s+MarkdownEdit\s*=\s*lazy\s*\(/);
  });
});

describe("Old standalone page files removed", () => {
  const deletedFiles = [
    "skills.tsx",
    "plugins.tsx",
    "mcps.tsx",
    "agents.tsx",
    "markdown-files.tsx",
  ];

  for (const file of deletedFiles) {
    it(`${file} no longer exists in pages directory`, () => {
      const filePath = path.join(OLD_PAGES_DIR, file);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  }
});

describe("Internal links updated to Library tabs", () => {
  it("keyboard shortcuts use /library?tab= routes", () => {
    const shortcutsPath = path.resolve(
      __dirname,
      "../client/src/hooks/use-keyboard-shortcuts.ts"
    );
    const source = fs.readFileSync(shortcutsPath, "utf-8");
    expect(source).not.toMatch(/["']\/agents["']/);
    expect(source).not.toMatch(/["']\/mcps["']/);
    expect(source).not.toMatch(/["']\/skills["']/);
    expect(source).toContain("/library?tab=agents");
    expect(source).toContain("/library?tab=mcps");
    expect(source).toContain("/library?tab=skills");
  });

  it("global search uses /library?tab= routes for entities", () => {
    const globalSearchPath = path.resolve(
      __dirname,
      "../client/src/components/global-search.tsx"
    );
    const source = fs.readFileSync(globalSearchPath, "utf-8");
    expect(source).not.toMatch(/return\s+["']\/mcps["']/);
    expect(source).not.toMatch(/return\s+["']\/skills["']/);
    expect(source).not.toMatch(/return\s+["']\/plugins["']/);
    expect(source).toContain("/library?tab=mcps");
    expect(source).toContain("/library?tab=skills");
    expect(source).toContain("/library?tab=plugins");
  });

  it("graph navigation uses /library?tab= routes", () => {
    const graphPath = path.resolve(
      __dirname,
      "../client/src/pages/graph.tsx"
    );
    const source = fs.readFileSync(graphPath, "utf-8");
    expect(source).not.toMatch(/setLocation\(["']\/mcps["']\)/);
    expect(source).not.toMatch(/setLocation\(["']\/skills["']\)/);
    expect(source).not.toMatch(/setLocation\(["']\/plugins["']\)/);
    expect(source).toContain("/library?tab=mcps");
    expect(source).toContain("/library?tab=skills");
    expect(source).toContain("/library?tab=plugins");
  });

  it("markdown-edit back link uses /library?tab=editor", () => {
    const editPath = path.resolve(
      __dirname,
      "../client/src/pages/markdown-edit.tsx"
    );
    const source = fs.readFileSync(editPath, "utf-8");
    expect(source).not.toMatch(/href=["']\/markdown["']/);
    expect(source).toContain("/library?tab=editor");
  });
});
