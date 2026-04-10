/**
 * PageContainer Component Tests
 *
 * Validates the shared page wrapper component:
 * - Renders children within a responsive container
 * - Optional title renders as heading
 * - Optional actions render alongside title
 * - Responsive padding via CSS custom properties (--page-padding)
 * - Responsive section gap via CSS custom properties (--section-gap)
 * - Mobile-friendly: title and actions stack vertically at small viewports
 *
 * Run: npx vitest run tests/page-container.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const COMPONENT_PATH = path.resolve(
  __dirname,
  "../client/src/components/page-container.tsx",
);
const source = fs.readFileSync(COMPONENT_PATH, "utf-8");

describe("PageContainer component", () => {
  describe("exports", () => {
    it("exports PageContainer as a named export", () => {
      expect(source).toMatch(/export\s+(function|const)\s+PageContainer/);
    });
  });

  describe("props interface", () => {
    it("accepts children prop", () => {
      expect(source).toContain("children");
    });

    it("accepts optional title prop", () => {
      expect(source).toMatch(/title\??\s*:\s*string/);
    });

    it("accepts optional actions prop", () => {
      expect(source).toMatch(/actions\??\s*:\s*React\.ReactNode/);
    });

    it("accepts optional className prop", () => {
      expect(source).toMatch(/className\??\s*:\s*string/);
    });
  });

  describe("responsive padding", () => {
    it("uses --page-padding CSS custom property for padding", () => {
      expect(source).toContain("--page-padding");
    });
  });

  describe("responsive section gap", () => {
    it("uses --section-gap CSS custom property for children spacing", () => {
      expect(source).toContain("--section-gap");
    });
  });

  describe("title rendering", () => {
    it("renders title as an h1 heading element", () => {
      expect(source).toMatch(/<h1[\s>]/);
    });

    it("conditionally renders title only when provided", () => {
      // Should have a conditional check before rendering header
      expect(source).toMatch(/title\s*&&/);
    });
  });

  describe("actions rendering", () => {
    it("renders actions node when provided", () => {
      // actions should appear in JSX output
      expect(source).toMatch(/\{actions\}/);
    });
  });

  describe("children rendering", () => {
    it("renders children within the component", () => {
      expect(source).toMatch(/\{children\}/);
    });
  });

  describe("mobile stacking", () => {
    it("uses flex-wrap or responsive flex-direction for header layout", () => {
      // Header should support stacking at mobile via flex-col/flex-wrap
      // or responsive classes like sm:flex-row
      expect(source).toMatch(/flex-(col|wrap)|sm:flex-row|md:flex-row/);
    });
  });

  describe("className merging", () => {
    it("supports additional className on the container", () => {
      // The outer container should merge the className prop
      expect(source).toContain("className");
    });
  });
});
