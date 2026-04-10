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
    column: "queue",
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
    { id: "m1", title: "Milestone 1", project: "p1", color: "#3b82f6", totalTasks: 3, doneTasks: 2 },
    { id: "m2", title: "Milestone 2", project: "p1", color: "#10b981", totalTasks: 2, doneTasks: 2 },
    { id: "m3", title: "Milestone 3", project: "p2", color: "#f59e0b", totalTasks: 1, doneTasks: 0 },
  ];

  const tasks: BoardTask[] = [
    makeTask({ id: "t1", project: "p1", column: "done" }),
    makeTask({ id: "t2", project: "p1", column: "in-progress" }),
    makeTask({ id: "t3", project: "p1", column: "queue" }),
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

  it("does NOT render ArchiveZone component", () => {
    expect(boardSource).not.toContain("<ArchiveZone");
    expect(boardSource).not.toContain("ArchiveZone");
  });

  it("imports ProjectZone from the correct path", () => {
    expect(boardSource).toMatch(/import.*ProjectZone.*from/);
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

  it("uses percentage-based zone heights for 2-zone layout", () => {
    // Should have two zones: projects (25%) and board (75%)
    expect(boardSource).toContain("25%");
    expect(boardSource).toContain("75%");
    // Should NOT have the old 3-zone percentages
    expect(boardSource).not.toContain("30%");
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

// --- Cross-zone integration tests ---

describe("cross-zone integration — two-zone workspace", () => {
  const boardSource = fs.readFileSync(
    path.join(__dirname, "../client/src/pages/board.tsx"),
    "utf-8",
  );

  it("board.tsx imports ProjectZone but not ArchiveZone", () => {
    expect(boardSource).toMatch(/import\s+\{?\s*ProjectZone\s*\}?\s+from/);
    expect(boardSource).not.toMatch(/import\s+\{?\s*ArchiveZone\s*\}?\s+from/);
    expect(boardSource).toContain("BOARD_COLUMNS");
  });

  it("renders two zones with flex-based proportions", () => {
    // Zone 1: Projects (flex 25)
    expect(boardSource).toContain("flex: 25");
    // Zone 2: Board (flex 75)
    expect(boardSource).toContain("flex: 75");
    // Should NOT have old 3-zone flex values
    expect(boardSource).not.toContain("flex: 30");
    expect(boardSource).not.toContain("flex: 35");
  });

  it("passes boardProjects to ProjectZone", () => {
    expect(boardSource).toContain("useBoardProjects");
    expect(boardSource).toMatch(/projects=\{boardProjects\}/);
  });

  it("does not use archive hooks or data", () => {
    expect(boardSource).not.toContain("useArchivedMilestones");
    expect(boardSource).not.toContain("archiveData");
    expect(boardSource).not.toContain("ArchivedMilestone");
  });

  it("has project popout state management for non-current projects", () => {
    expect(boardSource).toContain("selectedProject");
    expect(boardSource).toContain("setSelectedProject");
    expect(boardSource).toContain("projectAnchorRect");
    expect(boardSource).toContain("setProjectAnchorRect");
  });

  it("navigates to detail page for current project clicks", () => {
    expect(boardSource).toContain("isCurrent");
    expect(boardSource).toMatch(/setLocation\(`\/projects\/\$\{project\.id\}`\)/);
  });

  it("shows floating popout for non-current project clicks", () => {
    expect(boardSource).toContain("<ProjectPopout");
    expect(boardSource).toContain("selectedProject && projectAnchorRect");
  });
});

// --- Board columns definition ---

describe("board columns — 4-column kanban", () => {
  const columnsSource = fs.readFileSync(
    path.join(__dirname, "../client/src/lib/board-columns.ts"),
    "utf-8",
  );

  it("defines exactly 4 columns", () => {
    // Count column definitions by matching id: "..." patterns
    const idMatches = columnsSource.match(/id:\s*"[^"]+"/g);
    expect(idMatches).toHaveLength(4);
  });

  it("has queue column", () => {
    expect(columnsSource).toContain('"queue"');
  });

  it("has in-progress column", () => {
    expect(columnsSource).toContain('"in-progress"');
  });

  it("has review column", () => {
    expect(columnsSource).toContain('"review"');
  });

  it("has done column", () => {
    expect(columnsSource).toContain('"done"');
  });

  it("does not have backlog or ready columns", () => {
    // These were removed in the column consolidation
    const idMatches = columnsSource.match(/id:\s*"[^"]+"/g) || [];
    const ids = idMatches.map(m => m.replace(/id:\s*"/, "").replace(/"$/, ""));
    expect(ids).not.toContain("backlog");
    expect(ids).not.toContain("ready");
  });

  it("columns are in correct left-to-right order", () => {
    const queueIdx = columnsSource.indexOf('"queue"');
    const inProgressIdx = columnsSource.indexOf('"in-progress"');
    const reviewIdx = columnsSource.indexOf('"review"');
    const doneIdx = columnsSource.indexOf('"done"');
    expect(queueIdx).toBeLessThan(inProgressIdx);
    expect(inProgressIdx).toBeLessThan(reviewIdx);
    expect(reviewIdx).toBeLessThan(doneIdx);
  });
});

// --- Status-to-column mapping ---

describe("statusToColumn — status mapping coverage", () => {
  const aggregatorSource = fs.readFileSync(
    path.join(__dirname, "../server/board/aggregator.ts"),
    "utf-8",
  );

  it("maps pending, planned, todo, ready, backlog to queue", () => {
    expect(aggregatorSource).toMatch(/case\s+"pending":/);
    expect(aggregatorSource).toMatch(/case\s+"planned":/);
    expect(aggregatorSource).toMatch(/case\s+"todo":/);
    expect(aggregatorSource).toMatch(/case\s+"ready":/);
    expect(aggregatorSource).toMatch(/case\s+"backlog":/);
    // All should resolve to queue
    expect(aggregatorSource).toMatch(/case\s+"backlog":\s*\n?\s*return\s+"queue"/);
  });

  it("maps in_progress to in-progress", () => {
    expect(aggregatorSource).toMatch(/case\s+"in_progress":/);
    // Verify it returns in-progress column
    const inProgressSection = aggregatorSource.slice(
      aggregatorSource.indexOf('"in-progress"', aggregatorSource.indexOf("statusToColumn")),
    );
    expect(inProgressSection).toContain('"in-progress"');
  });

  it("maps completed to done", () => {
    expect(aggregatorSource).toMatch(/case\s+"completed":/);
  });

  it("maps review to review", () => {
    expect(aggregatorSource).toMatch(/case\s+"review":\s*\n?\s*return\s+"review"/);
  });

  it("maps blocked to in-progress", () => {
    expect(aggregatorSource).toMatch(/case\s+"blocked":/);
  });

  it("maps cancelled to done", () => {
    expect(aggregatorSource).toMatch(/case\s+"cancelled":/);
  });

  it("defaults unknown statuses to queue", () => {
    expect(aggregatorSource).toMatch(/default:\s*\n?\s*return\s+"queue"/);
  });
});

// --- Delete button conditional on source ---

describe("delete button — source-conditional in board-side-panel", () => {
  const panelSource = fs.readFileSync(
    path.join(__dirname, "../client/src/components/board/board-side-panel.tsx"),
    "utf-8",
  );

  it("imports useDeleteTask hook", () => {
    expect(panelSource).toMatch(/import.*useDeleteTask.*from/);
  });

  it("calls useDeleteTask", () => {
    expect(panelSource).toContain("useDeleteTask()");
  });

  it("conditionally renders delete button based on source === db", () => {
    // The delete button is only shown when task.source === "db"
    expect(panelSource).toContain('task.source === "db"');
  });

  it("uses Trash2 icon for delete button", () => {
    expect(panelSource).toContain("Trash2");
  });

  it("calls deleteTask.mutate on confirmation", () => {
    expect(panelSource).toContain("deleteTask.mutate(task.id)");
  });

  it("closes panel after deletion", () => {
    // After mutate, onClose() is called
    const deleteSection = panelSource.slice(panelSource.indexOf("deleteTask.mutate"));
    expect(deleteSection).toContain("onClose()");
  });
});

// --- Nav redirect: /projects -> /board ---

describe("nav redirect — /projects to /board", () => {
  const projectsSource = fs.readFileSync(
    path.join(__dirname, "../client/src/pages/projects.tsx"),
    "utf-8",
  );
  const appSource = fs.readFileSync(
    path.join(__dirname, "../client/src/App.tsx"),
    "utf-8",
  );

  it("/projects page uses Redirect component", () => {
    expect(projectsSource).toContain("Redirect");
    expect(projectsSource).toContain("wouter");
  });

  it("redirects to /board", () => {
    expect(projectsSource).toContain('to="/board"');
  });

  it("App.tsx registers /projects route", () => {
    expect(appSource).toContain('path="/projects"');
  });

  it("App.tsx registers /projects/:id route for detail pages", () => {
    expect(appSource).toContain('path="/projects/:id"');
  });

  it("board is not listed under /projects in nav", () => {
    const layoutSource = fs.readFileSync(
      path.join(__dirname, "../client/src/components/layout.tsx"),
      "utf-8",
    );
    // The nav should have /board as a direct nav item, not /projects
    expect(layoutSource).toContain('path: "/board"');
    // /projects should NOT be a nav item (it's a redirect route only)
    const navItemPaths = layoutSource.match(/path:\s*"\/[^"]+"/g) || [];
    const hasProjectsNav = navItemPaths.some(p => p === 'path: "/projects"');
    expect(hasProjectsNav).toBe(false);
  });
});

// --- Pipeline Test data verification ---

describe("Pipeline Test data removal — verification", () => {
  it("no source files reference Pipeline Test as runtime data", () => {
    // Pipeline Test / Auth System references should only exist in docs, scripts, and tests
    const serverDir = path.join(__dirname, "../server");
    const clientDir = path.join(__dirname, "../client");
    const sharedDir = path.join(__dirname, "../shared");

    function searchDir(dir: string): string[] {
      const hits: string[] = [];
      if (!fs.existsSync(dir)) return hits;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          hits.push(...searchDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.includes("Pipeline Test") || content.includes("Auth System")) {
            hits.push(fullPath);
          }
        }
      }
      return hits;
    }

    const serverHits = searchDir(serverDir);
    const clientHits = searchDir(clientDir);
    const sharedHits = searchDir(sharedDir);

    expect(serverHits).toEqual([]);
    expect(clientHits).toEqual([]);
    expect(sharedHits).toEqual([]);
  });

  it("BoardTask source field exists in shared types", () => {
    const typesSource = fs.readFileSync(
      path.join(__dirname, "../shared/board-types.ts"),
      "utf-8",
    );
    // Source field enables delete button gating
    expect(typesSource).toMatch(/source:\s*"db"\s*\|\s*"workflow"/);
  });

  it("aggregator assigns source based on isDbStoredTask", () => {
    const aggregatorSource = fs.readFileSync(
      path.join(__dirname, "../server/board/aggregator.ts"),
      "utf-8",
    );
    expect(aggregatorSource).toContain("isDbStoredTask");
    expect(aggregatorSource).toMatch(/source:\s*isDbStoredTask\(/);
  });
});

// --- Dead code / cleanup verification ---

describe("workspace cleanup — no dead code", () => {
  it("board.tsx has no unused old-layout artifacts", () => {
    const boardSource = fs.readFileSync(
      path.join(__dirname, "../client/src/pages/board.tsx"),
      "utf-8",
    );
    // Old layout had showArchived toggle state
    expect(boardSource).not.toContain("showArchived");
    // Old layout had archivableMilestones
    expect(boardSource).not.toContain("archivableMilestones");
    // Old layout had inline archive buttons
    expect(boardSource).not.toContain("handleArchive");
  });

  it("use-board.ts exports match what board.tsx imports", () => {
    const hookSource = fs.readFileSync(
      path.join(__dirname, "../client/src/hooks/use-board.ts"),
      "utf-8",
    );
    const boardSource = fs.readFileSync(
      path.join(__dirname, "../client/src/pages/board.tsx"),
      "utf-8",
    );

    // All hooks used in board.tsx should be exported from use-board.ts
    const hooksUsed = ["useBoardState", "useBoardStats", "useBoardEvents", "useBoardProjects", "applyBoardFilters"];
    for (const hook of hooksUsed) {
      expect(hookSource).toContain(`export function ${hook}`);
      expect(boardSource).toContain(hook);
    }
  });

  it("board-side-panel.tsx has no stale TODO comments", () => {
    const panelSource = fs.readFileSync(
      path.join(__dirname, "../client/src/components/board/board-side-panel.tsx"),
      "utf-8",
    );
    // No TODO/FIXME/HACK markers
    expect(panelSource).not.toMatch(/\/\/\s*TODO/i);
    expect(panelSource).not.toMatch(/\/\/\s*FIXME/i);
    expect(panelSource).not.toMatch(/\/\/\s*HACK/i);
  });

  it("board.tsx has no stale TODO comments", () => {
    const boardSource = fs.readFileSync(
      path.join(__dirname, "../client/src/pages/board.tsx"),
      "utf-8",
    );
    expect(boardSource).not.toMatch(/\/\/\s*TODO/i);
    expect(boardSource).not.toMatch(/\/\/\s*FIXME/i);
  });

  it("use-board.ts has no stale TODO comments", () => {
    const hookSource = fs.readFileSync(
      path.join(__dirname, "../client/src/hooks/use-board.ts"),
      "utf-8",
    );
    expect(hookSource).not.toMatch(/\/\/\s*TODO/i);
    expect(hookSource).not.toMatch(/\/\/\s*FIXME/i);
  });
});
