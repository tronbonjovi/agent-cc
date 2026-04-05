# Task Management — Design Spec

## Overview

Add a flexible, project-level task management system to Agent CC. Tasks are markdown files with YAML frontmatter — following the same pattern as skills and memories — stored in `.claude/tasks/` directories. The UI provides a kanban board with drag-and-drop, nested hierarchy navigation, and rich task cards.

This deepens what "project" means in Agent CC: from a passive directory view to a living workspace with roadmaps, milestones, tasks, and lifecycle tracking.

## Data Model

### Task Files

Every item (task, milestone, roadmap, or any user-defined type) is a markdown file with YAML frontmatter:

```markdown
---
id: itm-a1b2c3
title: Implement OAuth login
type: task
status: in-progress
parent: itm-xyz789
priority: high
labels: [auth, backend]
order: 2
created: 2026-04-05
updated: 2026-04-05
---

Description, notes, acceptance criteria — whatever the user wants here.
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier, generated on creation (`itm-{nanoid}`) |
| `title` | yes | Display name |
| `type` | yes | Freeform string — `task`, `milestone`, `roadmap`, or any user-defined type |
| `status` | yes | Current status — must match a status in the board config |
| `parent` | no | ID of parent item. No parent = top-level. Creates hierarchy. |
| `priority` | no | Freeform — defaults suggest `low`, `medium`, `high` |
| `labels` | no | Array of freeform strings for categorization |
| `order` | no | Numeric sort order within parent/status group |
| `created` | yes | ISO date, set on creation |
| `updated` | yes | ISO date, updated on every write |

**Body:** Freeform markdown. Description, acceptance criteria, notes, links — whatever fits the work. Can be empty.

### Hierarchy

- **Hierarchy is created by `parent` references**, not filesystem nesting. All files live flat in the same directory.
- **Any item can contain any other item.** The system does not enforce what types nest under what.
- **Nesting depth is unlimited** — one level, three levels, five levels, the user decides.
- **No parent = top-level item.** A flat list of tasks with no parents is valid.

### Board Configuration

Each project's task board is configured via `_config.md` in the tasks directory:

```markdown
---
type: task-config
statuses: [backlog, todo, in-progress, review, done]
types: [roadmap, milestone, task]
default_type: task
default_priority: medium
---
```

- `statuses` — ordered list of status columns for the kanban board
- `types` — suggested item types (not enforced, just populates dropdowns)
- `default_type` — type pre-selected when creating new items
- `default_priority` — priority pre-selected when creating new items

All fields are customizable. The system ships with sensible defaults (the values shown above) but nothing is enforced.

### File Locations

Following the existing Claude ecosystem pattern (like CLAUDE.md, memories, settings):

- **Project tasks:** `{project}/.claude/tasks/` — lives with the project, Claude Code sees them natively
- **Global tasks:** `~/.claude/tasks/` — personal workspace, cross-project items
- **Filenames:** `{type}-{slug}.md` — human-readable (e.g., `task-oauth-login.md`, `milestone-auth-system.md`)
- **Config:** `_config.md` — underscore prefix sorts first, visually separated from task files

## UI Design

### Navigation

Tasks appear as a sub-item under Projects in the sidebar:

```
Entities
  ├── Projects
  │   └── Tasks
  ├── MCP Servers
  ├── Skills
  ...
```

Clicking Tasks opens the task management page.

### Page Layout: Hybrid Collapsible Sidebar + Breadcrumb

The task page has two zones:

1. **Collapsible sidebar (left):**
   - Collapsed state: shows project initials as icon buttons for quick switching
   - Expanded state: project list + hierarchy tree (expandable/collapsible nodes)
   - Click a project to load its task board
   - Click a hierarchy node (roadmap, milestone) to scope the board to that level
   - Toggle expand/collapse via hamburger icon

2. **Main area (right):**
   - Breadcrumb bar at top: `project › roadmap › milestone` — each segment clickable to navigate up
   - Kanban board below the breadcrumb
   - "+" button and view controls in the header area

### Kanban Board

Columns correspond to the statuses defined in `_config.md`. Default: `backlog | todo | in-progress | review | done`.

Each column:
- Header with status name and task count
- Stack of task cards
- "+" button at bottom for inline task creation

### Task Cards (Rich Density)

Each card displays:
- **Title** — primary text
- **Priority badge** — colored indicator (high/medium/low)
- **Parent context** — subtle text showing which milestone/group the task belongs to
- **Description preview** — first line or two of the markdown body, truncated
- **Labels** — small badges for each label
- **Date** — creation date
- **Progress indicator** — bar showing child task completion (for items with children)
- **Left border accent** — colored by priority

### Drag-and-Drop

Powered by `@dnd-kit`. Three operations:

1. **Between columns** — changes the task's `status` field
2. **Within a column** — changes the task's `order` field
3. **Between hierarchy levels** — changes the task's `parent` field (deferred to post-MVP)

All drag operations:
- Write immediately on drop (optimistic UI)
- Show an undo toast: "Moved 'Task name' to In Progress — **Undo**" (5-second window)
- Undo reverts the file write

### Detail Panel (Slide-Out)

Clicking a task card opens a slide-out panel from the right. The board stays visible but dimmed behind it.

Panel contents:
- Title (editable inline)
- Status (dropdown, matches board columns)
- Priority (dropdown)
- Type (dropdown, from config types)
- Labels (tag input, freeform)
- Parent (dropdown, shows hierarchy)
- Description (markdown editor, full body content)
- Created / Updated dates (read-only)
- Delete action (with confirmation)

Close panel to return to the board.

### Inline Task Creation

"+" at the bottom of each kanban column opens an inline form:
- Title input (required)
- Status pre-set to that column's status
- Type defaults to `default_type` from config
- Priority defaults to `default_priority` from config
- Press Enter to create, Escape to cancel
- Created task appears at the bottom of the column

## Backend Architecture

### Scanner Integration

The existing scanner learns to discover task files:
- Scans `{project}/.claude/tasks/*.md` for each known project
- Scans `~/.claude/tasks/*.md` for global tasks
- Parses YAML frontmatter, assembles hierarchy from `parent` references
- Recognizes `_config.md` as board configuration (not a task)

### API Routes

New route group at `/api/tasks`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | All tasks across all projects |
| `GET` | `/api/tasks/project/:projectId` | Tasks for a specific project with assembled hierarchy |
| `POST` | `/api/tasks/project/:projectId` | Create a new task (writes markdown file) |
| `GET` | `/api/tasks/:taskId` | Single task detail |
| `PUT` | `/api/tasks/:taskId` | Update task (rewrites frontmatter + body) |
| `DELETE` | `/api/tasks/:taskId` | Delete task file |
| `PATCH` | `/api/tasks/:taskId/move` | Reorder or change status/parent (drag-and-drop) |
| `GET` | `/api/tasks/project/:projectId/config` | Get board config |
| `PUT` | `/api/tasks/project/:projectId/config` | Update board config |

### File Writing

- Atomic writes: write to `.tmp` file, then rename (same pattern as existing DB)
- Frontmatter updates preserve the markdown body untouched
- Reorder operations update the `order` field in all affected files
- `updated` timestamp set on every write

### Malformed File Handling

Task files with invalid or missing frontmatter are skipped during scanning with a console warning. They do not crash the scanner or break the board. The UI could surface a "X files skipped" indicator so the user knows something needs fixing.

### ID Generation

Task IDs use the format `itm-{nanoid(8)}` — short, unique, URL-safe. Generated server-side on creation.

## Default Template

New projects start with this suggested structure (applied when the user first opens the task board for a project):

**Statuses:** `backlog`, `todo`, `in-progress`, `review`, `done`
**Types:** `roadmap`, `milestone`, `task`
**Default type:** `task`

The user is prompted to accept the defaults or customize before the board is created. No files are written until the user confirms.

## Future Phases (Designed For, Not Built)

These features are explicitly deferred but the data model and architecture support them:

- **Global tasks page** — aggregation view across all projects (API endpoint exists: `GET /api/tasks`)
- **Cross-project task linking** — add a `links` array to frontmatter for cross-references
- **Session awareness** — link tasks to Claude Code sessions by session ID or time range
- **AI-assisted creation** — use `claude -p` to generate task structures from descriptions
- **Import from plans** — parse `docs/superpowers/plans/*.md` into task hierarchies
- **Additional views** — list view, tree view (same data, different rendering)
- **Workflow templates** — save/load `_config.md` + starter task structures
- **Activity log** — track changes over time per task
- **Due dates and reminders** — add `due` field to frontmatter
- **Search and filter** — full-text search across task titles, descriptions, labels

## Dependencies

New npm packages:
- `@dnd-kit/core` — drag-and-drop primitives
- `@dnd-kit/sortable` — sortable list/column behavior
- `@dnd-kit/utilities` — helpers
- `gray-matter` — YAML frontmatter parsing (check if already used)
- `nanoid` — ID generation (check if already used)
