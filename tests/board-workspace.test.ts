// tests/board-workspace.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// --- useBoardProjects hook: pure mapping logic ---

import type { ProjectCardData } from "../client/src/components/board/project-card";
import type { MilestoneMeta, BoardTask, ProjectMeta } from "../shared/board-types";

interface ProjectApiItem {
  id: string;
  name: string;
  description: string | null;
  health: "ok" | "warning" | "error" | "unknown";
  data: {
    sessionCount: number;
  };
}

/**
 * Pure mapping function that transforms project API data + board state
 * into ProjectCardData[]. Mirrors the logic in use-board.ts.
 */
function mapProjectsToCards(
  projects: ProjectApiItem[],
  boardProjects: ProjectMeta[],
  milestones: MilestoneMeta[],
  tasks: BoardTask[],
): ProjectCardData[] {
  return projects.map((p) => {
    const boardProjectIds = boardProjects.map((bp) => bp.id);
    const isCurrent = boardProjectIds.length > 0 && boardProjectIds[0] === p.id;

    // Map entity health to card health
    const healthMap: Record<string, ProjectCardData["health"]> = {
      ok: "healthy",
      warning: "warning",
      error: "critical",
      unknown: "unknown",
    };

    const projectMilestones = milestones.filter((m) => m.project === p.id);
    const projectTasks = tasks.filter((t) => t.project === p.id);
    const doneTasks = projectTasks.filter((t) => t.column === "done").length;
    const inProgressTasks = projectTasks.filter((t) => t.column === "in-progress").length;
    // Sum cost from active sessions on this project's tasks
    const totalCost = projectTasks.reduce(
      (sum, t) => sum + (t.session?.costUsd ?? 0),
      0,
    );

    return {
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      health: healthMap[p.health] ?? "unknown",
      sessionCount: p.data.sessionCount,
      totalCost,
      milestoneCount: projectMilestones.length,
      taskCount: projectTasks.length,
      doneTasks,
      inProgressTasks,
      isCurrent,
    };
  });
}

function makeTask(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1",
    title: "Task",
    description: "",
    column: "backlog",
    project: "p1",
    projectName: "Project",
    projectColor: "#000",
    priority: "medium",
    dependsOn: [],
    tags: [],
    flagged: false,
    source: "db",
    session: null,
    createdAt: "2026-04-08",
    updatedAt: "2026-04-08",
    ...overrides,
  };
}

describe("useBoardProjects — mapping logic", () => {
  const projects: ProjectApiItem[] = [
    {
      id: "p1",
      name: "My App",
      description: "A test project",
      health: "ok",
      data: { sessionCount: 5 },
    },
    {
      id: "p2",
      name: "Other App",
      description: null,
      health: "warning",
      data: { sessionCount: 2 },
    },
  ];

  const boardProjects: ProjectMeta[] = [
    { id: "p1", name: "My App", color: "#3b82f6" },
    { id: "p2", name: "Other App", color: "#ef4444" },
  ];

  const milestones: MilestoneMeta[] = [
    { id: "m1", title: "Milestone 1", project: "p1", totalTasks: 3, doneTasks: 2 },
    { id: "m2", title: "Milestone 2", project: "p1", totalTasks: 2, doneTasks: 2 },
    { id: "m3", title: "Milestone 3", project: "p2", totalTasks: 1, doneTasks: 0 },
  ];

  const tasks: BoardTask[] = [
    makeTask({ id: "t1", project: "p1", column: "done" }),
    makeTask({ id: "t2", project: "p1", column: "in-progress" }),
    makeTask({ id: "t3", project: "p1", column: "backlog" }),
    makeTask({ id: "t4", project: "p2", column: "done", session: { sessionId: "s1", isActive: true, model: "opus", lastActivity: null, lastActivityTs: null, messageCount: 10, costUsd: 1.50, inputTokens: 1000, outputTokens: 500, healthScore: "good", toolErrors: 0, durationMinutes: 10 } }),
  ];

  it("returns correctly shaped ProjectCardData[]", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "p1",
      name: "My App",
      description: "A test project",
      health: "healthy",
      sessionCount: 5,
      totalCost: 0,
      milestoneCount: 2,
      taskCount: 3,
      doneTasks: 1,
      inProgressTasks: 1,
      isCurrent: true,
    });
  });

  it("maps entity health to card health correctly", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[0].health).toBe("healthy");
    expect(result[1].health).toBe("warning");
  });

  it("maps error health to critical", () => {
    const errorProject: ProjectApiItem[] = [
      { id: "p3", name: "Broken", description: null, health: "error", data: { sessionCount: 0 } },
    ];
    const result = mapProjectsToCards(errorProject, [], [], []);
    expect(result[0].health).toBe("critical");
  });

  it("maps unknown health to unknown", () => {
    const unknownProject: ProjectApiItem[] = [
      { id: "p4", name: "New", description: null, health: "unknown", data: { sessionCount: 0 } },
    ];
    const result = mapProjectsToCards(unknownProject, [], [], []);
    expect(result[0].health).toBe("unknown");
  });

  it("counts milestones per project", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[0].milestoneCount).toBe(2); // p1 has m1, m2
    expect(result[1].milestoneCount).toBe(1); // p2 has m3
  });

  it("counts tasks and done/in-progress per project", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[0].taskCount).toBe(3);
    expect(result[0].doneTasks).toBe(1);
    expect(result[0].inProgressTasks).toBe(1);
    expect(result[1].taskCount).toBe(1);
    expect(result[1].doneTasks).toBe(1);
    expect(result[1].inProgressTasks).toBe(0);
  });

  it("sums cost from task sessions", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[0].totalCost).toBe(0); // p1 tasks have no sessions
    expect(result[1].totalCost).toBe(1.50); // p2 has a task with $1.50 session
  });

  it("marks first board project as current", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[0].isCurrent).toBe(true);
    expect(result[1].isCurrent).toBe(false);
  });

  it("handles empty inputs gracefully", () => {
    const result = mapProjectsToCards([], [], [], []);
    expect(result).toEqual([]);
  });

  it("uses empty string for null descriptions", () => {
    const result = mapProjectsToCards(projects, boardProjects, milestones, tasks);
    expect(result[1].description).toBe("");
  });
});

// --- useDeleteTask hook: query key invalidation ---

describe("useDeleteTask — mutation shape", () => {
  it("targets the correct endpoint pattern", () => {
    // Verify the hook file exports useDeleteTask and it calls the right URL
    const hookSource = fs.readFileSync(
      path.join(__dirname, "../client/src/hooks/use-board.ts"),
      "utf-8",
    );
    expect(hookSource).toContain("useDeleteTask");
    expect(hookSource).toContain("DELETE");
    expect(hookSource).toContain("/api/board/tasks/");
  });

  it("invalidates board and board-stats query keys", () => {
    const hookSource = fs.readFileSync(
      path.join(__dirname, "../client/src/hooks/use-board.ts"),
      "utf-8",
    );
    // Find the useDeleteTask function and check it invalidates the right keys
    const deleteSection = hookSource.slice(hookSource.indexOf("useDeleteTask"));
    expect(deleteSection).toContain("BOARD_KEY");
    expect(deleteSection).toContain("STATS_KEY");
  });
});

// --- Workspace layout: source-based verification ---

describe("workspace layout — board.tsx structure", () => {
  const boardSource = fs.readFileSync(
    path.join(__dirname, "../client/src/pages/board.tsx"),
    "utf-8",
  );

  it("has overflow-hidden on root container", () => {
    expect(boardSource).toContain("overflow-hidden");
  });

  it("renders ProjectZone component", () => {
    expect(boardSource).toContain("<ProjectZone");
    expect(boardSource).toContain("ProjectZone");
  });

  it("renders ArchiveZone component", () => {
    expect(boardSource).toContain("<ArchiveZone");
    expect(boardSource).toContain("ArchiveZone");
  });

  it("imports ProjectZone from the correct path", () => {
    expect(boardSource).toMatch(/import.*ProjectZone.*from/);
  });

  it("imports ArchiveZone from the correct path", () => {
    expect(boardSource).toMatch(/import.*ArchiveZone.*from/);
  });

  it("uses useBoardProjects hook", () => {
    expect(boardSource).toContain("useBoardProjects");
  });

  it("has project popout state management", () => {
    expect(boardSource).toContain("selectedProject");
    expect(boardSource).toContain("projectAnchorRect");
  });

  it("renders ProjectPopout conditionally", () => {
    expect(boardSource).toContain("<ProjectPopout");
  });

  it("uses percentage-based zone heights", () => {
    // Should have three zones with percentage heights
    expect(boardSource).toContain("35%");
    expect(boardSource).toContain("30%");
  });

  it("does NOT have the old inline archive section", () => {
    // The old archive had a collapsible section with showArchived state
    expect(boardSource).not.toContain("showArchived");
    // The old archive had archivableMilestones buttons
    expect(boardSource).not.toContain("archivableMilestones");
  });

  it("uses wouter for navigation", () => {
    expect(boardSource).toContain("useLocation");
    expect(boardSource).toContain("wouter");
  });

  it("preserves existing board functionality", () => {
    // SSE connection
    expect(boardSource).toContain("useBoardEvents");
    // Filter
    expect(boardSource).toContain("BoardFilter");
    expect(boardSource).toContain("applyBoardFilters");
    // Board header
    expect(boardSource).toContain("BoardHeader");
    // Side panel for task popout
    expect(boardSource).toContain("BoardSidePanel");
    // Column rendering
    expect(boardSource).toContain("BOARD_COLUMNS");
  });
});
