// tests/board-side-panel.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SIDE_PANEL_PATH = path.resolve(__dirname, "../client/src/components/board/board-side-panel.tsx");

describe("board side panel — Open Full Detail removed", () => {
  const panelSrc = fs.readFileSync(SIDE_PANEL_PATH, "utf-8");

  it("does not contain a link to /tasks/ route", () => {
    expect(panelSrc).not.toMatch(/\/tasks\/\$\{task\.project\}/);
    expect(panelSrc).not.toMatch(/Open Full Detail/);
  });

  it("does not contain a href to /tasks/", () => {
    expect(panelSrc).not.toMatch(/href=\{[`"']\/tasks\//);
  });

  it("still renders the Delete button for db-sourced tasks", () => {
    expect(panelSrc).toMatch(/task\.source\s*===\s*["']db["']/);
    expect(panelSrc).toMatch(/Delete/);
    expect(panelSrc).toMatch(/Trash2/);
  });

  it("still renders the View Full Session link", () => {
    expect(panelSrc).toMatch(/View Full Session/);
    expect(panelSrc).toMatch(/\/sessions\?highlight=/);
  });
});
