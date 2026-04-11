/**
 * Dashboard Responsive Tests
 *
 * Validates that the Dashboard page uses responsive patterns:
 * - Wrapped in PageContainer for consistent responsive padding
 * - Stats/status bar wraps at narrow viewports (flex-wrap)
 * - Active sessions grid adapts: xl:4, lg:3, md:2, sm/xs:1 columns
 * - Session cards use responsive card-padding and card-gap tokens
 * - No horizontal overflow at any breakpoint
 * - Long text truncates with ellipsis
 *
 * Run: npx vitest run tests/dashboard-responsive.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DASHBOARD_PATH = path.resolve(
  __dirname,
  "../client/src/pages/dashboard.tsx",
);
const dashboardSource = fs.readFileSync(DASHBOARD_PATH, "utf-8");

describe("Dashboard responsive layout", () => {
  describe("PageContainer adoption", () => {
    it("imports PageContainer", () => {
      expect(dashboardSource).toMatch(
        /import\s+\{[^}]*PageContainer[^}]*\}\s+from/,
      );
    });

    it("renders PageContainer in JSX", () => {
      expect(dashboardSource).toMatch(/<PageContainer[\s>]/);
    });

    it("no longer uses hardcoded p-6 on the root wrapper", () => {
      // The old root div had className="p-6 space-y-6"
      // After adopting PageContainer, padding comes from the container
      expect(dashboardSource).not.toMatch(/className="p-6\s/);
    });
  });

  describe("stats/status bar responsiveness", () => {
    it("status bar uses flex-wrap for narrow viewports", () => {
      expect(dashboardSource).toContain("flex-wrap");
    });
  });

  describe("active sessions grid", () => {
    it("uses a responsive grid for session cards", () => {
      expect(dashboardSource).toContain("grid");
    });

    it("has grid-cols-1 as mobile base", () => {
      expect(dashboardSource).toContain("grid-cols-1");
    });

    it("uses single-column layout (full-width session bars)", () => {
      // Session cards are full-width bars, not multi-column grid
      expect(dashboardSource).toContain("grid-cols-1");
      expect(dashboardSource).not.toContain("md:grid-cols-2");
      expect(dashboardSource).not.toContain("lg:grid-cols-3");
      expect(dashboardSource).not.toContain("xl:grid-cols-4");
    });
  });

  describe("responsive spacing tokens", () => {
    it("uses --card-gap for session card grid gap", () => {
      expect(dashboardSource).toContain("--card-gap");
    });

    it("uses --card-padding for card content padding", () => {
      expect(dashboardSource).toContain("--card-padding");
    });
  });

  describe("overflow prevention", () => {
    it("session cards use min-w-0 to prevent flex overflow", () => {
      expect(dashboardSource).toContain("min-w-0");
    });

    it("long text uses truncate class for ellipsis", () => {
      expect(dashboardSource).toContain("truncate");
    });

    it("no fixed-width containers that could cause horizontal scroll", () => {
      // Should not have any hardcoded pixel widths on main containers
      // (small inline elements like w-48 for rename input are fine)
      expect(dashboardSource).not.toMatch(/className="[^"]*w-\[(?:5|6|7|8|9)\d{2,}px\]/);
    });

    it("outer container uses overflow-hidden or overflow-x-hidden", () => {
      expect(dashboardSource).toMatch(/overflow-hidden|overflow-x-hidden/);
    });
  });

  describe("mobile-friendly card layout", () => {
    it("card action buttons wrap or stay accessible at narrow widths", () => {
      // flex-wrap on the button row or flex-shrink-0 on buttons
      expect(dashboardSource).toContain("flex-shrink-0");
    });

    it("metadata row wraps at narrow viewports", () => {
      expect(dashboardSource).toContain("flex-wrap");
    });
  });
});
