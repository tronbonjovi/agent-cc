# Kanban Board — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Supersedes:** `2026-04-06-pipeline-kanban-ui-design.md` (removed)

## Problem

The board needs to be a human-first kanban board for managing project work. Automation should enhance how a human works, not replace it. You can't automate a workflow you haven't operated yourself.

## Core Principles

1. **Human-first, automation-compatible.** Every action on the board (drag, create, move, archive) is an API call. The UI is one client. Claude CLI is another. Webhooks are another. The board doesn't care who changed state.
2. **Single board, all projects.** One centralized board — not a board per project or per milestone. Color, tags, and filters provide separation.
3. **Milestones are checkpoints, not containers.** A milestone is metadata on a task — the finish line, not a swim lane. Tasks flow through columns toward milestones.
4. **The board is the source of truth.** State lives in the board. The UI reflects it. Agents read it. Automation hooks watch it.
5. **Advise, don't dictate.** Dependency validation flags problems but doesn't lock the system. Humans can override.

## Architecture

```
Board API (source of truth)
  |-- Web UI (human drags cards, clicks actions)
  |-- Claude CLI / AI (calls same API to move tasks)
  |-- Ingest system (bulk creates tasks from roadmaps)
  |-- Automation hooks (watches state changes, triggers agents)
```

All clients interact through the same REST API. The board state is stored server-side. SSE events push real-time updates to all connected clients.

## Page Layout

### Header Area
- **Project filter bar** — filter by project, milestone, priority, status, assignee (human/AI)
- **Quick stats** — active tasks, agents currently working, total spend
- **Milestone progress** — compact indicators showing progress toward active milestones

### Board Area
- Nested within the page (not full-bleed) — rounded corners, consistent with app styling
- Horizontal scroll if columns overflow
- Cards are draggable between columns

### Columns

| Column | Meaning |
|--------|---------|
| **Backlog** | Known work, not yet prioritized |
| **Ready** | Prioritized, ready to be picked up |
| **In Progress** | Someone (human or AI) is actively working |
| **Review** | Work done, needs human eyes |
| **Done** | Approved and complete |

## Task Cards

### At-a-Glance (Board View)
- **Project color** — left border or badge color-coded by project
- **Title** — task name
- **Tags** — milestone, priority, any custom labels
- **Activity line** — brief status when work is happening ("building auth module — 2m ago")
- **Progress indicator** — files changed, tests passing/failing, stage within work
- **Cost** — spend so far (if agent is working)
- **Assignee** — human name or "AI" indicator
- **Dependency flag** — warning indicator if task has unmet prerequisites (see Dependency Validation)

### Side Panel (Quick View)
Click a card to open a side panel without leaving the board:
- Live message stream from the active session (if agent is working)
- Files changed so far
- Cost breakdown
- Stage transitions timeline
- Status controls (move to next column, send back, flag, etc.)
- "Open Full Detail" link
- **Future:** Interactive terminal to communicate with the assigned agent

### Full Detail Page
Navigate to a dedicated page for deep investigation:
- Complete session history (all messages, tool calls)
- File diffs
- Test results
- Full timeline of stage transitions
- Related/dependent tasks
- Cost and budget details

## Multi-Project Support

### Visual Separation
- Each project gets a distinct color (assigned on creation or ingest)
- Color appears as left border on cards and in filter chips
- Tags for milestone and project name on each card

### Filtering
- Filter by: project, milestone, priority, status, assignee type (human/AI)
- Filters are combinable (e.g., "Project: agent-cc AND Milestone: v3.0 AND Status: In Progress")
- Filter state persists in URL / local storage
- Quick filter presets (e.g., "My active work," "All blocked," "AI working")

## Ingest System

### Purpose
Bulk-populate the board from a structured roadmap document.

### Flow
1. A roadmap file is placed in an ingest directory (or uploaded via UI)
2. Parser extracts: tasks, milestones, priorities, dependencies, parallel-friendliness
3. Tasks are created on the board in the Backlog column
4. Milestones are registered as metadata
5. Dependencies between tasks are stored

### Roadmap Format
The roadmap should detail:
- Task titles and descriptions
- Which milestone each task belongs to
- Priority (high/medium/low)
- Dependencies (which tasks must complete first)
- Whether tasks can run in parallel

The exact format aligns with the existing workflow system (`plan-to-roadmap` skill output). Details TBD during implementation based on current roadmap structure.

## Dependency Validation

### Validate on Column Move
When a task is moved to "In Progress" (by human drag or API call):
1. Check: do any prerequisite tasks exist in columns before "Done"?
2. If yes: **flag the task as unworkable**
   - Task stays in the column where it was moved
   - A visual warning indicator appears on the card
   - Task cannot progress further until the flag clears
   - Rest of the board is unaffected
3. If no: task proceeds normally

### Flag Resolution
- **Auto-clear:** When all prerequisite tasks reach "Done," the flag is removed automatically
- **Manual dismiss:** Human can force-clear the flag if they know the dependency doesn't apply
- Flagged tasks remain visible and in place — they signal "investigate this" without disrupting workflow

### Dependency Source
Dependencies come from the roadmap at ingest time. They can also be manually added/edited on the board.

## Session Integration

### Agent-Task Binding
When an agent is spun up to work a task:
1. A Claude session is created with the task ID as metadata
2. The session JSONL file is tagged/associated with the task
3. The card's activity line updates in real-time via SSE
4. The side panel shows the live message stream from that session

### Session Scanning
Agent CC already scans `~/.claude/projects/` JSONL files. The new piece is:
- Sessions created by the board carry a task ID tag
- The session scanner can look up sessions by task ID
- This enables the drill-in experience (card -> side panel -> session messages)

## Automation Hooks

Automation is an optional enhancement, not the foundation. The board works fully without it.

### How Automation Plugs In
1. **State change watchers:** When a task moves to "In Progress," an automation hook *can* notice and spin up an agent
2. **Agent completion:** When an agent finishes, it calls the board API to move the task to "Review"
3. **Batch triggers:** AI can call the API to move multiple tasks at once ("start tasks 3-4")
4. **Budget enforcement:** The existing budget tracker can be wired in to monitor agent spend per task

### Infrastructure Reuse
- SSE event bus is used directly for board real-time updates

## API Surface

All board operations are REST endpoints. Key operations:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/board` | Full board state (all tasks, columns, filters) |
| GET | `/api/board/tasks/:id` | Single task detail |
| POST | `/api/board/tasks` | Create a task |
| PATCH | `/api/board/tasks/:id` | Update task (move column, edit, flag) |
| DELETE | `/api/board/tasks/:id` | Archive/remove a task |
| POST | `/api/board/tasks/:id/move` | Move task to a column (triggers validation) |
| POST | `/api/board/ingest` | Ingest a roadmap file |
| GET | `/api/board/tasks/:id/session` | Get linked session data |
| GET | `/api/board/stats` | Quick stats (active, blocked, spend) |
| GET | `/api/board/events` | SSE stream for real-time updates |

## Data Model

```typescript
interface BoardTask {
  id: string;
  title: string;
  description: string;
  column: 'backlog' | 'ready' | 'in-progress' | 'review' | 'done';
  project: string;              // project identifier
  projectColor: string;         // hex color for visual coding
  milestone?: string;           // milestone this task works toward
  priority: 'high' | 'medium' | 'low';
  dependsOn: string[];          // task IDs that must complete first
  tags: string[];               // custom labels
  assignee?: string;            // human name or 'ai'
  sessionId?: string;           // linked Claude session (when agent is working)
  flagged: boolean;             // unworkable flag (unmet dependencies)
  flagReason?: string;          // why it's flagged
  activity?: string;            // brief status line ("building auth — 2m ago")
  cost?: number;                // spend so far (agent work)
  createdAt: string;
  updatedAt: string;
}

interface BoardState {
  tasks: BoardTask[];
  columns: string[];            // ordered column names
  projects: ProjectMeta[];      // registered projects with colors
  milestones: MilestoneMeta[];  // registered milestones with progress
}
```

## Architecture Foundations

Reusable pieces from the existing infrastructure:
- SSE event infrastructure
- Session scanning and JSONL parsing
- React Query patterns for data fetching

## Future Considerations (Not in Scope)

- **Interactive terminal in side panel** — ability to chat directly with an agent working a task
- **Board templates** — preset column configurations for different workflow types
- **Time tracking** — how long tasks spend in each column
- **Swimlane view toggle** — optional grouping by project or milestone (as a view mode, not the default)
- **Mobile-responsive board** — optimized for monitoring from phone/tablet
