// tests/nav-consolidation.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");

const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
const appSource = fs.readFileSync(APP_PATH, "utf-8");

describe("Sidebar nav — flat 6-item navigation", () => {
  it("uses a flat navItems array, not sectioned navSections", () => {
    expect(layoutSource).toMatch(/const navItems/);
    expect(layoutSource).not.toMatch(/const navSections/);
  });

  it("does not have NavSection interface", () => {
    expect(layoutSource).not.toMatch(/interface NavSection/);
  });

  it("does not render section headers", () => {
    expect(layoutSource).not.toMatch(/section-header/);
  });

  // Exactly 6 nav items expected
  const navItemPaths = [...layoutSource.matchAll(/path:\s*["'](\/[^"']*)["']/g)].map(m => m[1]);

  it("has exactly 6 nav items", () => {
    expect(navItemPaths).toHaveLength(6);
  });

  it("contains Dashboard at /", () => {
    expect(navItemPaths).toContain("/");
  });

  it("contains Projects at /projects", () => {
    expect(navItemPaths).toContain("/projects");
  });

  it("contains Library at /library", () => {
    expect(navItemPaths).toContain("/library");
  });

  it("contains Sessions at /sessions", () => {
    expect(navItemPaths).toContain("/sessions");
  });

  it("contains Analytics at /analytics", () => {
    expect(navItemPaths).toContain("/analytics");
  });

  it("contains Settings at /settings", () => {
    expect(navItemPaths).toContain("/settings");
  });

  // Removed nav items
  it("does NOT contain /board", () => {
    expect(navItemPaths).not.toContain("/board");
  });

  it("does NOT contain /mcps", () => {
    expect(navItemPaths).not.toContain("/mcps");
  });

  it("does NOT contain /skills", () => {
    expect(navItemPaths).not.toContain("/skills");
  });

  it("does NOT contain /plugins", () => {
    expect(navItemPaths).not.toContain("/plugins");
  });

  it("does NOT contain /markdown", () => {
    expect(navItemPaths).not.toContain("/markdown");
  });

  it("does NOT contain /agents", () => {
    expect(navItemPaths).not.toContain("/agents");
  });

  it("does NOT contain /stats", () => {
    expect(navItemPaths).not.toContain("/stats");
  });

  it("does NOT contain /messages", () => {
    expect(navItemPaths).not.toContain("/messages");
  });

  it("does NOT contain /graph", () => {
    expect(navItemPaths).not.toContain("/graph");
  });

  it("does NOT contain /prompts", () => {
    expect(navItemPaths).not.toContain("/prompts");
  });
});

describe("Routes — removed pages", () => {
  it("does NOT have a /messages route", () => {
    expect(appSource).not.toMatch(/Route\s+path=["']\/messages["']/);
  });

  it("does NOT have a /graph route", () => {
    expect(appSource).not.toMatch(/Route\s+path=["']\/graph["']/);
  });

  it("does NOT have a /prompts route", () => {
    expect(appSource).not.toMatch(/Route\s+path=["']\/prompts["']/);
  });

  it("does NOT have unused MessageHistory lazy import", () => {
    expect(appSource).not.toMatch(/MessageHistory\s*=\s*lazy/);
  });

  it("does NOT have unused Prompts lazy import", () => {
    expect(appSource).not.toMatch(/const Prompts\s*=\s*lazy/);
  });
});

describe("No broken links to old routes", () => {
  const clientDir = path.resolve(__dirname, "../client/src");

  function getAllFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllFiles(fullPath));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const clientFiles = getAllFiles(clientDir);

  it("no client files link to /messages", () => {
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      if (relativePath.includes("prompts.tsx") || relativePath.includes("message-history.tsx")) continue;
      const hasLink = content.match(/["']\/messages["']/);
      expect(hasLink, `Found /messages reference in ${relativePath}`).toBeNull();
    }
  });

  it("no client files link to /graph", () => {
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      const hasLink = content.match(/["']\/graph["']/);
      expect(hasLink, `Found /graph reference in ${relativePath}`).toBeNull();
    }
  });
});

describe("Layout — unused icon imports cleaned up", () => {
  it("does not import Server icon (removed from nav)", () => {
    // Server was only used for MCP Servers nav item, now removed
    expect(layoutSource).not.toMatch(/\bServer\b/);
  });

  it("does not import Wand2 icon (removed from nav)", () => {
    expect(layoutSource).not.toMatch(/\bWand2\b/);
  });

  it("does not import Puzzle icon (removed from nav)", () => {
    expect(layoutSource).not.toMatch(/\bPuzzle\b/);
  });

  it("does not import FileText icon (removed from nav)", () => {
    expect(layoutSource).not.toMatch(/\bFileText\b/);
  });

  it("does not import Bot icon (removed from nav)", () => {
    expect(layoutSource).not.toMatch(/\bBot\b/);
  });

  it("does not import unused Settings icon", () => {
    // Settings icon was imported but SlidersHorizontal is used instead
    // Check the import block specifically for the Settings icon import
    const importBlock = layoutSource.match(/import\s*\{[\s\S]*?\}\s*from\s*["']lucide-react["']/);
    expect(importBlock).toBeTruthy();
    expect(importBlock![0]).not.toMatch(/\bSettings\b/);
  });

  it("imports BookOpen for Library", () => {
    expect(layoutSource).toMatch(/\bBookOpen\b/);
  });
});
