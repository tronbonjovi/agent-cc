/**
 * Dashboard Layout Tests
 *
 * Validates that the dashboard layout follows the intended design:
 * - No inline Recent Activity panel (moved to popout)
 * - No keyboard shortcut button on the dashboard
 * - Active Sessions uses full width (no side panel grid)
 * - Recent Activity is accessible via a popout button
 *
 * Run: npx vitest run tests/dashboard-layout.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DASHBOARD_PATH = path.resolve(__dirname, "../client/src/pages/dashboard.tsx");
const dashboardSource = fs.readFileSync(DASHBOARD_PATH, "utf-8");

describe("Dashboard layout cleanup", () => {
  it("does not have an inline Recent Activity panel in a grid column", () => {
    // The old layout had a 3-col grid with Recent Activity in a side column
    // It should no longer have lg:col-span-2 (which implied a split layout)
    expect(dashboardSource).not.toContain("lg:col-span-2");
    // Should not have a grid-cols-3 layout for the sessions area
    expect(dashboardSource).not.toContain("lg:grid-cols-3");
  });

  it("has a Recent Activity popout button", () => {
    // There should be a button/trigger for Recent Activity
    expect(dashboardSource).toContain("Recent Activity");
    // Should use a Popover component
    expect(dashboardSource).toContain("Popover");
    expect(dashboardSource).toContain("PopoverTrigger");
    expect(dashboardSource).toContain("PopoverContent");
  });

  it("renders Recent Activity items inside the popover", () => {
    // The RecentActivityItem component should still exist
    expect(dashboardSource).toContain("RecentActivityItem");
    // Recent activity map should be inside a popover content area
    expect(dashboardSource).toContain("recentActivity.map");
  });

  it("does not have a keyboard shortcut button on the dashboard", () => {
    // The old layout had a visible keyboard shortcut hint button
    // Check for the specific hint text that was in the button
    expect(dashboardSource).not.toContain("Press <kbd");
    expect(dashboardSource).not.toContain("for all keyboard shortcuts");
    // The Keyboard icon import may still exist for other uses, but the
    // toggle-shortcuts-overlay button should not be in the dashboard body
    expect(dashboardSource).not.toMatch(/toggle-shortcuts-overlay/);
  });

  it("does not import Keyboard icon (no longer needed)", () => {
    // Keyboard icon was only used for the shortcut hint button
    expect(dashboardSource).not.toMatch(/\bKeyboard\b/);
  });

  it("Active Sessions section uses full width", () => {
    // The sessions section should not be constrained to 2/3 width
    expect(dashboardSource).toContain("Active Sessions");
    // Should have a simple space-y layout, not a multi-column grid for sessions
    expect(dashboardSource).not.toContain("lg:col-span-2");
  });
});
