# Workflow System — Design Spec

## Overview

A markdown-based project workflow system for Claude Code projects. Standardizes how projects are planned, broken down, and executed — optimized for short, scoped agent sessions. The system is a **convention enforced by files and instructions**, not an application.

## Hierarchy

```
ROADMAP.md → Milestones → Tasks → Subtasks (acceptance criteria)
```

- ROADMAP.md is the top-level plan linking to milestones
- Each milestone gets its own file in `milestones/`
- Each task gets its own file in `tasks/`
- Tasks are scoped work orders — small enough for a single Claude Code session
- All files use YAML frontmatter for structured metadata

## File Structure

```
ROADMAP.md
milestones/
  MILE-001.md
  MILE-002.md
tasks/
  TASK-001.md
  TASK-002.md
```

## Templates

### ROADMAP.md

```yaml
---
project: <project-name>
status: active
tags: []
---
```

```markdown
# Roadmap

## Milestones
- [ ] [MILE-001](milestones/MILE-001.md) — <milestone title>
```

### Milestone (milestones/MILE-NNN.md)

```yaml
---
id: MILE-NNN
title: <milestone title>
status: backlog
priority: high
tags: [<categorical tags>]
---
```

```markdown
# MILE-NNN: <milestone title>

## Tasks
- [ ] [TASK-NNN](../tasks/TASK-NNN.md) — <task title>
```

### Task (tasks/TASK-NNN.md)

```yaml
---
id: TASK-NNN
title: <task title>
status: backlog
priority: high
milestone: MILE-NNN
depends_on: []
tags: [<categorical tags>]
---
```

```markdown
# TASK-NNN: <task title>

## Acceptance Criteria
- [ ] <criterion>

## Relevant Files
- (none yet)

## Log
```

## Tag System

Tags live in the `tags:` frontmatter array on every file type.

**Categorical tags** — freeform, for filtering and grouping:
- Domain: `frontend`, `backend`, `infra`, `docs`
- Type: `feature`, `bugfix`, `refactor`, `cleanup`, `research`
- Any other project-relevant labels

**Linking tags** — structured IDs that connect files laterally. Tasks reference their milestone via the dedicated `milestone:` field, but tags can cross-link related work across milestones (e.g., all `auth`-related tasks).

Tags are freeform. No enforced taxonomy — use what makes sense for the project. The kanban board can filter/group by any tag.

## Status Lifecycle

Consistent across all file types:

```
backlog → in-progress → review → done
```

- **backlog** — defined but not started
- **in-progress** — actively being worked on
- **review** — work complete, needs verification
- **done** — accepted, closed

Milestone status auto-derives from its tasks: all tasks `done` → milestone `done`; any task `in-progress` → milestone `in-progress`; otherwise `backlog`.

## Delivery Components

### 1. `new-project` script

A shell script that lives alongside the skills (in the superpowers plugin or user's dotfiles) and scaffolds a new project with the workflow structure:
1. Creates `ROADMAP.md`, `milestones/`, `tasks/` with starter templates
2. Appends a workflow stub to CLAUDE.md
3. Optionally takes a project name argument

Agent CC can trigger this via a UI button (kanban board, saved prompt, etc.).

### 2. Workflow skill (loaded on demand)

A Claude Code skill containing the full workflow conventions:
- What the files mean and where they live
- Status values and transitions
- How to resolve "next task" — scan tasks for a given milestone, filter by `status: backlog`, sort by priority, respect `depends_on`
- How to update files when working (set `in-progress`, log progress, move to `review`/`done`)
- Tag conventions

CLAUDE.md gets a ~2-line stub pointing to this skill, keeping context load minimal.

### 3. `plan-to-roadmap` skill

Takes freeform brainstorm/spec output and converts it into:
- Populated ROADMAP.md with milestones listed
- Individual milestone files with tasks listed
- Individual task files with acceptance criteria, relevant files, dependencies
- Tags applied based on content

This bridges "we brainstormed a big plan" → "now it's structured for execution."

### 4. Additional skills (built as needed)

Skills like `close-task`, `next-task`, etc. will emerge naturally during implementation. These are identified and built as part of the implementation plan, not designed upfront.

## Integration Points

- **Agent CC kanban board** — reads/writes the same frontmatter. Can display a "deploy workflow" button per project.
- **Agent CC saved prompts** — can trigger workflow deployment or task execution.
- **Obsidian** — the file structure works as an Obsidian vault for visual navigation and graph view. Obsidian is not required.
- **Claude Code sessions** — "work on milestone 2" triggers the workflow skill, which scans for the next eligible task.

## CLAUDE.md Stub

The bootstrap adds this to the project's CLAUDE.md:

```markdown
## Workflow System
This project uses the markdown workflow system. Invoke the `workflow` skill before interacting with ROADMAP.md, milestones/, or tasks/.
```

## Design Goals

- **Frontmatter is the single source of truth** — kanban board, Obsidian, and Claude all read/write the same YAML headers
- **Tasks are self-contained** — each task file has enough context that Claude doesn't need full project context
- **Obsidian compatibility** — works as a vault, but Obsidian is not required
- **Minimal context load** — skill-based approach means the full spec only loads when needed
- **Convention over infrastructure** — this is files and instructions, not an application
