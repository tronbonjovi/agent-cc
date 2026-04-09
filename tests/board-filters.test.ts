import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const filtersPath = path.join(__dirname, "../client/src/components/board/board-filters.tsx");
const filtersSource = fs.readFileSync(filtersPath, "utf-8");

const headerPath = path.join(__dirname, "../client/src/components/board/board-header.tsx");
const headerSource = fs.readFileSync(headerPath, "utf-8");

describe("board-filters", () => {
  it("does not contain a Project dropdown", () => {
    // No "Project" button text in the filters
    expect(filtersSource).not.toMatch(/>\s*Project\s/);
    expect(filtersSource).not.toContain("toggleProject");
  });

  it("does not accept projects prop", () => {
    expect(filtersSource).not.toMatch(/projects:\s*ProjectMeta/);
  });

  it("still contains Priority filter", () => {
    expect(filtersSource).toContain("Priority");
    expect(filtersSource).toContain("togglePriority");
  });

  it("still contains Flagged toggle", () => {
    expect(filtersSource).toContain("Flagged");
    expect(filtersSource).toContain("filter.flagged");
  });

  it("still has a clear button", () => {
    expect(filtersSource).toContain("clearFilters");
    expect(filtersSource).toContain("Clear");
  });
});

describe("board-header", () => {
  it("does not pass projects prop to BoardFilters", () => {
    // The BoardFilters call should not have projects=
    const filtersCallMatch = headerSource.match(/<BoardFilters[\s\S]*?\/>/);
    expect(filtersCallMatch).toBeTruthy();
    expect(filtersCallMatch![0]).not.toContain("projects=");
  });
});
