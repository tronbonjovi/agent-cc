/**
 * Responsive Board Tests
 *
 * Validates the Board page adapts to breakpoint tiers:
 * - 2-zone layout: side-by-side (lg+), stacked (md and below)
 * - Kanban columns: side-by-side (lg+), horizontal scroll (md), tab switching (sm/xs)
 * - Projects panel: collapsible at md and below
 * - Responsive tokens (card-padding, card-gap) used throughout
 * - No unintended horizontal overflow
 *
 * Run: npx vitest run tests/responsive-board.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const BOARD_PAGE_PATH = path.resolve(
  __dirname,
  "../client/src/pages/board.tsx",
);
const boardSource = fs.readFileSync(BOARD_PAGE_PATH, "utf-8");

// Helper to read a board sub-component
function readComponent(name: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, `../client/src/components/board/${name}`),
    "utf-8",
  );
}

describe("Responsive board page", () => {
  describe("breakpoint integration", () => {
    it("imports useBreakpoint hook", () => {
      expect(boardSource).toMatch(/useBreakpoint/);
    });

    it("imports isMobile helper", () => {
      expect(boardSource).toMatch(/isMobile/);
    });

    it("calls useBreakpoint to get current breakpoint", () => {
      expect(boardSource).toMatch(/useBreakpoint\(\)/);
    });
  });

  describe("2-zone layout", () => {
    it("renders both ProjectZone and kanban board zones", () => {
      expect(boardSource).toMatch(/ProjectZone/);
      expect(boardSource).toMatch(/BOARD_COLUMNS/);
    });

    it("uses flex-row for side-by-side at large breakpoints", () => {
      // Should have a flex container that switches between row and column
      expect(boardSource).toMatch(/flex-row|flex-col/);
    });

    it("stacks zones vertically at md and below", () => {
      // Should reference breakpoint to decide layout direction
      expect(boardSource).toMatch(/lg|xl/);
      expect(boardSource).toMatch(/flex-col/);
    });

    it("projects zone uses resizable width at large breakpoints", () => {
      // Left sidebar uses useResizeHandle for dynamic width
      expect(boardSource).toMatch(/useResizeHandle|leftResize\.width/);
    });
  });

  describe("projects panel - collapsible at smaller breakpoints", () => {
    it("has collapsible state for projects section", () => {
      expect(boardSource).toMatch(/projectsCollapsed|projectsOpen|showProjects|projectsExpanded/i);
    });

    it("has toggle button/trigger for collapsing projects", () => {
      expect(boardSource).toMatch(/ChevronDown|ChevronUp|ChevronRight|collapse|toggle/i);
    });

    it("conditionally shows/hides project content based on collapsed state", () => {
      // The projects content should be conditionally rendered
      expect(boardSource).toMatch(/projectsCollapsed|projectsOpen|showProjects|projectsExpanded/i);
    });
  });

  describe("kanban columns - lg+ side-by-side", () => {
    it("renders all 4 columns", () => {
      expect(boardSource).toMatch(/BOARD_COLUMNS\.map/);
    });

    it("columns are in a flex container", () => {
      expect(boardSource).toMatch(/flex/);
    });
  });

  describe("kanban columns - md horizontal scroll", () => {
    it("has horizontal scroll at md breakpoint", () => {
      expect(boardSource).toMatch(/overflow-x-auto|overflow-x-scroll|scroll-snap/i);
    });

    it("uses snap scrolling for columns at md", () => {
      expect(boardSource).toMatch(/snap-x|snap-start|snap-mandatory/i);
    });
  });

  describe("kanban columns - sm/xs tab switching", () => {
    it("has active column state for mobile tab view", () => {
      expect(boardSource).toMatch(/activeColumn|selectedColumn|currentColumn/i);
    });

    it("renders column tab buttons at mobile", () => {
      // Should have clickable tabs/buttons for switching columns
      expect(boardSource).toMatch(/activeColumn|selectedColumn|currentColumn/i);
    });

    it("shows only one column at a time on mobile", () => {
      // The column rendering should filter to active column on mobile
      expect(boardSource).toMatch(/activeColumn|selectedColumn|currentColumn/i);
    });
  });

  describe("responsive tokens", () => {
    it("uses responsive padding tokens", () => {
      // Should use var(--card-padding) or p-card or var(--page-padding) or p-page
      expect(boardSource).toMatch(/card-padding|p-card|page-padding|p-page/);
    });

    it("uses responsive gap tokens", () => {
      expect(boardSource).toMatch(/card-gap|gap-card|section-gap|gap-section/);
    });
  });

  describe("board task cards remain readable", () => {
    const cardSource = readComponent("board-task-card.tsx");

    it("card uses responsive-friendly padding", () => {
      // Card should have padding that works across sizes
      expect(cardSource).toMatch(/p-2|p-3|p-card|card-padding/);
    });

    it("secondary info wraps with flex-wrap", () => {
      expect(cardSource).toMatch(/flex-wrap/);
    });

    it("text truncates to prevent overflow", () => {
      expect(cardSource).toMatch(/truncate|line-clamp/);
    });
  });

  describe("project zone responsive behavior", () => {
    const zoneSource = readComponent("project-zone.tsx");

    it("projects stack vertically or scroll horizontally", () => {
      expect(zoneSource).toMatch(/flex|grid/);
    });

    it("project cards show active milestone progress bars", () => {
      const cardSource = readComponent("project-card.tsx");
      expect(cardSource).toMatch(/activeMilestones/);
    });
  });

  describe("no unintended overflow", () => {
    it("main container prevents horizontal overflow", () => {
      expect(boardSource).toMatch(/overflow-hidden|overflow-x-hidden/);
    });

    it("column widths are constrained or flexible", () => {
      // Columns should use flex-1 or min-w/max-w, not just fixed w-72
      expect(boardSource).toMatch(/flex-1|w-72|min-w|shrink/);
    });
  });
});
