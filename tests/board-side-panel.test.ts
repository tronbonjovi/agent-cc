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

// ── Project popout — roadmap milestone checklist ─────────────────────────────

import {
  classifyMilestones,
  type ClassifiedMilestones,
} from "../client/src/components/board/project-popout";
import type { ProjectMilestoneData } from "../client/src/components/board/project-card";

function ms(title: string, totalTasks: number, doneTasks: number, color = "#888"): ProjectMilestoneData {
  return { id: title.toLowerCase().replace(/\s+/g, "-"), title, color, totalTasks, doneTasks };
}

describe("project popout — classifyMilestones", () => {
  it("classifies completed milestones (all tasks done)", () => {
    const result = classifyMilestones([ms("Alpha", 5, 5)]);
    expect(result.completed).toHaveLength(1);
    expect(result.active).toHaveLength(0);
    expect(result.planned).toHaveLength(0);
    expect(result.completed[0].title).toBe("Alpha");
  });

  it("classifies active milestones (some tasks done, not all)", () => {
    const result = classifyMilestones([ms("Beta", 5, 3)]);
    expect(result.active).toHaveLength(1);
    expect(result.completed).toHaveLength(0);
    expect(result.planned).toHaveLength(0);
    expect(result.active[0].title).toBe("Beta");
  });

  it("classifies planned milestones (no tasks done)", () => {
    const result = classifyMilestones([ms("Gamma", 5, 0)]);
    expect(result.planned).toHaveLength(1);
    expect(result.active).toHaveLength(0);
    expect(result.completed).toHaveLength(0);
  });

  it("classifies zero-task milestones as planned", () => {
    const result = classifyMilestones([ms("Empty", 0, 0)]);
    expect(result.planned).toHaveLength(1);
  });

  it("handles mixed milestones and orders: active, planned, completed", () => {
    const milestones = [
      ms("Done One", 3, 3),
      ms("Active One", 8, 4),
      ms("Planned One", 6, 0),
      ms("Done Two", 2, 2),
      ms("Active Two", 10, 1),
    ];
    const result = classifyMilestones(milestones);
    expect(result.active.map(m => m.title)).toEqual(["Active One", "Active Two"]);
    expect(result.planned.map(m => m.title)).toEqual(["Planned One"]);
    expect(result.completed.map(m => m.title)).toEqual(["Done One", "Done Two"]);
  });

  it("returns empty arrays when no milestones", () => {
    const result = classifyMilestones([]);
    expect(result.active).toEqual([]);
    expect(result.planned).toEqual([]);
    expect(result.completed).toEqual([]);
  });
});

describe("project popout — roadmap checklist rendering", () => {
  const popoutSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/board/project-popout.tsx"),
    "utf-8",
  );

  it("no longer renders the 3-column aggregate milestone grid", () => {
    // The old grid had "Milestones", "In Progress", "Done" labels
    expect(popoutSrc).not.toMatch(/grid-cols-3.*gap-2.*text-xs/);
    expect(popoutSrc).not.toMatch(/"Milestones"/);
    expect(popoutSrc).not.toMatch(/"In Progress"/);
  });

  it("uses Unicode check mark for completed milestones", () => {
    expect(popoutSrc).toMatch(/\u2713/); // ✓
  });

  it("uses Unicode open circle for active milestones", () => {
    expect(popoutSrc).toMatch(/\u25CB/); // ○
  });

  it("uses Unicode dash for planned milestones", () => {
    expect(popoutSrc).toMatch(/\u2014/); // —
  });

  it("renders a total task summary line", () => {
    // Should have a summary with total task count
    expect(popoutSrc).toMatch(/taskCount/);
    expect(popoutSrc).toMatch(/doneTasks/);
  });

  it("calls classifyMilestones to sort milestones", () => {
    expect(popoutSrc).toMatch(/classifyMilestones/);
  });

  it("applies strikethrough to completed milestone text", () => {
    expect(popoutSrc).toMatch(/line-through/);
  });
});
