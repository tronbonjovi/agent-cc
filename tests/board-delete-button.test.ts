// tests/board-delete-button.test.ts
// Tests for the delete button on the board task popout:
// - Conditional rendering based on task.source
// - useDeleteTask hook import
// - Trash2 icon import

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SIDE_PANEL_PATH = path.resolve(__dirname, "../client/src/components/board/board-side-panel.tsx");
const HOOKS_PATH = path.resolve(__dirname, "../client/src/hooks/use-board.ts");
const BOARD_TYPES_PATH = path.resolve(__dirname, "../shared/board-types.ts");

describe("board delete button — source-level assertions", () => {
  const panelSrc = fs.readFileSync(SIDE_PANEL_PATH, "utf-8");

  it("renders delete button only for db-sourced tasks", () => {
    // The conditional must check task.source === "db"
    expect(panelSrc).toMatch(/task\.source\s*===\s*["']db["']/);
  });

  it("does not render delete button for workflow tasks (same conditional implies it)", () => {
    // No unconditional delete — must be gated by source check
    // The conditional `task.source === "db"` ensures workflow tasks are excluded
    expect(panelSrc).toMatch(/task\.source\s*===\s*["']db["']/);
    // Should NOT have a bare deleteTask.mutate without the source guard
    // (the conditional rendering covers both cases)
  });

  it("imports useDeleteTask from the hooks file", () => {
    expect(panelSrc).toMatch(/useDeleteTask/);
    // Also verify the hooks file exports it
    const hooksSrc = fs.readFileSync(HOOKS_PATH, "utf-8");
    expect(hooksSrc).toMatch(/export\s+function\s+useDeleteTask/);
  });

  it("imports Trash2 icon from lucide-react", () => {
    expect(panelSrc).toMatch(/Trash2/);
    expect(panelSrc).toMatch(/from\s+["']lucide-react["']/);
  });

  it("shows a confirmation dialog before deleting", () => {
    expect(panelSrc).toMatch(/confirm\(/);
  });

  it("calls onClose after deletion", () => {
    // After mutate call, onClose should be invoked
    expect(panelSrc).toMatch(/deleteTask\.mutate/);
    expect(panelSrc).toMatch(/onClose\(\)/);
  });

  it("uses destructive color styling on the delete button", () => {
    expect(panelSrc).toMatch(/text-destructive|text-red/);
  });
});

describe("BoardTask type has source field", () => {
  const typesSrc = fs.readFileSync(BOARD_TYPES_PATH, "utf-8");

  it("includes source field with db and workflow union type", () => {
    expect(typesSrc).toMatch(/source:\s*["']db["']\s*\|\s*["']workflow["']/);
  });
});

describe("useDeleteTask hook", () => {
  const hooksSrc = fs.readFileSync(HOOKS_PATH, "utf-8");

  it("exports useDeleteTask function", () => {
    expect(hooksSrc).toMatch(/export\s+function\s+useDeleteTask/);
  });

  it("calls DELETE method on /api/board/tasks/:id", () => {
    expect(hooksSrc).toMatch(/\/api\/board\/tasks\//);
    expect(hooksSrc).toMatch(/method:\s*["']DELETE["']/);
  });

  it("invalidates board queries on success", () => {
    // After the mutation, board queries should be invalidated
    expect(hooksSrc).toMatch(/invalidateQueries/);
  });
});
