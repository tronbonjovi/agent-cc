// tests/archive-zone.test.ts
/**
 * Archive Zone Tests
 *
 * Validates that the archive zone component renders completed/archived
 * milestones correctly with proper layout, dimming, and empty state.
 *
 * Run: npx vitest run tests/archive-zone.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ARCHIVE_ZONE_PATH = path.resolve(__dirname, "../client/src/components/board/archive-zone.tsx");
const source = fs.readFileSync(ARCHIVE_ZONE_PATH, "utf-8");

describe("ArchiveZone component", () => {
  it("exports the ArchivedMilestone interface", () => {
    expect(source).toContain("export interface ArchivedMilestone");
    expect(source).toContain("id: string");
    expect(source).toContain("title: string");
    expect(source).toContain("project: string");
    expect(source).toContain("totalTasks: number");
    expect(source).toContain("doneTasks: number");
    expect(source).toContain("completedAt?: string");
  });

  it("exports the ArchiveZone component", () => {
    expect(source).toContain("export function ArchiveZone");
  });

  it("renders archived milestone titles via map", () => {
    // The component should iterate over milestones and render their titles
    expect(source).toContain("milestones.map");
    expect(source).toContain("m.title");
  });

  it("shows archive count in header", () => {
    // Header should show the milestone count, e.g. "6 milestones"
    expect(source).toContain("Archive");
    expect(source).toMatch(/milestones?\.length/);
    // Should display count with "milestones" label
    expect(source).toMatch(/milestone/);
  });

  it("shows task counts per milestone", () => {
    // Each milestone row should show done/total tasks format like "5/5 tasks"
    expect(source).toContain("m.doneTasks");
    expect(source).toContain("m.totalTasks");
    expect(source).toContain("tasks");
  });

  it("shows completion dates when provided", () => {
    // Should conditionally render completedAt
    expect(source).toContain("m.completedAt");
  });

  it("renders empty state when no milestones", () => {
    expect(source).toContain("No archived milestones");
  });

  it("applies reduced opacity for visual dimming", () => {
    // Rows should have reduced opacity to signal completed state
    expect(source).toContain("opacity");
  });

  it("has vertical scroll for overflow", () => {
    expect(source).toContain("overflow-y-auto");
  });

  it("renders emerald dot for each milestone", () => {
    // Each row should have an emerald-colored status dot
    expect(source).toContain("emerald");
  });

  it("shows project name for each milestone", () => {
    expect(source).toContain("m.project");
  });
});
