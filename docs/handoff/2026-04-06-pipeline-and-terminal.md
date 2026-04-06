# Pipeline & Terminal — Brainstorm Handoff

## What We're Doing

Two features for agent-cc, inspired by studying Aperant (an open-source project that solves similar problems):

1. **Task automation pipeline** — when a task is ready, AI works on it automatically
2. **Terminal reliability** — terminal stops dying on page refresh

## Background

### What is agent-cc?
A web dashboard (runs on our devbox, accessible via browser) for managing Claude Code sessions. Has a kanban board where tasks are markdown files, a terminal, and some AI-powered features like session summaries.

### What is Aperant?
An Electron desktop app (formerly "Auto Claude") that automates coding tasks through a kanban-to-AI pipeline. Licensed AGPL-3.0 — we can study their ideas but must write our own code.

### Full comparison report
`~/dev/projects/aperant/REVIEW-REPORT.md` — detailed feature-by-feature analysis with code references.

## Feature 1: Task Automation Pipeline

### What Aperant does
When you drag a task card to "queue", their app automatically:
1. **Assesses complexity** — is this a simple fix or a complex feature?
2. **Generates a spec** — AI writes a detailed specification
3. **Plans implementation** — AI creates a step-by-step plan
4. **Writes the code** — AI executes the plan
5. **Reviews quality** — AI checks its own work
6. **Reports back** — task moves to "human review" for you to approve

Each step is a separate AI call with a specific role (planner, coder, reviewer). Progress shows on the kanban card in real-time.

They built their own AI engine to do this — it runs inside the app, manages AI connections directly, and coordinates everything with custom code.

### What we want
The same concept but adapted for agent-cc. The key question to brainstorm:

**Option A: Use Claude Code as the engine**
- Our app tells Claude Code CLI to work on a task
- Claude Code already knows how to read files, write code, run tests, etc.
- We don't build an AI engine — we just orchestrate Claude Code sessions
- Simpler to build, but each call uses your Claude subscription
- Less control over exactly what happens during execution

**Option B: Build our own engine (like Aperant)**
- Call AI APIs directly from our app using an SDK
- Define our own tools (read file, write file, run command)
- Full control over what the AI can do and how much it costs
- Much more complex to build — essentially building what Claude Code already is

**Option C: Hybrid**
- Start with Option A (simple, works now)
- Add Option B capabilities later if needed

### What we already have that helps
- Task board with markdown files (the tasks already exist)
- A helper that can run Claude from the command line
- Real-time event streaming (how the scanner sends updates to the browser)
- Terminal that can spawn processes

### Open questions for brainstorming
- Do we want full automation (drag to queue → AI takes over) or semi-automation (click "run" on a task)?
- How much should the AI do per run? Full spec-to-code, or one step at a time?
- How do we show progress on the kanban card?
- What happens when AI gets stuck or makes a mistake?
- Cost implications — each pipeline run will use Claude tokens. How do we keep this manageable?

## Feature 2: Terminal Reliability

### Current problems
- **Page refresh kills terminals** — refreshing the browser kills all running terminal processes
- **No scrollback** — terminal history is lost when you navigate away and come back
- **No reconnection** — if the connection drops, the terminal is gone

### What Aperant does differently
- Terminal processes survive independently of the browser window
- Terminal output is buffered on the server (so you can reconnect and see history)
- Disconnections have a grace period — the terminal waits before shutting down

### What we need to fix
1. Don't kill terminal processes when the browser disconnects — give them a 60-second grace period to reconnect
2. Keep a buffer of recent terminal output on the server — replay it when reconnecting
3. Allow the browser to reconnect to an existing terminal instead of always creating a new one

### These are standard fixes
This isn't proprietary technology — it's standard practice for web-based terminals (VS Code's terminal works this way, as does any SSH client). No licensing concerns.

## Licensing Summary

- Aperant is **AGPL-3.0** — we can study their architecture and build our own version
- We must write our own code, not copy theirs
- The pipeline concept (task → spec → build → review) is a general pattern, not proprietary
- Terminal persistence patterns are standard infrastructure, no concerns
- Their agent prompts (the specific text instructions for each AI role) are copyrighted — we'd write our own

## How to Resume

```
Read docs/handoff/2026-04-06-pipeline-and-terminal.md, then brainstorm Feature 1 (task automation pipeline) first. Start by understanding what approach makes sense for the user's skill level and goals — they're learning development through AI tools, not a traditional programmer. Keep it practical.
```
