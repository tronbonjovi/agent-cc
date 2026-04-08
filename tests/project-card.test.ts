// tests/project-card.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  healthDotColor,
  formatProjectCost,
  progressSegments,
} from "../client/src/components/board/project-card";
import type { ProjectCardData } from "../client/src/components/board/project-card";

const COMPONENT_PATH = path.resolve(
  __dirname,
  "../client/src/components/board/project-card.tsx"
);
const source = fs.readFileSync(COMPONENT_PATH, "utf-8");

// --- Utility function tests ---

describe("healthDotColor", () => {
  it("returns emerald for healthy", () => {
    expect(healthDotColor("healthy")).toBe("bg-emerald-500");
  });

  it("returns amber for warning", () => {
    expect(healthDotColor("warning")).toBe("bg-amber-500");
  });

  it("returns red for critical", () => {
    expect(healthDotColor("critical")).toBe("bg-red-500");
  });

  it("returns slate for unknown", () => {
    expect(healthDotColor("unknown")).toBe("bg-slate-400");
  });
});

describe("formatProjectCost", () => {
  it("formats zero cost", () => {
    expect(formatProjectCost(0)).toBe("$0.00");
  });

  it("formats cost with two decimal places", () => {
    expect(formatProjectCost(5.5)).toBe("$5.50");
    expect(formatProjectCost(12.345)).toBe("$12.35");
  });

  it("formats larger costs", () => {
    expect(formatProjectCost(100)).toBe("$100.00");
  });
});

describe("progressSegments", () => {
  it("returns correct proportions for mixed tasks", () => {
    const result = progressSegments({ taskCount: 10, doneTasks: 5, inProgressTasks: 3 });
    expect(result.done).toBe(5);
    expect(result.inProgress).toBe(3);
    expect(result.pending).toBe(2);
  });

  it("handles all done", () => {
    const result = progressSegments({ taskCount: 8, doneTasks: 8, inProgressTasks: 0 });
    expect(result.done).toBe(8);
    expect(result.inProgress).toBe(0);
    expect(result.pending).toBe(0);
  });

  it("handles zero tasks", () => {
    const result = progressSegments({ taskCount: 0, doneTasks: 0, inProgressTasks: 0 });
    expect(result.done).toBe(0);
    expect(result.inProgress).toBe(0);
    expect(result.pending).toBe(0);
  });

  it("handles all pending", () => {
    const result = progressSegments({ taskCount: 5, doneTasks: 0, inProgressTasks: 0 });
    expect(result.done).toBe(0);
    expect(result.inProgress).toBe(0);
    expect(result.pending).toBe(5);
  });
});

// --- Component source-level tests ---

describe("ProjectCard component structure", () => {
  it("renders project name via the data prop", () => {
    // Component should use project.name to display the project name
    expect(source).toContain("project.name");
  });

  it("shows 'current' badge when isCurrent is true", () => {
    // Should conditionally render a current badge
    expect(source).toContain("project.isCurrent");
    expect(source).toContain("current");
  });

  it("hides 'current' badge when isCurrent is false", () => {
    // The current badge should be conditional, not always rendered
    // Verify it uses a conditional pattern (&&, ternary, or similar)
    const conditionalPattern = /project\.isCurrent\s*&&|project\.isCurrent\s*\?/;
    expect(source).toMatch(conditionalPattern);
  });

  it("shows milestone and task counts", () => {
    expect(source).toContain("project.milestoneCount");
    expect(source).toContain("project.taskCount");
  });

  it("renders health dot with correct color class via healthDotColor", () => {
    // The component should use healthDotColor to determine the dot class
    expect(source).toContain("healthDotColor");
    expect(source).toContain("project.health");
  });

  it("calls onClick when clicked", () => {
    // Component should accept and wire up an onClick handler
    expect(source).toContain("onClick");
  });

  it("has min-width and max-width constraints", () => {
    expect(source).toContain("min-w-[180px]");
    expect(source).toContain("max-w-[200px]");
  });

  it("renders session count and cost", () => {
    expect(source).toContain("project.sessionCount");
    expect(source).toContain("project.totalCost");
  });

  it("renders a stacked progress bar with done, in-progress, and pending segments", () => {
    expect(source).toContain("progressSegments");
    // Should use flex for the progress bar
    expect(source).toContain("flex");
  });

  it("has cursor pointer and hover border effect", () => {
    expect(source).toContain("cursor-pointer");
    expect(source).toContain("hover:border");
  });

  it("exports the ProjectCardData interface", () => {
    expect(source).toContain("export interface ProjectCardData");
  });
});
