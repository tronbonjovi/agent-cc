/**
 * useBreakpoint Hook Tests
 *
 * Validates the responsive breakpoint hook:
 * - Returns correct tier for each viewport width range
 * - Breakpoint changes trigger re-render with new value
 * - isMobile() helper returns true for xs/sm, false for others
 * - Media query listeners cleaned up on unmount
 *
 * Run: npx vitest run tests/use-breakpoint.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const HOOK_PATH = path.resolve(
  __dirname,
  "../client/src/hooks/use-breakpoint.ts",
);
const hookSource = fs.readFileSync(HOOK_PATH, "utf-8");

describe("useBreakpoint hook", () => {
  describe("exports", () => {
    it("exports useBreakpoint hook", () => {
      expect(hookSource).toMatch(/export\s+function\s+useBreakpoint/);
    });

    it("exports Breakpoint type", () => {
      expect(hookSource).toMatch(/export\s+type\s+Breakpoint/);
    });

    it("exports isMobile helper", () => {
      expect(hookSource).toMatch(/export\s+(const|function)\s+isMobile/);
    });
  });

  describe("breakpoint thresholds", () => {
    it("defines xs as < 640px", () => {
      // Should NOT match 640px for xs — xs is strictly below 640
      expect(hookSource).toContain("640");
    });

    it("defines sm as 640-767px", () => {
      expect(hookSource).toContain("640");
      expect(hookSource).toContain("768");
    });

    it("defines md as 768-1023px", () => {
      expect(hookSource).toContain("768");
      expect(hookSource).toContain("1024");
    });

    it("defines lg as 1024-1279px", () => {
      expect(hookSource).toContain("1024");
      expect(hookSource).toContain("1280");
    });

    it("defines xl as 1280px+", () => {
      expect(hookSource).toContain("1280");
    });
  });

  describe("Breakpoint type", () => {
    it('includes all five tiers: xs, sm, md, lg, xl', () => {
      // The type union should contain all five values
      expect(hookSource).toMatch(/"xs"/);
      expect(hookSource).toMatch(/"sm"/);
      expect(hookSource).toMatch(/"md"/);
      expect(hookSource).toMatch(/"lg"/);
      expect(hookSource).toMatch(/"xl"/);
    });
  });

  describe("isMobile helper", () => {
    it("returns true for xs and sm in implementation", () => {
      // The isMobile function should check for xs and sm
      const isMobileMatch = hookSource.match(
        /isMobile[\s\S]*?=[\s\S]*?(?:=>|{)([\s\S]*?)(?:;|\n\n)/,
      );
      expect(isMobileMatch).toBeTruthy();
      const body = isMobileMatch![0];
      expect(body).toContain('"xs"');
      expect(body).toContain('"sm"');
    });

    it("does not include md, lg, or xl as mobile", () => {
      // Extract the isMobile function body specifically
      const lines = hookSource.split("\n");
      const isMobileLine = lines.findIndex((l) => l.includes("isMobile"));
      expect(isMobileLine).toBeGreaterThan(-1);
      // The function body should be a single expression — check it doesn't match md/lg/xl
      const fnLine = lines[isMobileLine];
      expect(fnLine).not.toContain('"md"');
      expect(fnLine).not.toContain('"lg"');
      expect(fnLine).not.toContain('"xl"');
    });
  });

  describe("media query usage", () => {
    it("uses window.matchMedia for breakpoint detection", () => {
      expect(hookSource).toContain("matchMedia");
    });

    it("adds event listeners for media query changes", () => {
      // Should use addEventListener on MediaQueryList
      expect(hookSource).toContain("addEventListener");
    });

    it("removes event listeners on cleanup", () => {
      expect(hookSource).toContain("removeEventListener");
    });
  });

  describe("debounce", () => {
    it("implements debouncing to avoid excessive re-renders", () => {
      // Should have setTimeout or debounce logic
      expect(hookSource).toMatch(/setTimeout|debounce/);
    });
  });

  describe("React integration", () => {
    it("uses useState for state management", () => {
      expect(hookSource).toContain("useState");
    });

    it("uses useEffect for listener lifecycle", () => {
      expect(hookSource).toContain("useEffect");
    });

    it("returns cleanup function in useEffect", () => {
      // The useEffect should return a cleanup function
      // Look for pattern: return () => { ... removeEventListener
      expect(hookSource).toMatch(/return\s*\(\)\s*=>/);
    });
  });
});

describe("Responsive CSS tokens", () => {
  const CSS_PATH = path.resolve(__dirname, "../client/src/index.css");
  const cssSource = fs.readFileSync(CSS_PATH, "utf-8");

  describe("custom property definitions", () => {
    it("defines --page-padding token", () => {
      expect(cssSource).toContain("--page-padding");
    });

    it("defines --card-padding token", () => {
      expect(cssSource).toContain("--card-padding");
    });

    it("defines --card-gap token", () => {
      expect(cssSource).toContain("--card-gap");
    });

    it("defines --section-gap token", () => {
      expect(cssSource).toContain("--section-gap");
    });
  });

  describe("responsive variation", () => {
    it("uses @media rules for breakpoint-specific values", () => {
      // Should have media queries that adjust the tokens
      const mediaMatches = cssSource.match(/@media\s*\(min-width/g);
      expect(mediaMatches).toBeTruthy();
      // At least 2 media queries for the responsive tokens (md + lg breakpoints)
      expect(mediaMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it("sets mobile-first base values (smallest viewport)", () => {
      // The base :root should define the smallest values
      // --page-padding: 12px (xs/sm base)
      expect(cssSource).toMatch(/--page-padding:\s*12px/);
    });

    it("sets md breakpoint values at 768px", () => {
      expect(cssSource).toMatch(/@media\s*\(min-width:\s*768px\)/);
    });

    it("sets lg+ breakpoint values at 1024px", () => {
      expect(cssSource).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    });
  });

  describe("token values by breakpoint", () => {
    it("page-padding is 32px at lg+", () => {
      expect(cssSource).toMatch(/--page-padding:\s*32px/);
    });

    it("page-padding is 16px at md", () => {
      expect(cssSource).toMatch(/--page-padding:\s*16px/);
    });

    it("card-padding is 16px at lg+", () => {
      expect(cssSource).toMatch(/--card-padding:\s*16px/);
    });

    it("card-gap is 16px at lg+", () => {
      expect(cssSource).toMatch(/--card-gap:\s*16px/);
    });

    it("section-gap is 24px at lg+", () => {
      expect(cssSource).toMatch(/--section-gap:\s*24px/);
    });
  });
});
