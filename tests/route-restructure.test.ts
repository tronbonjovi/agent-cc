// tests/route-restructure.test.ts
// Tests for route restructuring: /board→/projects, /stats→/analytics, /library placeholder
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");
const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const SHORTCUTS_PATH = path.resolve(__dirname, "../client/src/hooks/use-keyboard-shortcuts.ts");

const appSource = fs.readFileSync(APP_PATH, "utf-8");

// --- /projects serves the board/workspace page ---
// Cleanup note (codebase-cleanup-task001): the dead pages/projects.tsx
// re-export stub was deleted. /projects now renders BoardPage directly
// via the lazy import in App.tsx, so the assertions below target App.tsx.

describe("/projects route serves board page", () => {
  it("App.tsx registers /projects route", () => {
    expect(appSource).toContain('path="/projects"');
  });

  it("App.tsx registers /projects/:id route for detail pages", () => {
    expect(appSource).toContain('path="/projects/:id"');
  });

  it("App.tsx renders BoardPage at /projects", () => {
    const match = appSource.match(/<Route path="\/projects">([\s\S]*?)<\/Route>/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/<BoardPage\s*\/?>/);
  });
});

// --- /board redirects to /projects ---

describe("/board redirects to /projects", () => {
  it("App.tsx has a /board route", () => {
    expect(appSource).toMatch(/path="\/board"/);
  });

  it("/board route uses Redirect to /projects", () => {
    // The /board route block should contain a redirect to /projects
    const boardRouteMatch = appSource.match(/<Route path="\/board">([\s\S]*?)<\/Route>/);
    expect(boardRouteMatch).toBeTruthy();
    expect(boardRouteMatch![1]).toMatch(/Redirect/);
    expect(boardRouteMatch![1]).toMatch(/\/projects/);
  });
});

// --- /analytics route ---

describe("/analytics route", () => {
  it("App.tsx registers /analytics route", () => {
    expect(appSource).toContain('path="/analytics"');
  });

  it("/analytics route renders the Stats component", () => {
    const analyticsRouteMatch = appSource.match(/<Route path="\/analytics">([\s\S]*?)<\/Route>/);
    expect(analyticsRouteMatch).toBeTruthy();
    expect(analyticsRouteMatch![1]).toMatch(/Stats/);
  });
});

// --- /stats redirects to /analytics ---

describe("/stats redirects to /analytics", () => {
  it("App.tsx has a /stats route", () => {
    expect(appSource).toMatch(/path="\/stats"/);
  });

  it("/stats route uses Redirect to /analytics", () => {
    const statsRouteMatch = appSource.match(/<Route path="\/stats">([\s\S]*?)<\/Route>/);
    expect(statsRouteMatch).toBeTruthy();
    expect(statsRouteMatch![1]).toMatch(/Redirect/);
    expect(statsRouteMatch![1]).toMatch(/\/analytics/);
  });
});

// --- /activity redirects to /analytics?tab=nerve-center ---
// Cleanup note (codebase-cleanup-task001): the dead pages/activity.tsx
// redirect stub was deleted; the /activity redirect is now handled
// inline in App.tsx (see the /activity Route block).

describe("/activity redirects to /analytics?tab=nerve-center", () => {
  it("App.tsx /activity route redirects to /analytics?tab=nerve-center", () => {
    const match = appSource.match(/<Route path="\/activity">([\s\S]*?)<\/Route>/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/Redirect/);
    expect(match![1]).toContain("/analytics?tab=nerve-center");
  });
});

// --- /library placeholder ---

describe("/library placeholder page", () => {
  it("library.tsx file exists", () => {
    expect(fs.existsSync(LIBRARY_PATH)).toBe(true);
  });

  it("has a Library heading", () => {
    const src = fs.readFileSync(LIBRARY_PATH, "utf-8");
    expect(src).toMatch(/Library/);
  });

  it("exports a default function", () => {
    const src = fs.readFileSync(LIBRARY_PATH, "utf-8");
    expect(src).toMatch(/export\s+default\s+function/);
  });

  it("App.tsx registers /library route", () => {
    expect(appSource).toContain('path="/library"');
  });
});

// --- Keyboard shortcuts updated ---

describe("keyboard shortcuts use new routes", () => {
  const shortcutSrc = fs.readFileSync(SHORTCUTS_PATH, "utf-8");

  it("g+g shortcut points to /analytics?tab=graph (not /stats)", () => {
    expect(shortcutSrc).toMatch(/g:.*\/analytics\?tab=graph/);
    expect(shortcutSrc).not.toMatch(/g:.*\/stats\?tab=graph/);
  });
});

// --- No broken internal links to old routes ---

describe("no broken internal links to old client routes", () => {
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

  it("no client files use setLocation or navigate to /stats (except redirect)", () => {
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      // Skip App.tsx — it has the redirect route definition
      if (relativePath === "App.tsx") continue;
      const hasStatNav = content.match(/setLocation\(["']\/stats/);
      expect(hasStatNav, `Found /stats navigation in ${relativePath}`).toBeNull();
    }
  });

  it("no client files navigate to /board as a page route (API routes /api/board are fine)", () => {
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(clientDir, file);
      // Skip App.tsx — it has the redirect route definition
      if (relativePath === "App.tsx") continue;
      // Match navigation to /board but not /api/board
      const hasLink = content.match(/(?:to|href|setLocation\()=?\s*["']\/board["']/);
      expect(hasLink, `Found /board navigation link in ${relativePath}`).toBeNull();
    }
  });
});
