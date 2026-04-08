// tests/project-popout.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { ProjectCardData } from "../client/src/components/board/project-popout";

function makeProject(overrides?: Partial<ProjectCardData>): ProjectCardData {
  return {
    id: "proj-1",
    name: "My Project",
    description: "A test project for the popout component",
    health: "healthy",
    sessionCount: 3,
    totalCost: 12.5,
    milestoneCount: 2,
    taskCount: 8,
    doneTasks: 5,
    inProgressTasks: 2,
    isCurrent: false,
    ...overrides,
  };
}

describe("ProjectCardData interface", () => {
  it("has all required fields", () => {
    const project = makeProject();
    expect(project.id).toBe("proj-1");
    expect(project.name).toBe("My Project");
    expect(project.description).toBe("A test project for the popout component");
    expect(project.health).toBe("healthy");
    expect(project.sessionCount).toBe(3);
    expect(project.totalCost).toBe(12.5);
    expect(project.milestoneCount).toBe(2);
    expect(project.taskCount).toBe(8);
    expect(project.doneTasks).toBe(5);
    expect(project.inProgressTasks).toBe(2);
    expect(project.isCurrent).toBe(false);
  });

  it("accepts all valid health values", () => {
    const healthValues: ProjectCardData["health"][] = ["healthy", "warning", "critical", "unknown"];
    for (const health of healthValues) {
      const project = makeProject({ health });
      expect(project.health).toBe(health);
    }
  });
});

describe("computeProjectPopoutPosition", () => {
  // Import the function dynamically to test positioning logic
  let computeProjectPopoutPosition: typeof import("../client/src/components/board/project-popout").computeProjectPopoutPosition;

  // Constants from the module
  const POPOUT_WIDTH = 400;
  const POPOUT_MAX_HEIGHT = 480;
  const VIEWPORT_PADDING = 12;

  beforeAll(async () => {
    const mod = await import("../client/src/components/board/project-popout");
    computeProjectPopoutPosition = mod.computeProjectPopoutPosition;
  });

  it("positions popout to the right when there is space", () => {
    const anchorRect = { top: 200, left: 50, width: 250, height: 120 };
    const viewport = { width: 1200, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    // Should appear to the right of the anchor
    expect(pos.left).toBeGreaterThanOrEqual(anchorRect.left + anchorRect.width);
    expect(pos.left).toBeLessThanOrEqual(viewport.width - POPOUT_WIDTH);
  });

  it("positions popout to the left when anchor is on the right side", () => {
    const anchorRect = { top: 200, left: 850, width: 250, height: 120 };
    const viewport = { width: 1200, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    // Should appear to the left of the anchor
    expect(pos.left).toBeLessThan(anchorRect.left);
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });

  it("keeps popout within viewport vertically", () => {
    const anchorRect = { top: 700, left: 50, width: 250, height: 120 };
    const viewport = { width: 1200, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(pos.top + POPOUT_MAX_HEIGHT).toBeLessThanOrEqual(viewport.height);
  });

  it("aligns top of popout with anchor when there is room", () => {
    const anchorRect = { top: 100, left: 50, width: 250, height: 120 };
    const viewport = { width: 1200, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    expect(pos.top).toBe(anchorRect.top);
  });

  it("centers horizontally when no space on either side", () => {
    // Very narrow viewport
    const anchorRect = { top: 100, left: 100, width: 250, height: 120 };
    const viewport = { width: 450, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    // Should be centered or at minimum padding
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });

  it("returns valid numeric position for any input", () => {
    const anchorRect = { top: 300, left: 400, width: 200, height: 100 };
    const viewport = { width: 1200, height: 800 };
    const pos = computeProjectPopoutPosition(anchorRect, viewport);
    expect(typeof pos.left).toBe("number");
    expect(typeof pos.top).toBe("number");
    expect(pos.left).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
    expect(pos.top).toBeGreaterThanOrEqual(VIEWPORT_PADDING);
  });
});

describe("getHealthColor", () => {
  let getHealthColor: typeof import("../client/src/components/board/project-popout").getHealthColor;

  beforeAll(async () => {
    const mod = await import("../client/src/components/board/project-popout");
    getHealthColor = mod.getHealthColor;
  });

  it("returns green for healthy", () => {
    expect(getHealthColor("healthy")).toContain("green");
  });

  it("returns yellow/amber for warning", () => {
    const color = getHealthColor("warning");
    expect(color).toMatch(/yellow|amber/);
  });

  it("returns red for critical", () => {
    expect(getHealthColor("critical")).toContain("red");
  });

  it("returns gray for unknown", () => {
    expect(getHealthColor("unknown")).toContain("gray");
  });
});

describe("formatProjectCost", () => {
  let formatProjectCost: typeof import("../client/src/components/board/project-popout").formatProjectCost;

  beforeAll(async () => {
    const mod = await import("../client/src/components/board/project-popout");
    formatProjectCost = mod.formatProjectCost;
  });

  it("formats cost with dollar sign and two decimals", () => {
    expect(formatProjectCost(12.5)).toBe("$12.50");
  });

  it("formats zero cost", () => {
    expect(formatProjectCost(0)).toBe("$0.00");
  });

  it("formats large cost", () => {
    expect(formatProjectCost(1234.56)).toBe("$1234.56");
  });
});
