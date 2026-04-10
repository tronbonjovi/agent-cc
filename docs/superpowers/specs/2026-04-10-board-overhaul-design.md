# Board Overhaul Design

## Status

Spec ready for implementation planning. Decisions captured from user notes (April 10, 2026). No brainstorm needed.

## Overview

Three related changes to the Board page: fix the completed task/milestone visibility after archive removal, restore info radiators to task cards, and convert the project cards section into a left sidebar.

---

## 1. Completed Task/Milestone Handling

### Problem

When the archive zone was removed from the board, the wiring that auto-hid completed milestones/tasks was also removed. Now all completed milestones and tasks are visible in the Done column, cluttering the board with historical noise.

### Design

- **Completed tasks should NOT appear as cards in the Done column.** Only recently-completed items (e.g., completed within the current session or last 24h) should briefly appear, then age out.
- **Project cards should list completed milestones** — the popout view should show a full roadmap checklist with strikethrough or checkmarks indicating which milestones are completed vs. active.
- The current popout shows "Milestones / In Progress / Done" as aggregate numbers. Replace this with a named list of milestones with completion status.

### Reference

See `archive-removal-bug.png` — Done column flooded with completed items.
See `project-card-popout.png` — current popout shows "21 Milestones, 0 In Progress, 62 Done" but no milestone names or completion indicators.

---

## 2. Task Card Info Restoration

### Problem

During a previous card redesign, several info radiators were removed from task cards: model, agent, messages, time, tokens, cost. These were supposed to be reorganized, not removed.

### Design

Updated card layout (top to bottom):

```
Task Name (max-char truncation with ellipsis for uniformity)
project name · milestone name
model · agent
complexity:___ · parallel-safe · [other tags]
messages · time · tokens · cost
```

- **Task name** should have a max character limit before truncating with ellipsis. This preserves card size uniformity across the board.
- All metadata fields from the old cards should be restored in the organized layout above.
- Card width should remain uniform within a column.

### Reference

See `old-vs-new-cards.png` — old cards show model, agent, messages (19), time (3h 27m), tokens (69k), cost ($23.84). New cards show only task name, project/milestone, and tags.

---

## 3. Project Sidebar (replaces top project cards)

### Problem

Project cards currently sit in a horizontal row above the kanban columns. This wastes vertical space and doesn't scale well with many projects.

### Design

- **Move project cards to a left sidebar**, positioned between the navigation and the kanban board.
- **Sidebar behavior:**
  - Scrollable independently from the kanban board
  - Adjustable width (drag handle)
  - Project names listed vertically
- **Project card content:**
  - Universal card size within sidebar
  - Info radiators: session count, number of milestones, number of tasks
  - Dynamic milestone progress bars (replacing the current top-of-page milestone display)
  - Bars use milestone colors matching card colors
  - Bars show task count that updates as tasks are completed
- **Card sizing:**
  - Card width adjusts dynamically when sidebar width changes
  - Card height adjusts dynamically based on whether milestone bars are present

### Layout

```
+------+----------+------------------------------------------+
| Nav  | Projects | Kanban Board                             |
|      | Sidebar  | +--------+ +--------+ +--------+ +----+ |
|      |          | | Queue  | | In Prog| | Review | |Done| |
|      | [proj 1] | |        | |        | |        | |    | |
|      |  bars... | |        | |        | |        | |    | |
|      |          | |        | |        | |        | |    | |
|      | [proj 2] | |        | |        | |        | |    | |
|      |  bars... | |        | |        | |        | |    | |
|      |          | +--------+ +--------+ +--------+ +----+ |
+------+----------+------------------------------------------+
```

---

## Dependencies

- Card info restoration requires that session/task metadata (model, agent, tokens, cost, etc.) is still available from the scanner/API. Verify data availability.
- Project sidebar is a significant layout change to the Board page — may benefit from responsive-foundation work but is not blocked by it.
