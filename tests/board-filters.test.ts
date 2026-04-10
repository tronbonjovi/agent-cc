import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const headerPath = path.join(__dirname, "../client/src/components/board/board-header.tsx");
const headerSource = fs.readFileSync(headerPath, "utf-8");

describe("board-header — filter UI removed", () => {
  it("does not import BoardFilters", () => {
    expect(headerSource).not.toContain("BoardFilters");
    expect(headerSource).not.toContain("board-filters");
  });

  it("does not render a BoardFilters component", () => {
    expect(headerSource).not.toMatch(/<BoardFilters/);
  });

  it("displays 'Project Board' as the title", () => {
    expect(headerSource).toContain("Project Board");
    // Should NOT have the old plain "Board" title without "Project" prefix
    expect(headerSource).not.toMatch(/>Board</);
  });

  it("still shows stats summary", () => {
    expect(headerSource).toContain("stats.totalTasks");
    expect(headerSource).toContain("stats.activeAgents");
  });

  it("still shows SSE reconnecting indicator", () => {
    expect(headerSource).toContain("sseConnected");
    expect(headerSource).toContain("Reconnecting");
  });
});

describe("board-filters.tsx still exists for backend use", () => {
  const filtersPath = path.join(__dirname, "../client/src/components/board/board-filters.tsx");

  it("board-filters.tsx file still exists", () => {
    expect(fs.existsSync(filtersPath)).toBe(true);
  });
});
