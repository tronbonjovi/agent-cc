// tests/nav-redirect.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../client/src/components/layout.tsx");
const APP_PATH = path.resolve(__dirname, "../client/src/App.tsx");

const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");
const appSource = fs.readFileSync(APP_PATH, "utf-8");

describe("Nav sidebar — /projects is a nav item", () => {
  it("has a nav item pointing to /projects", () => {
    const navItemsMatch = layoutSource.match(
      /const navItems[\s\S]*?(?=\nexport|\nfunction|\ninterface)/
    );
    expect(navItemsMatch).toBeTruthy();
    const navItems = navItemsMatch![0];
    expect(navItems).toMatch(/path:\s*["']\/projects["']/);
  });
});

describe("/projects route exists", () => {
  it("has a /projects route in the router", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/projects["']/);
  });
});

describe("/projects/:id detail routes preserved", () => {
  it("has /projects/:id route in the router", () => {
    expect(appSource).toMatch(/Route\s+path=["']\/projects\/:id["']/);
  });

  it("/projects/:id route renders ProjectDetail, not a redirect", () => {
    expect(appSource).toContain("ProjectDetail");
    expect(appSource).toMatch(/ProjectDetail\s*=\s*lazy/);
  });
});
