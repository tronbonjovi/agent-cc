# Pipeline-First Kanban Board — UI Design

## Problem

The pipeline backend is complete (9 rounds of adversarial review, merged to main), but the UI doesn't communicate the pipeline workflow. The existing kanban board is generic — configurable columns, drag-and-drop, board-setup wizard per project. Someone opening it for the first time wouldn't know that milestones drive automation, that tasks flow through stages, or what the expected path is. The pipeline components (`MilestoneControls`, `PipelineCardOverlay`, SSE hooks) are bolted on rather than integrated into the board's structure.

## Design Decisions

### Pipeline-first board
The kanban board IS the pipeline. Columns represent fixed pipeline stages, not configurable statuses. The board teaches the workflow by existing — a user sees the stages and understands the path tasks take.

**Columns (left to right):** Backlog > Queued > Build > AI Review > Human Review > Done

Columns distribute evenly across the full viewport width (each ~16.6%). No left-heavy weighting.

### Backend stage to UI column mapping

| Backend `pipelineStage` | UI Column | Notes |
|---|---|---|
| `undefined` / missing | Backlog | Task exists but pipeline hasn't touched it |
| `queued` | Queued | Pipeline accepted the task, waiting for a worker |
| `build` | Build | Claude CLI actively working |
| `ai-review` | AI Review | Automated review pass |
| `human-review` | Human Review | Waiting for user |
| `done` | Done | Completed and merged |
| `blocked` | *stays in last column* | Red overlay; column determined by `blockedFromStage` field (see below) |
| `descoped` | *hidden from board* | Removed from the run, not displayed |
| `cancelled` | *hidden from board* | Run was cancelled, task didn't complete |
| unknown/unrecognized | *error treatment* | Distinct from Backlog — see below |

**Unknown stage handling:** Tasks with an unrecognized `pipelineStage` value are NOT placed in Backlog (that would conflate "never touched" with "backend sent something the UI doesn't understand"). They render in a dedicated error row at the bottom of their milestone's swimlane, spanning the full width (not placed in any column). They display with a warning treatment: yellow/orange border, label "Unknown stage: {value}", and destructive actions (descope, status changes) are disabled on those cards. This surfaces backend/UI version skew or data corruption visibly rather than masking it. The error row is only visible when unmapped tasks exist.

**Unknown-stage tasks block milestone approval.** If any task in a milestone has an unrecognized stage, the Approve button is disabled with a tooltip: "Cannot approve — {n} task(s) in unknown state." Unknown-stage tasks are excluded from the progress count denominator (they can't be counted as done or not-done if the stage is uninterpretable). The milestone header shows a warning badge: "{n} unmapped." This prevents approving a milestone when the client can't verify whether all work is actually complete.

**Recovery path for unknown-stage tasks:** The server-side descope endpoint only accepts tasks in the `blocked` stage (not arbitrary unknown stages). This prevents a stale UI from destructively removing valid in-flight tasks that happen to have a stage the old client doesn't recognize. For genuinely corrupted or stuck unknown-stage tasks, the recovery path is: (1) refresh the page to pick up any UI updates, (2) if the task is still unrecognized after refresh, Cancel the milestone (with confirmation). This is more disruptive than per-task descope, but it prevents stale clients from deleting valid work due to version skew. The UI shows a message on unknown-stage cards: "Unrecognized state — refresh the page or cancel the milestone to recover."

Retry loops and rework (e.g., a task that fails AI review and goes back to Build) are stage transitions — the card moves back to the Build column. The board reflects current state, not history.

### Milestones as horizontal swimlanes
Each milestone is a horizontal row spanning all columns. Tasks appear as cards within their milestone's row, positioned in the column matching their pipeline stage. Milestones are collapsible — collapse what you're not focused on, expand what's active.

This structure supports parallel milestone visualization. The backend currently runs one milestone at a time, but the UI is ready when parallel execution lands. While any milestone is in a non-terminal state (see canonical list in Human Intervention Controls), other milestones' Start buttons are disabled with a tooltip: "Another milestone is active."

**Server-side enforcement:** The backend is the source of truth for all milestone lifecycle mutations. Every mutating endpoint (Start, Pause, Resume, Cancel, Approve, Descope) validates preconditions server-side and returns 409 for invalid state transitions. The UI disable/controls are a convenience layer — not the enforcement mechanism. If a stale client or race condition bypasses the UI controls, the server blocks it.

**Server-side approval invariant:** The Approve endpoint must verify that every non-descoped, non-cancelled task in the milestone is in a canonical terminal/review stage (`done` or `human-review`). If any task has a `pipelineStage` value that is not in the server's known stage list, Approve returns 409: "Cannot approve — {n} task(s) in unrecognized state." This enforces the safety property server-side, not just in the UI, covering stale clients and direct API callers.

**Mutation response handling (all endpoints):** Every mutating pipeline endpoint (Start, Pause, Resume, Cancel, Approve, Descope) must invalidate both `pipeline/status` AND `tasks` queries after **every completed attempt** — success, 409, 5xx, timeout, or any other outcome. Use React Query's `onSettled` handler (fires after both success and error) to guarantee the board is always refreshed, regardless of what happened server-side. On error (any kind): additionally show an error toast with the server's message or a generic "Action failed — board refreshed." This covers the ambiguous cases (timeout after server committed, 5xx after partial write) where the client can't know if the mutation took effect.

**Server-side idempotency:** All mutating pipeline endpoints are naturally idempotent via state precondition checks (e.g., can't start if already running, can't pause if not running). Duplicate requests from retries or double-clicks hit the state check and return 409 rather than executing twice. No additional mutation tokens are needed.

### No manual drag-and-drop
Cards move through columns only via pipeline automation. No dragging between columns, no reordering within columns. This eliminates buggy animation issues and reinforces that the pipeline drives the flow.

### Blocked is a visual state, not a column
Blocked tasks stay in whatever column they were in when they got stuck. They get a red border/background tint with the blocked reason and a Descope button. This communicates "this card is stuck HERE" rather than making blocked look like a normal pipeline destination.

**Blocked card placement:** When a task transitions to `blocked`, the backend persists a `blockedFromStage` field recording the stage the task was in before it got blocked (e.g., `build`, `ai-review`). The UI uses `blockedFromStage` to place the card in the correct column with the blocked overlay. If `blockedFromStage` is missing or contains an unrecognized value, the card renders in the error row at the bottom of the swimlane with a note "Blocked — origin stage unknown." **Crucially, blocked tasks with unknown origin are still descopeable** — their `pipelineStage` is `blocked`, which is the only descope eligibility criterion. The unknown-origin visual treatment is separate from the unknown-stage treatment (which disables descope). A blocked task is always descopeable regardless of its `blockedFromStage` value.

### Human intervention controls
The normal flow is fully automated. But the user can pause, cancel, descope blocked tasks, and resume at any time, for any reason. This is a blanket safety/quality-of-life feature, not tied to specific scenarios. Note: task metadata edits are frozen during active runs (see detail panel section). "Adjust" means pipeline control actions (pause/cancel/descope), not task content edits — those require the run to be in a terminal state first.

**Pause:** Stops scheduling new tasks. In-flight Claude processes finish their current turn (cooperative pause — no clean way to kill `claude -p` mid-thought). Immediate — no confirmation needed since it's non-destructive. **Resume:** Picks up where it left off. Immediate — no confirmation. **Cancel:** Stops everything; current tasks finish their turn, then stop. Requires confirmation (click-twice pattern: first click shows "Are you sure?", second click confirms). **Descope:** Removes a `blocked` task from the active milestone so the run can proceed without it. Server-side descope only accepts tasks with `pipelineStage === "blocked"` — no other stages are eligible. Requires confirmation (same click-twice pattern). Both Cancel and Descope are destructive — they permanently alter the run.

**Non-terminal milestone states** (referenced throughout this spec): `running`, `pausing`, `paused`, `awaiting_approval`, `cancelling`. Any rule that says "while a milestone is in a non-terminal state" applies to ALL five of these. This is the canonical list — do not enumerate a subset.

## Component Design

### Swimlane milestone header
A full-width bar at the top of each milestone row. Contains:

- Collapse/expand chevron
- Milestone name (e.g., "MILE-001: Auth System")
- Status badge (see milestone state machine below)
- Progress count: "4/7 tasks"
- Cost: total spend for this milestone
- Contextual controls (see milestone state machine below)

### Milestone state machine

| State | Badge | Controls | Transitions to |
|---|---|---|---|
| `not_started` | "Not Started" (gray) | **Start** (disabled if any milestone is in a non-terminal state) | `running` |
| `running` | "Running" (blue) | **Pause**, **Cancel** (with confirmation) | `pausing`, `awaiting_approval`, `cancelling` |
| `pausing` | "Pausing..." (yellow, pulsing) | none | `paused` |
| `paused` | "Paused" (yellow) | **Resume**, **Cancel** (with confirmation) | `running`, `cancelling` |
| `awaiting_approval` | "Review" (amber) | **Approve**, **Cancel** (with confirmation) | `completed`, `cancelling` |
| `cancelling` | "Cancelling..." (red, pulsing) | none | `cancelled` |
| `completed` | "Done" (green) | none | terminal |
| `cancelled` | "Cancelled" (red) | none | terminal |

**Drain states:** Both pause and cancel involve cooperative drain — in-flight Claude processes finish their current turn before stopping. To avoid race conditions:

- **Pausing:** When Pause is triggered, the milestone enters `pausing` (non-terminal drain state, no controls exposed). Once all workers have drained, it transitions to `paused` which exposes Resume/Cancel. Resume is only available after full quiescence.
- **Cancelling:** When Cancel is triggered, the milestone enters `cancelling` (non-terminal drain state, no controls exposed). Once all workers have drained, it transitions to terminal `cancelled`.

Both `pausing` and `cancelling` are non-terminal states that block other milestone starts. The UI shows pulsing badges ("Pausing..." / "Cancelling...") with no action controls during drain.

The pipeline backend drives transitions. The UI renders controls based on current state. If all tasks complete or reach human-review, the milestone transitions to `awaiting_approval`. If blocked tasks prevent completion, the milestone stays `running` (or `paused`) — the blocked badge on the header indicates the issue without needing a separate milestone-level blocked state.

### Milestone accounting for descoped/cancelled tasks

Descoped and cancelled tasks are **excluded** from the milestone's progress denominator and approval gating:

- A milestone with 7 tasks where 2 are descoped shows "4/5 tasks" (not "4/7")
- Approval eligibility checks only count active (non-descoped, non-cancelled) tasks
- The milestone header shows a **mandatory** count of removed tasks: "{n} removed" (not "descoped" — this covers both descoped and cancelled tasks truthfully). Clicking the count expands a collapsed audit row within the swimlane showing each removed task with its title, removal type (descoped vs cancelled), and the stage it was in when removed. This ensures destructive task removal is reviewable before and after approval — a milestone that looks "complete" can be inspected for what was dropped

**Removed-task persistence:** When a task is descoped or cancelled, the backend persists removal metadata to the task file: `pipelineStage` set to `descoped`/`cancelled`, `removedFromStage` (the stage it was in at removal time), and `removedAt` (ISO timestamp). The default `scanProjectTasks` query continues to exclude removed tasks (preserving the existing contract for all other consumers). The pipeline board uses a separate `includeRemoved=true` query parameter to also fetch descoped/cancelled tasks for the audit row. This keeps the shared task-scan contract stable while giving the pipeline board access to removal history.
- **Zero-active-task invariant:** If all tasks in a milestone are descoped or cancelled (active count drops to zero), the milestone auto-transitions to `cancelled` — but only after the backend confirms no workers are still running. If workers are draining (milestone is in `cancelling` or `pausing`), the zero-task check waits for drain to complete before transitioning to terminal `cancelled`. This prevents premature terminal transitions that would unblock other milestones while old workers are still finishing

Collapsed state: one line — name, status badge, progress count, and descoped count badge (if any tasks were descoped/cancelled). The descoped count remains visible and clickable in both expanded and collapsed states so destructive removals are never hidden from the user.

### Pipeline-native task cards
Cards show different detail levels depending on their stage:

- **Backlog / Queued:** Minimal — title, priority badge. Nothing has started yet.
- **Build:** Active — title, pulsing activity text ("writing tests..."), branch name, cost so far. Border tint matches column color.
- **AI Review:** Similar to Build — title, review activity text ("reviewing..."), branch name.
- **Human Review:** Title, branch name, total cost. Should feel like it's asking for attention — slightly more prominent border or visual weight.
- **Done:** Faded — title, final cost. Completed work recedes visually so active work stands out.
- **Blocked:** Red border/background tint, blocked reason text, Descope button directly on the card. Stays in whatever column it was stuck in.

### Extended detail panel
Clicking any card opens the existing slide-out side panel, extended with a pipeline section:

- Current pipeline stage
- Branch name
- Cost (running or final)
- Activity log / current activity text
- Blocked reason (if applicable)

**Task metadata editing rules:**
- **Any task belonging to an active milestone run:** all editing is **frozen**, regardless of current `pipelineStage`. This is a **system invariant, not just a UI behavior**. The server-side task update endpoint (`PUT /api/tasks/:id`) must reject metadata mutations (title, body, priority, labels) for any task whose parent milestone is in a non-terminal state (see canonical list in Human Intervention Controls), returning 409 with an explanation. The detail panel disables editing as a UI convenience, but the server enforces it. This covers all edit entrypoints (detail panel, any future API consumers, direct API calls).
- **Tasks not part of any active run:** editable (title, body, priority, labels). This includes tasks in milestones that are `not_started`, `completed`, or `cancelled`.
- **Status editing is removed entirely** from the pipeline board's detail panel. The `status` field is not used — column position is determined solely by `pipelineStage`. The pipeline section is always read-only.

### SSE integration
Cards update in real-time as the pipeline emits events. The existing `usePipelineEvents()` hook invalidates React Query caches on stage changes. A connection indicator (small dot) shows SSE status — visible but not prominent.

**SSE failure handling:** When the SSE connection drops, the board must:
1. Show a visible degraded-state banner ("Live updates disconnected — data may be stale") in the board header area. Not a tiny dot — a noticeable but non-blocking indicator.
2. Trigger a full task data refetch (invalidate both `pipeline/status` and `tasks` queries), not just pipeline status. This ensures cards reflect current state even without live events.
3. While disconnected, enable sustained polling: both `pipeline/status` AND `tasks` queries poll on a 5-second interval. This prevents the board from silently drifting stale during an extended outage.
4. SSE auto-reconnect is deferred. Degraded mode persists until the user refreshes the page. The banner text reflects this: "Live updates disconnected — refresh to restore." No false promise of automatic recovery.

## What gets removed

- **Board setup wizard** (`BoardSetup` component) — no per-project column configuration. Pipeline stages are fixed.
- **Configurable columns** — `config.statuses` and `config.columnOrder` no longer drive the board. Columns are hardcoded pipeline stages.
- **Drag-and-drop** — remove `@dnd-kit` usage from the board entirely. No `DndContext`, no sortable, no drag overlays.
- **Project-picker-as-primary-nav** — the project picker stays for selecting which project to view, but it's no longer the entry point to a per-project board setup flow.
- **Generic `TaskCard` drag handles** — the grip icon and sortable wrapper go away.

## Empty and error states

### Empty board (no milestones)
When a project has no milestones or tasks, the board shows an empty state with:
- A brief explanation: "No milestones found for this project"
- Guidance: "Create a plan document and run plan-to-roadmap to populate this board"
- This replaces the old board-setup wizard — there's nothing to configure, the user needs to create content.

### Empty milestone (no tasks)
A milestone with no child tasks shows a collapsed header with "0 tasks" and no Start button.

### Loading state
Standard spinner while task data loads. Same pattern as current implementation.

### Scan/parse failures
If the task scanner fails or returns malformed data, show the malformed count indicator (already exists in current UI) and render whatever valid data was loaded. Don't crash the board.

## Test project script

A shell script `scripts/load-test-tasks.sh` that creates a standalone dummy project for testing the board without cluttering agent-cc:

- Creates a minimal git repo at a temp/test location (e.g., `~/dev/test-projects/pipeline-test`)
- Writes markdown task files in `plan-to-roadmap` format: 1 milestone, 5-6 tasks with varying types
- Uses fixed IDs so it's idempotent (running twice doesn't duplicate)
- Registers the project in Agent CC's entity store so the project picker finds it
- Companion `scripts/clear-test-tasks.sh` to remove the test project and its files

## Scope boundaries

NOT building in this iteration:

- No manual drag-and-drop (between or within columns)
- No configurable columns — pipeline stages are fixed
- No board-setup wizard
- No parallel milestone execution (UI supports it visually; backend doesn't yet)
- No resume-with-rescan (resume replays original task list; re-scanning changed tasks from disk is a backend enhancement)
- No live log streaming in the detail panel (just activity text from pipeline events)
- No SSE auto-reconnect (polling fallback + full refetch on disconnect covers it)
- No role-based access control — single-user tool, all controls available to whoever opens the board

## Existing code affected

**Replace:**
- `client/src/components/tasks/kanban-board.tsx` — rewrite as pipeline-stage board with swimlanes
- `client/src/components/tasks/task-card.tsx` — remove drag, add stage-aware rendering
- `client/src/components/tasks/milestone-controls.tsx` — move controls into swimlane headers
- `client/src/pages/tasks.tsx` — restructure around pipeline-first layout

**Remove:**
- `client/src/components/tasks/board-setup.tsx` — no longer needed
- `client/src/components/tasks/inline-create.tsx` — tasks come from plan-to-roadmap, not inline creation
- DnD-related imports and logic throughout

**Keep / extend:**
- `client/src/components/tasks/task-detail-panel.tsx` — extend with pipeline section
- `client/src/components/tasks/pipeline-card-overlay.tsx` — absorb into the new stage-aware card design, then remove as a separate component
- `client/src/hooks/use-pipeline.ts` — all hooks stay, already wired to the right endpoints
- `client/src/hooks/use-tasks.ts` — keep for reading task data
- `client/src/components/tasks/kanban-column.tsx` — likely rewrite but same concept
- `client/src/components/tasks/project-picker.tsx` — stays as-is

**New:**
- `scripts/load-test-tasks.sh` — test data loader
- `scripts/clear-test-tasks.sh` — test data cleanup
