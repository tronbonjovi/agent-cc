# Pipeline-First Kanban Board — Implementation Handoff

## Context

The pipeline backend is complete (9 rounds of adversarial review). This session designed the UI that surfaces the pipeline workflow to the user. The current kanban board is a generic drag-and-drop board — it needs to become a pipeline-native board where columns are fixed pipeline stages and milestones are horizontal swimlanes.

## What Was Done This Session

- Brainstormed the UI design with the user (visual companion mockups)
- Wrote a spec: `docs/superpowers/specs/2026-04-06-pipeline-kanban-ui-design.md`
- Ran 12 rounds of Codex adversarial review on the spec, fixed all findings
- Wrote a 13-task implementation plan: `docs/superpowers/plans/2026-04-06-pipeline-kanban-ui.md`
- Ran adversarial review on the plan (clean pass)

## What's Ready for Implementation

The plan has 13 tasks with a dependency graph. Start with Tasks 1, 2, and 11 (they're independent and can run in parallel). Tasks 4-7 are sequential (card → swimlane → board → page rewire). Task 10 (remove old components) should be last.

Key design decisions already locked in:
- Columns: Backlog > Queued > Build > AI Review > Human Review > Done
- Milestones as collapsible horizontal swimlanes
- No drag-and-drop — pipeline drives card movement
- Blocked is a visual state on the card, not a column
- Pause/Resume/Cancel controls on milestone headers
- Edit freeze during active runs (server-enforced)
- Test data via `scripts/load-test-tasks.sh` (creates a separate dummy project)

## How to Resume

```
Read docs/superpowers/plans/2026-04-06-pipeline-kanban-ui.md and implement using subagent-driven-development. Skip brainstorming — the spec and plan are complete and reviewed. Start with Tasks 1, 2, and 11 in parallel, then proceed sequentially through Tasks 3-13.
```
