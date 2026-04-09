// tests/nav-consolidation.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");

const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
const appSource = fs.readFileSync(APP_PATH, "utf-8");

describe("Sidebar nav — Tools section items", () => {
  // Extract the navSections array from the layout source
  const navSectionsMatch = layoutSource.match(
    /const navSections[\s\S]*?(?=\nexport|\nfunction|\ninterface)/
  );

  it("has navSections defined", () => {
    expect(navSectionsMatch).toBeTruthy();
  });

  const navSections = navSectionsMatch![0];

  it("contains Sessions in Tools section", () => {
    expect(navSections).toMatch(/path:\s*["']\/sessions["']/);
  });

  it("contains Agents in Tools section", () => {
    expect(navSections).toMatch(/path:\s*["']\/agents["']/);
  });

  it("contains Analytics in Tools section", () => {
    expect(navSections).toMatch(/path:\s*["']\/stats["']/);
  });

  it("contains Settings in Tools section", () => {
    expect(navSections).toMatch(/path:\s*["']\/settings["']/);
  });

  it("does NOT contain Messages in sidebar", () => {
    expect(navSections).not.toMatch(/path:\s*["']\/messages["']/);
  });

  it("does NOT contain Graph in sidebar", () => {
    expect(navSections).not.toMatch(/path:\s*["']\/graph["']/);
  });

  it("does NOT contain Prompts in sidebar", () => {
    expect(navSections).not.toMatch(/path:\s*["']\/prompts["']/);
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
  // Scan all .tsx/.ts files in client/src for old route references
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
      // Allow redirect files that point away from /messages, but no links TO /messages
      const relativePath = path.relative(clientDir, file);
      // Skip checking redirect stubs — they may still exist as catch-all redirects
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
  it("does not import MessageSquareText if unused", () => {
    // If MessageSquareText is not used in the nav items, it shouldn't be imported
    const navSectionsMatch = layoutSource.match(
      /const navSections[\s\S]*?(?=\nexport|\nfunction|\ninterface)/
    );
    const navSections = navSectionsMatch![0];
    if (!navSections.includes("MessageSquareText")) {
      expect(layoutSource).not.toMatch(/\bMessageSquareText\b/);
    }
  });

  it("does not import GitBranch if unused", () => {
    const navSectionsMatch = layoutSource.match(
      /const navSections[\s\S]*?(?=\nexport|\nfunction|\ninterface)/
    );
    const navSections = navSectionsMatch![0];
    if (!navSections.includes("GitBranch")) {
      expect(layoutSource).not.toMatch(/\bGitBranch\b/);
    }
  });
});
