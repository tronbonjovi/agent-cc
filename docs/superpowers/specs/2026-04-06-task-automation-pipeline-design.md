# Task Automation Pipeline — Design Spec

## Overview

A pipeline system for agent-cc that automates task execution through Claude Code CLI. You plan the work interactively (brainstorm → roadmap → milestones + tasks), then trigger milestones for automated execution. The pipeline builds, reviews, and delivers completed work to you at milestone boundaries for human review.

## Core Concept

**You work at the milestone level. The pipeline works at the task level.**

- Interactive: brainstorm, design, plan, review milestones
- Automated: task scheduling, building, code review
- The kanban board is the control surface for both

## Kanban Board Columns (Full Lifecycle)

| Column | Automated? | Description |
|--------|-----------|-------------|
| Backlog | No | Raw ideas, unplanned work |
| Brainstorm | No | You + Claude designing the feature interactively |
| Plan | No | Roadmap creation via plan-to-roadmap (includes adversarial review of the plan itself) |
| Queued | System | Tasks waiting for a worker to pick them up |
| Build | Yes | Worker is writing code, running tests in an isolated worktree |
| AI Review | Yes | Automated quality/correctness review, adversarial review via Codex |
| Human Review | You | Visual, functional, UX review at milestone boundaries |
| Done | System | Approved, merged, archived |

**Backlog through Plan** are your domain — that's where the thinking happens. **Queued through AI Review** are automated. **Human Review** is where you engage with completed milestones. **Done** is the finish line.

## Execution Flow

### Setup Phase (Interactive)

1. Brainstorm a feature → design spec
2. Plan-to-roadmap converts spec → milestones + tasks with dependency and scheduling info
   - Plan-to-roadmap includes adversarial review to challenge assumptions before they become the execution blueprint
3. Milestones and tasks appear on the project kanban board in Backlog
4. You review the board — reorder, adjust scope, remove tasks, modify priorities
5. When satisfied, select a milestone → "Work on this milestone"

### Execution Phase (Automated)

6. All tasks in the triggered milestone move to Queued
7. Pipeline manager reads dependency/scheduling info from the plan
8. Tasks execute respecting the planned order:
   - **Parallel-safe tasks** (no dependencies between them) can run concurrently up to the concurrency limit
   - **Sequential tasks** (dependencies or ordered by plan) run one at a time
9. For each task picked up:
   a. Create a git worktree (isolated copy of the repo)
   b. Run `claude -p` calls to build the implementation
   c. Run tests in the worktree
   d. On build completion, move to AI Review
   e. AI review runs (quality, correctness, adversarial review via Codex)
   f. Task card updates in real-time via SSE throughout
10. If a task gets stuck → escalation ladder (see Guardrails)
11. Blocked tasks get skipped; pipeline continues with non-dependent tasks

### Milestone Checkpoint (You)

12. All tasks in the milestone reach Human Review or Blocked
13. Pipeline pauses, milestone summary appears
14. **Blocked task gate:** Before approval is available, all blocked tasks must be resolved:
    - **Descope** — explicitly remove a blocked task (and any tasks that depend on it) from the milestone. They return to backlog for future work.
    - **Re-queue** — send the task back through the pipeline with guidance.
    - **Resolve manually** — provide the fix yourself, mark as done.
    - Approval is disabled until zero blocked tasks remain in the milestone.
15. You review:
    - Check the running app for visual/functional/UX correctness
    - Review task summaries on the cards
16. Approve milestone → cleanup runs (tidy project, archive completed tasks)
17. "Work on next milestone" → next milestone's tasks flow into Queued, cycle repeats

## Worker Architecture

Each task gets its own worker process on the server:

1. **Worktree creation** — `git worktree add` creates an isolated branch for this task
2. **Claude Code execution** — worker sends structured prompts to `claude -p` working in the worktree directory
3. **Progress streaming** — status updates pushed via SSE to the kanban card in real-time
4. **Metadata tracking** — every `claude -p` call is logged: session ID, model, tokens, cost, duration
5. **Completion** — worktree has a branch with all changes, task moves to AI Review

### Branch Integration

When tasks complete and need to merge back:

- Each task's worktree is branched from the milestone's base branch
- Before moving to AI Review, the worker rebases the task branch onto the current base (catches drift from earlier completed tasks)
- If rebase fails (conflict), the worker attempts auto-resolution; if it can't, the task is flagged as Blocked with conflict details
- For parallel tasks: even if planning marked them parallel-safe, the pipeline validates no overlapping file edits as an early warning
- At milestone completion, all task branches are merged sequentially in dependency order into the milestone branch
- **Milestone integration gate:** After all task branches are merged into the milestone branch, the pipeline runs the full test suite on the combined result. File-overlap checks catch obvious conflicts early, but the integration gate catches subtle breakages (shared contracts, API changes, migrations) that only surface when branches are combined. If integration tests fail, the milestone is flagged for investigation before reaching human review.
- The milestone branch is what you review and ultimately merge to main

### Retry Isolation

Each build retry starts from a clean state:

- Before the first attempt, the worktree state is tagged as the "clean snapshot"
- On retry, the worktree resets to the clean snapshot before the next attempt begins
- Each attempt's changes are preserved as a separate patch/ref for debugging (viewable on the task card)
- Codex rescue also starts from the clean snapshot, not from a failed attempt's leftovers
- This ensures the final result in AI Review is from one clean, reproducible run — not accumulated partial attempts

### Scheduling

- Pipeline manager reads the milestone's task list and dependency graph (set during plan-to-roadmap)
- Parallel-safe tasks with no unresolved dependencies get queued together
- Sequential or dependent tasks wait their turn
- Configurable concurrency limit (default: 1 worker to start conservatively)

## Guardrails & Budget System

### Per-Task Limits

- **Max `claude -p` calls per Build stage:** 5 (configurable)
- **Max escalation attempts:** 2-3 self-fix, then 1 codex rescue, then blocked
- **Cost ceiling per task:** configurable (e.g., $5)

### Per-Milestone Limits

- **Total cost ceiling** across all tasks in the milestone
- If reached, pipeline pauses everything and notifies you

### Global Limits

- **Daily spend cap** across all pipeline activity
- **Max concurrent workers** (default: 1)

### Circuit Breakers

- **Same error twice** → skip remaining self-fix attempts, escalate immediately
- **No meaningful file changes** after a build attempt → stop, don't retry (spinning wheels)
- **Time limit per task** → pause and flag

### Escalation Ladder

1. Worker retries (2-3 attempts, different approach each time)
2. Codex rescue (fresh investigation from a different angle)
3. Pause task as Blocked, attach explanation of what was tried, move to next eligible task
4. If no eligible tasks remain → milestone is stalled, notify you

### Configuration

All limits stored in agent-cc settings. Defaults are conservative — loosen as trust builds.

## Task Card Data

When a task is being worked by the pipeline, the card shows:

### Live Status
- Current stage (Queued, Build, AI Review, etc.)
- Progress within stage (e.g., "running tests", "writing src/components/Foo.tsx")
- Time elapsed

### Linked Data
- Associated Claude Code session IDs (clickable, viewable in agent-cc)
- Git branch name
- Worktree path

### Cost & Usage
- Total tokens used
- Cost so far
- Model used
- Number of `claude -p` calls made

### Completion Summary (visible in Human Review)
- Plain-language summary of what was done
- Files changed (list)
- Test results (pass/fail count)
- AI review verdict and notes
- Escalation history if any (what went wrong, how it was resolved)

## Integration with Existing Code

| Existing Component | How Pipeline Uses It |
|---|---|
| `claude-runner.ts` | Extended to handle pipeline-stage prompts with structured roles |
| SSE infrastructure (`/api/scanner/events`) | Streams task progress updates to kanban cards |
| Task board (task-io, task routes) | New columns, real-time card updates, milestone-level triggers |
| Cost/session tracking | Linked to task cards as metadata |
| Terminal (WebSocket + PTY) | Workers may use terminals for build/test execution |
| Git worktrees | Each task gets an isolated worktree for safe parallel work |

## Skills & Reusable Patterns

As the system gets used, repeated actions should be extracted into skills:

- **Milestone cleanup** — archive tasks, tidy project state
- **AI review runs** — standardized review prompts and Codex integration
- **Escalation handling** — structured retry and rescue patterns

Specific skills will be identified through usage patterns rather than designed upfront.

## Future Considerations (Not in Scope)

- Direct API engine (Option B from brainstorm) — only if Claude Code CLI becomes a bottleneck
- GitHub PR creation per task — add later if needed for collaboration
- Kanban board visual overhaul — separate initiative, pipeline needs functional board not pretty board
- Plan-to-roadmap adversarial review enhancement — noted as needed, separate skill improvement
- Task card access control — currently single-operator on devbox, no auth needed. If multi-user access is added later, gate sensitive fields (worktree paths, session IDs) by role
