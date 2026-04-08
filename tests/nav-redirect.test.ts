// tests/nav-redirect.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");
const PROJECTS_PAGE_PATH = path.resolve(__dirname, "../client/src/pages/projects.tsx");

const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
const appSource = fs.readFileSync(APP_PATH, "utf-8");
const projectsPageSource = fs.readFileSync(PROJECTS_PAGE_PATH, "utf-8");

describe("Nav sidebar — /projects listing removed", () => {
  it("does not have a nav item pointing to /projects", () => {
    // The navSections array should not contain a path: "/projects" entry
    // (it should either be removed entirely or point to /board)
    const navSectionsMatch = layoutSource.match(
      /const navSections[\s\S]*?(?=\nexport|\nfunction|\ninterface)/
    );
    expect(navSectionsMatch).toBeTruthy();
    const navSections = navSectionsMatch![0];
    // Should NOT have path: "/projects" in the nav items
    expect(navSections).not.toMatch(/path:\s*["']\/projects["']/);
  });
});

describe("/projects route redirects to /board", () => {
  it("has a /projects route in the router", () => {
    // The route definition for /projects should still exist (for the redirect)
    expect(appSource).toMatch(/Route\s+path=["']\/projects["']/);
  });

  it("/projects page component uses Redirect to /board", () => {
    // The projects page should now redirect to /board
    expect(projectsPageSource).toContain("Redirect");
    expect(projectsPageSource).toMatch(/Redirect\s+to=["']\/board["']/);
  });
});

describe("/projects/:id detail routes preserved", () => {
  it("has /projects/:id route in the router", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/projects\/:id["']/);
  });

  it("/projects/:id route renders ProjectDetail, not a redirect", () => {
    // Find the route block for /projects/:id and verify it uses ProjectDetail
    expect(appSource).toContain("ProjectDetail");
    // The ProjectDetail lazy import should still exist
    expect(appSource).toMatch(/ProjectDetail\s*=\s*lazy/);
  });
});
