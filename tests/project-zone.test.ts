// tests/project-zone.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PROJECT_ZONE_PATH = path.resolve(__dirname, "../client/src/components/board/project-zone.tsx");
const projectZoneSource = fs.readFileSync(PROJECT_ZONE_PATH, "utf-8");

// Import the helper for generating the count label
import { formatProjectCount } from "../client/src/components/board/project-zone";

describe("ProjectZone component source", () => {
  it("renders a ProjectCard for each project", () => {
    // Should import ProjectCard
    expect(projectZoneSource).toContain("ProjectCard");
    // Should map over projects and render cards
    expect(projectZoneSource).toMatch(/projects\.map/);
  });

  it("has horizontal scrolling container", () => {
    expect(projectZoneSource).toContain("overflow-x-auto");
    expect(projectZoneSource).toContain("overflow-y-hidden");
  });

  it("has a border-bottom separator", () => {
    expect(projectZoneSource).toContain("border-b");
  });

  it("renders a header with Projects label", () => {
    expect(projectZoneSource).toContain("Projects");
  });

  it("imports ProjectCard and ProjectCardData from ./project-card", () => {
    expect(projectZoneSource).toMatch(/from\s+["']\.\/project-card["']/);
  });

  it("passes onClick handler to ProjectCard", () => {
    expect(projectZoneSource).toContain("onClick");
  });
});

describe("formatProjectCount", () => {
  it("pluralizes correctly for multiple projects", () => {
    expect(formatProjectCount(2)).toBe("2 projects");
    expect(formatProjectCount(5)).toBe("5 projects");
    expect(formatProjectCount(100)).toBe("100 projects");
  });

  it("uses singular for exactly 1 project", () => {
    expect(formatProjectCount(1)).toBe("1 project");
  });

  it("handles 0 projects", () => {
    expect(formatProjectCount(0)).toBe("0 projects");
  });
});
