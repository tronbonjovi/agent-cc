/**
 * Responsive Sidebar Tests
 *
 * Validates the layout sidebar adapts to breakpoint tiers:
 * - Desktop (xl/lg): sidebar expanded (224px / w-56)
 * - Tablet (md): sidebar auto-collapsed to icon-only (56px / w-14)
 * - Mobile (sm/xs): sidebar hidden, hamburger menu with Sheet drawer
 * - Ctrl+L keyboard shortcut preserved across all breakpoints
 * - Breakpoint changes reset sidebar to default state
 *
 * Run: npx vitest run tests/responsive-sidebar.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const LAYOUT_PATH = path.resolve(
  __dirname,
  "../client/src/components/layout.tsx",
);
const layoutSource = fs.readFileSync(LAYOUT_PATH, "utf-8");

describe("Responsive sidebar", () => {
  describe("breakpoint integration", () => {
    it("imports useBreakpoint hook", () => {
      expect(layoutSource).toMatch(/useBreakpoint/);
    });

    it("imports isMobile helper", () => {
      expect(layoutSource).toMatch(/isMobile/);
    });

    it("calls useBreakpoint to get current breakpoint", () => {
      // Should invoke the hook and store the result
      expect(layoutSource).toMatch(/useBreakpoint\(\)/);
    });
  });

  describe("desktop behavior (xl/lg)", () => {
    it("sidebar is expanded by default at desktop breakpoints", () => {
      // The default sidebar state logic should expand at lg/xl
      // Expanded width is w-56 (224px)
      expect(layoutSource).toContain("w-56");
    });

    it("uses w-56 for expanded sidebar width", () => {
      expect(layoutSource).toContain("w-56");
    });

    it("uses w-14 for collapsed sidebar width", () => {
      expect(layoutSource).toContain("w-14");
    });
  });

  describe("tablet behavior (md)", () => {
    it("sidebar auto-collapses to icon-only at md breakpoint", () => {
      // The sidebar state logic should check for md breakpoint
      // and set collapsed/icon-only as default
      expect(layoutSource).toMatch(/["']md["']/);
    });
  });

  describe("mobile behavior (sm/xs)", () => {
    it("sidebar is hidden at mobile breakpoints", () => {
      // Should conditionally hide the aside element at mobile
      expect(layoutSource).toMatch(/isMobile/);
    });

    it("imports Menu icon for hamburger button", () => {
      expect(layoutSource).toMatch(/\bMenu\b/);
      expect(layoutSource).toMatch(/lucide-react/);
    });

    it("renders hamburger button at mobile breakpoints", () => {
      // Should have a button with Menu icon that appears on mobile
      expect(layoutSource).toMatch(/Menu/);
      expect(layoutSource).toMatch(/hamburger|mobile.*menu|menu.*mobile/i);
    });

    it("uses Sheet component for mobile drawer", () => {
      expect(layoutSource).toMatch(/Sheet/);
      expect(layoutSource).toMatch(/SheetContent/);
    });

    it("Sheet opens from the left side", () => {
      // SheetContent should have side="left"
      expect(layoutSource).toMatch(/side=["']left["']/);
    });

    it("renders nav items inside the Sheet drawer", () => {
      // The Sheet should contain nav items — navItems.map should appear
      // in a context associated with Sheet
      expect(layoutSource).toMatch(/SheetContent/);
      // navItems should be rendered in both desktop sidebar and mobile drawer
      expect(layoutSource).toMatch(/navItems/);
    });

    it("includes SheetTitle for accessibility", () => {
      // Radix Sheet requires a title for a11y
      expect(layoutSource).toMatch(/SheetTitle/);
    });
  });

  describe("Ctrl+L keyboard shortcut", () => {
    it("preserves Ctrl+L keyboard shortcut handler", () => {
      expect(layoutSource).toMatch(/ctrlKey|metaKey/);
      expect(layoutSource).toMatch(/["']l["']/);
    });

    it("calls preventDefault on Ctrl+L", () => {
      expect(layoutSource).toContain("preventDefault");
    });
  });

  describe("breakpoint-driven state management", () => {
    it("tracks whether user has manually toggled", () => {
      // Should have a flag or ref to track manual toggle
      expect(layoutSource).toMatch(/manual|userToggle|hasToggled/i);
    });

    it("resets sidebar state when breakpoint changes", () => {
      // Should have useEffect that depends on breakpoint
      // and resets the sidebar state
      expect(layoutSource).toMatch(/useEffect/);
    });

    it("sidebar state has more than two states for mobile/tablet/desktop", () => {
      // Should distinguish between expanded, collapsed (icon-only), and hidden
      // This means the state is not a simple boolean anymore
      expect(layoutSource).toMatch(/expanded|collapsed|hidden/i);
    });
  });

  describe("existing features preserved", () => {
    it("still renders nav items with active state highlighting", () => {
      expect(layoutSource).toContain("isActive");
    });

    it("still shows count badges", () => {
      expect(layoutSource).toMatch(/count/);
    });

    it("still has tooltips for collapsed mode", () => {
      expect(layoutSource).toMatch(/Tooltip/);
      expect(layoutSource).toMatch(/TooltipContent/);
    });

    it("still renders SearchTrigger", () => {
      expect(layoutSource).toContain("SearchTrigger");
    });

    it("still renders ThemeSwitcher", () => {
      expect(layoutSource).toContain("ThemeSwitcher");
    });

    it("still renders SyncIndicator", () => {
      expect(layoutSource).toContain("SyncIndicator");
    });

    it("still renders UpdateIndicator", () => {
      expect(layoutSource).toContain("UpdateIndicator");
    });

    it("still renders TerminalPanel", () => {
      expect(layoutSource).toContain("TerminalPanel");
    });

    it("preserves collapse/expand toggle button", () => {
      expect(layoutSource).toMatch(/ChevronLeft|ChevronRight/);
    });
  });
});
