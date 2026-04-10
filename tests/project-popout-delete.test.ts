// tests/project-popout-delete.test.ts
// Tests for the project delete button on the project popout:
// - Conditional rendering based on isCurrent
// - useDeleteProject hook wiring

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const POPOUT_PATH = path.resolve(__dirname, "../client/src/components/board/project-popout.tsx");
const HOOKS_PATH = path.resolve(__dirname, "../client/src/hooks/use-projects.ts");

describe("project popout delete button — source-level assertions", () => {
  const popoutSrc = fs.readFileSync(POPOUT_PATH, "utf-8");

  it("delete button is always visible (no isCurrent guard)", () => {
    // isCurrent logic was removed — all projects are deletable
    expect(popoutSrc).not.toContain("isCurrent");
    // Delete/Remove button should be unconditionally rendered
    expect(popoutSrc).toContain("Remove");
  });

  it("imports useDeleteProject from hooks", () => {
    expect(popoutSrc).toMatch(/useDeleteProject/);
    const hooksSrc = fs.readFileSync(HOOKS_PATH, "utf-8");
    expect(hooksSrc).toMatch(/export\s+function\s+useDeleteProject/);
  });

  it("imports Trash2 icon from lucide-react", () => {
    expect(popoutSrc).toMatch(/Trash2/);
    expect(popoutSrc).toMatch(/from\s+["']lucide-react["']/);
  });

  it("shows confirmation dialog before deleting", () => {
    expect(popoutSrc).toMatch(/window\.confirm\(/);
    expect(popoutSrc).toMatch(/does not delete files on disk/i);
  });

  it("closes popout on successful deletion", () => {
    expect(popoutSrc).toMatch(/onSuccess:\s*onClose/);
  });

  it("invalidates projects and board queries on deletion", () => {
    const hooksSrc = fs.readFileSync(HOOKS_PATH, "utf-8");
    expect(hooksSrc).toMatch(/\/api\/projects/);
    expect(hooksSrc).toMatch(/\/api\/board/);
  });
});
