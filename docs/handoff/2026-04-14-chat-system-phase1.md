# Handoff — Integrated Chat System, starting Phase 1

**Date:** 2026-04-14
**Context:** Roadmap built, starting implementation in the next session.

## What was done this session

- Fleshed out the Archon-style integrated chat system design (extending the draft at `.claude/roadmap/drafts/2026-04-14-integrated-chat-system.md`)
- Resolved the four parked questions from the draft:
  - **Layout:** right-side resizable chat panel, terminal constrained to center column (VS Code pattern)
  - **Chat vs scanner overlap:** unified capture pipeline — scanner becomes an ingester, SQLite `interactions.db` stores all events with source tagging
  - **Multi-conversation UX:** tabbed chats with persisted state
  - **Cost tracking:** by-source dimension with AI-vs-deterministic savings card
- Grounded the parked questions against Archon's actual patterns (chat is AI-only, workflows hold deterministic ops, hooks inline, SQLite unified data layer)
- Built the full roadmap via `/build-roadmap`: 5 milestones, 37 tasks, phases and dependencies
- Every task contract includes a `contextBudget` block targeting 200-250k tokens per dispatched subagent session
- Identified two risk points and mitigated:
  - **M2-task007** made additive — extracts `InteractionEventRenderer` as a new component while `ConversationViewer` stays as a thin wrapper, so existing Sessions/Messages callers don't break
  - **M3** gained `SCANNER_BACKEND=legacy|store` dual-path, parity test gate (task007), and an explicit default-promotion + cutover task (task008)

## Where to find everything

All roadmap artifacts are in `.claude/roadmap/` (gitignored — local working state):

- `ROADMAP.md` — updated with 5 new active milestones
- `MILESTONE.md` — descriptions and task lists
- `TASK.md` — phases, dependencies, parallelism caps, project-wide context-budget discipline preamble
- `.claude/roadmap/chat-skeleton/` — 7 task contracts (Phase 1 starting point)
- `.claude/roadmap/unified-capture/` — 8 task contracts
- `.claude/roadmap/scanner-ingester/` — 8 task contracts (highest-risk milestone, dual-path + parity gate)
- `.claude/roadmap/chat-workflows-tabs/` — 8 task contracts
- `.claude/roadmap/chat-import-platforms/` — 6 task contracts

## Execution rules baked into every milestone

- **Context budget:** each task sized to ~200-250k tokens per subagent session (hard ceiling 300k)
- **One orchestrator session per milestone** — max ~8 tasks per milestone keeps orchestrator under 250k too, no mid-milestone handoffs
- **Parallel dispatch cap:** 2 concurrent subagents per phase (git staging race avoidance)
- **Strict chain:** milestones must run in order, branch per milestone (`feature/<milestone-name>`)

## How to resume next session

1. Start a fresh Claude Code session
2. Read this handoff note
3. Read `.claude/roadmap/chat-skeleton/` task contracts (especially task001, task002, task004 — the parallel-pair + solo trio that form Phase 1)
4. Create the branch: `git checkout -b feature/chat-skeleton`
5. Dispatch Phase 1 via `/work-task` — the skill will pick up the task files and propose dispatches

## Open questions parked for later

- None. All questions from the draft were resolved in this session.

## Notes on the plan

- Chat skeleton is pure addition (no scanner risk). User explicitly verified the plan doesn't break the scanner at any phase.
- M3 is the highest-risk milestone because it swaps scanner's data source. Do NOT skip task007 parity gate before task008 cutover.
- M2-task007 is the risky touch user flagged — visual parity on Sessions/Messages is a hard requirement; manual smoke check required.

## Delete this file when

The first chat-skeleton task lands on main (i.e. when Phase 1 starts executing and this handoff becomes stale).
