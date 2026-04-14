// tests/nav-consolidation.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");

const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
const appSource = fs.readFileSync(APP_PATH, "utf-8");

describe("Sidebar nav — flat 5-item navigation", () => {
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

  // Exactly 5 nav items expected (Dashboard, Projects, Library, Analytics, Settings)
  const navItemPaths = [...layoutSource.matchAll(/path:\s*["'](\/[^"']*)["']/g)].map(m => m[1]);

  it("has exactly 5 nav items", () => {
    expect(navItemPaths).toHaveLength(5);
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

  it("contains Analytics at /analytics", () => {
    expect(navItemPaths).toContain("/analytics");
  });

  it("contains Settings at /settings", () => {
    expect(navItemPaths).toContain("/settings");
  });

  // Removed nav items
  it("does NOT contain /sessions", () => {
    expect(navItemPaths).not.toContain("/sessions");
  });

  it("does NOT contain /activity", () => {
    expect(navItemPaths).not.toContain("/activity");
  });

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

  it("does NOT have unused Sessions lazy import", () => {
    expect(appSource).not.toMatch(/const Sessions\s*=\s*lazy/);
  });

  it("does NOT have unused ActivityPage lazy import", () => {
    expect(appSource).not.toMatch(/ActivityPage\s*=\s*lazy/);
  });
});

describe("Route redirects — /sessions and /activity", () => {
  it("/sessions route redirects to /analytics?tab=sessions", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/sessions["']/);
    // Check the redirect target
    const sessionsRouteBlock = appSource.match(
      /Route\s+path=["']\/sessions["'][^]*?<\/Route>/
    );
    expect(sessionsRouteBlock).toBeTruthy();
    expect(sessionsRouteBlock![0]).toMatch(/Redirect\s+to=["']\/analytics\?tab=sessions["']/);
  });

  it("/activity route redirects to /analytics?tab=nerve-center", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/activity["']/);
    const activityRouteBlock = appSource.match(
      /Route\s+path=["']\/activity["'][^]*?<\/Route>/
    );
    expect(activityRouteBlock).toBeTruthy();
    expect(activityRouteBlock![0]).toMatch(/Redirect\s+to=["']\/analytics\?tab=nerve-center["']/);
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
      // Cleanup note (messages-redesign-task005): message-history.tsx was
      // deleted, so it no longer needs an exemption. prompts.tsx is the
      // /prompts redirect page which legitimately mentions a path.
      if (relativePath.includes("prompts.tsx")) continue;
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

  it("no client files navigate to /sessions as a page route (API paths excluded)", () => {
    // Files that legitimately redirect /sessions are excluded
    const excludeFiles = ["sessions.tsx", "prompts.tsx"];
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      if (excludeFiles.some(f => relativePath.endsWith(f))) continue;
      // Match navigation patterns: href="/sessions", to="/sessions", setLocation("/sessions"), navigate("/sessions")
      // But exclude API paths like /api/sessions
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.includes("/api/sessions")) continue; // API paths are fine
        if (line.includes("Redirect to=") && line.includes("/analytics?tab=sessions")) continue; // redirect is fine
        const hasNavLink = line.match(/(?:href|to|setLocation|navigate)\s*(?:=\s*|[(])\s*["'`]\/sessions(?:\?|["'`])/);
        expect(hasNavLink, `Found /sessions nav link in ${relativePath}: ${line.trim()}`).toBeNull();
      }
    }
  });

  it("no client files navigate to /activity as a page route", () => {
    const excludeFiles = ["activity.tsx"];
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      if (excludeFiles.some(f => relativePath.endsWith(f))) continue;
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.includes("Redirect to=") && line.includes("/analytics?tab=nerve-center")) continue;
        const hasNavLink = line.match(/(?:href|to|setLocation|navigate)\s*(?:=\s*|[(])\s*["'`]\/activity["'`]/);
        expect(hasNavLink, `Found /activity nav link in ${relativePath}: ${line.trim()}`).toBeNull();
      }
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

  it("MessageSquare icon is not used in the top-level navItems array (Sessions removed from nav)", () => {
    // The original guardrail banned MessageSquare entirely. Task006
    // (chat-skeleton) reintroduces it as the sidebar chat-toggle icon,
    // which is not a nav route — so the real invariant is: no
    // MessageSquare reference inside the navItems array literal.
    const navItemsMatch = layoutSource.match(/const navItems[\s\S]*?\];/);
    expect(navItemsMatch).toBeTruthy();
    expect(navItemsMatch![0]).not.toMatch(/\bMessageSquare\b/);
  });
});
