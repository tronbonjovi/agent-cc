# Workspace Layout & Board Column Flow Redesign

**Date:** 2026-04-08
**Status:** Approved

## Problem

The board page grows vertically without bounds, completed milestones disappear into an invisible archive, the "ready" and "review" kanban columns are never used, projects live on a completely separate page with no connection to the board, and stale test data from early kanban development has no delete path.

## Design

### 1. Unified Workspace Page

Replace the separate board page with a single stacked workspace that combines projects, kanban, and archive into three horizontal zones. The workspace fills the viewport height — no page-level scrolling.

**Zone layout (top to bottom):**

| Zone | Height | Content | Scroll |
|------|--------|---------|--------|
| Projects | 35% | Horizontal row of project info-radiator cards | Horizontal scroll for overflow |
| Board | 35% | Kanban board with all 5 columns | Horizontal scroll for columns, vertical scroll per-column |
| Archive | 30% | Completed milestones graveyard | Vertical scroll |

The terminal panel overlaps the archive zone when pulled up. Archive is intentionally the least-critical zone — it yields space to the terminal. When the terminal is collapsed, the archive becomes visible as a bonus view.

### 2. Project Info-Radiator Cards

Small cards in the top zone, scrolling horizontally. Each card shows:

- Health status dot (green/amber/red/grey)
- Project name
- Milestone count + task count
- Progress bar (visual split of done/in-progress/pending)
- Active session count + total cost

**Interactions:**
- Click any project card → floating popout with expanded details (reuse `computePopoutPosition` pattern from board task popout)
- Popout shows: description, milestone list with progress, active sessions, recent cost, link to full detail page
- Click the **current project** card → navigates to full project detail page (existing `/projects/:id` route). "Current project" = the project detected from agent-cc's working directory, same as the scanner's primary project.
- "Current" project gets a badge/indicator on its card

**Data source:** Same project scanner data that powers the existing `/projects` page. No new API needed — the existing `/api/projects` endpoint has all the data.

### 3. Contained Kanban Board

The kanban board lives in the middle zone with fixed height (35% of viewport). All 5 columns are active:

| Column | Color | Statuses mapped |
|--------|-------|-----------------|
| Backlog | Slate | `backlog`, `pending` |
| Ready | Blue | `todo`, `ready` |
| In Progress | Amber | `in-progress`, `in_progress`, `blocked` |
| Review | Purple | `review` |
| Done | Emerald | `done`, `completed`, `cancelled` |

Columns scroll internally when cards overflow. The board scrolls horizontally if columns don't fit the viewport width. No page-level vertical growth.

**Project filter:** Dropdown in the board header to filter by project. Default shows the current project's tasks (or all if no project context).

### 4. Archive Graveyard

Bottom zone shows completed milestones as a flat list:

- Milestone name, task count, completion date, project name
- Slightly dimmed (opacity) to signal "done, out of the way"
- Scrolls vertically when milestones overflow
- Clickable to expand/view archived milestone details

This zone is covered by the terminal panel when it's open. The terminal already has a drag handle for height — it naturally overlaps the archive.

### 5. Column Flow Fix (`/work-task` Skill)

Update the `/work-task` skill's status transitions to use all 5 columns:

**Current flow (broken):**
```
backlog → in_progress → completed
```

**New flow:**
```
backlog → ready → in_progress → review → completed
```

Specific transitions:

| Event | Status change | Board column |
|-------|--------------|--------------|
| `/work-task` dispatches a milestone | All milestone tasks → `ready` | Ready |
| `/work-task` dispatches a specific task (subagent starts) | Task → `in_progress` | In Progress |
| Subagent completes, reviewer dispatched | Task → `review` | Review |
| Reviewer passes | Task → `completed` | Done |
| Reviewer fails (after 2 cycles) | Task → `blocked` | In Progress |

**Changes required:** Modify the `work-task` SKILL.md in the claude-workflow plugin:
- Step 5a: When marking task `in_progress`, first move all sibling pending tasks in the same milestone to `ready`
- Step 6a: Change review status from current behavior to explicitly set `review` status
- Step 6c pass: Set `completed`
- Step 6c fail: Set `blocked` (already maps to in-progress column)

Also update the `update-task` skill's cascade logic to handle the `ready` and `review` statuses.

### 6. Delete Action for DB-Stored Tasks

Add a delete capability for tasks that are stored in the agent-cc database (ingested via `/api/board/ingest`), not for workflow file tasks.

**Scope:**
- Delete button appears on task card popout, only for DB-stored tasks (tasks with `itm-` prefix IDs)
- Confirmation dialog before deletion
- API endpoint: `DELETE /api/board/tasks/:id` — validates the task is DB-stored, not a workflow file task
- Cascade: if deleting all tasks in a milestone, clean up the milestone too

**Immediate action:** Delete the "Pipeline Test" / "Auth System" test data (6 tasks + milestone) from the database as a bug fix.

### 7. Navigation Changes

- The board page (`/board`) becomes the workspace page with all three zones
- Projects listing moves from `/projects` to the workspace top zone — no longer a separate page
- `/projects/:id` detail page stays as-is (individual project deep-dive)
- Nav sidebar: "Board" item under Overview keeps its name and route — the page just gains the project and archive zones
- "Projects" item under Entities removes the listing view (cards move to workspace top zone). The `/projects` route redirects to the workspace. Individual `/projects/:id` detail routes remain.

## Out of Scope

- Manual task creation UI (future "manual workflow" for adding cards outside the workflow system)
- Backlog → planning staging workflow (future work on rough plans and roadmap creation)
- Unarchive flow (can be added later if needed)
- Project card drag-and-drop or reordering
- Board column drag-and-drop for reordering columns

## Risk Notes

- **Terminal overlap math:** The terminal panel height is user-controlled via drag handle. The archive zone needs to gracefully handle being partially or fully covered. CSS `z-index` layering should handle this — terminal sits above the workspace.
- **Project filter state:** When switching project filter on the board, the archive zone should also filter to that project's milestones. Need to keep filter state in sync.
- **Responsive behavior:** Three zones at fixed percentages may feel cramped on small screens. Consider a minimum height for each zone, with the archive collapsing first.

## Test Plan

- Workspace renders three zones at correct proportions
- Project cards display correct data and scroll horizontally
- Project card click opens floating popout (non-current) or navigates to detail page (current)
- Kanban board is contained — no page-level vertical scroll
- All 5 columns render and accept cards
- `/work-task` moves tasks through ready → in_progress → review → done flow
- Archive zone shows completed milestones
- Terminal panel overlaps archive zone when open
- Delete action works for DB-stored tasks, is hidden for workflow tasks
- Pipeline Test data is removed
