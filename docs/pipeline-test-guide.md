# Pipeline User Test Guide

A hands-on test of the full pipeline workflow: brainstorm → plan → roadmap → pipeline execution → milestone review.

## Prerequisites

- Agent CC running (`npm run dev` or deployed via systemd)
- A test project registered in Agent CC (any git repo with a `package.json`)
- Claude Code CLI installed and available

## Test Overview

You'll create a small brainstorm spec, convert it to a roadmap with tasks, then trigger the pipeline to execute them. The tasks are intentionally trivial so the pipeline runs through quickly — the goal is to feel the full workflow, not build something complex.

---

## Step 1: Create the Brainstorm Spec

Create a file in your test project at `.claude/tasks/` called `milestone-hello-pipeline-XXXX.md` (replace XXXX with any 4 hex chars):

```markdown
---
id: mile-hello-pipeline
title: "Hello Pipeline — Smoke Test"
type: milestone
status: backlog
created: 2026-04-06
updated: 2026-04-06
---

A minimal milestone to verify the pipeline workflow end-to-end.

## What this tests

- Pipeline picks up tasks in dependency order
- Workers create worktrees, run Claude, produce commits
- SSE events stream progress to the board
- Milestone pauses for human review when all tasks complete
- Approval runs the integration gate (merge + test)
```

## Step 2: Create the Tasks

Create these 3 task files in the same `.claude/tasks/` directory:

### Task 1: `task-add-pipeline-marker-XXXX.md`

```markdown
---
id: task-add-marker
title: "Add pipeline smoke test marker file"
type: task
status: backlog
parent: mile-hello-pipeline
created: 2026-04-06
updated: 2026-04-06
---

Create a file `pipeline-test-marker.txt` at the project root containing:
"Pipeline smoke test — created by automated pipeline"

Then create a test in the appropriate test directory that verifies:
- The file exists
- The content matches the expected string

Commit with message: "feat: add pipeline smoke test marker"
```

### Task 2: `task-add-greeting-util-XXXX.md`

```markdown
---
id: task-add-greeting
title: "Add a greeting utility function"
type: task
status: backlog
parent: mile-hello-pipeline
dependsOn:
  - task-add-marker
created: 2026-04-06
updated: 2026-04-06
---

Create a file `src/greeting.ts` (or `greeting.js` if no TypeScript) with:

```ts
export function greet(name: string): string {
  return `Hello, ${name}! Pipeline says hi.`;
}
```

Add a test that verifies:
- `greet("World")` returns `"Hello, World! Pipeline says hi."`
- `greet("")` returns `"Hello, ! Pipeline says hi."`

Commit with message: "feat: add greeting utility"
```

### Task 3: `task-add-greeting-export-XXXX.md`

```markdown
---
id: task-add-export
title: "Export greeting from package index"
type: task
status: backlog
parent: mile-hello-pipeline
dependsOn:
  - task-add-greeting
created: 2026-04-06
updated: 2026-04-06
---

Add a re-export of the `greet` function from the project's main index file (create one if it doesn't exist).

Add a test that verifies the function can be imported from the index.

Commit with message: "feat: export greeting from index"
```

## Step 3: Trigger the Milestone

1. Open Agent CC in your browser
2. Navigate to the project's task board
3. You should see the milestone and 3 tasks in Backlog
4. Click the milestone → "Work on this milestone"
5. Verify the task order respects dependencies: marker → greeting → export

## Step 4: Watch It Run

While the pipeline executes, verify:

- [ ] Tasks move through stages: Queued → Build → AI Review → Human Review
- [ ] SSE events update the cards in real-time (stage, activity text, cost)
- [ ] Each task runs in its own isolated worktree
- [ ] Dependencies are respected — task-add-greeting doesn't start until task-add-marker finishes
- [ ] Budget/cost tracking increments on each worker call

## Step 5: Handle the Milestone Review

When all tasks reach Human Review (or some reach Blocked):

- [ ] Pipeline auto-pauses with "all tasks complete — awaiting milestone review"
- [ ] If any tasks blocked: review the reason, descope or resolve them
- [ ] Check the test project — each task branch should exist with commits
- [ ] Click "Approve Milestone"
- [ ] Integration gate runs: merges all branches in order, runs `npm test` (or auto-detected command)
- [ ] On success: milestone branch is created, run status shows "completed"

## Step 6: Verify Results

- [ ] A `milestone/mile-hello-pipeline` branch exists in the test project
- [ ] The branch contains all 3 tasks' changes merged together
- [ ] Tests pass on the milestone branch
- [ ] Task files have updated `pipelineStage`, `pipelineBranch`, `pipelineCost` metadata

## What to Look For (Potential Issues)

- **Pipeline doesn't start:** Check that the project is registered in Agent CC and has a valid `.git` directory
- **Tasks stay in Queued:** Check the base branch exists and the dependency chain is valid
- **Worker errors:** Check the Agent CC server logs (`journalctl -u agent-cc -f`)
- **Integration gate fails:** Check if the test project has a valid test command (see `testCommand` in pipeline config)
- **SSE disconnects:** Refresh the page — events should reconnect (known limitation: no auto-reconnect yet)

## Cleanup

After testing, you can:
1. Delete the test task files from `.claude/tasks/`
2. Delete the pipeline branches: `git branch -D pipeline/task-add-marker pipeline/task-add-greeting pipeline/task-add-export milestone/mile-hello-pipeline`
3. Delete worktree remnants: `rm -rf /tmp/agent-cc-pipeline/`
