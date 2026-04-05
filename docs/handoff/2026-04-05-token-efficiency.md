# Token Efficiency Strategy — In Progress

## Context
User noticed 37K tokens used in just 2 messages. Audited the full Claude Code setup and found massive system prompt bloat from 192 agents, 17 plugins, and unused MCP servers loaded on every turn.

## What We Did This Session

### Agent Library (DONE)
- Created `~/.claude/library/agents/` as archive
- Moved 183 unused agents out of `~/.claude/agents/`
- Kept 9 active agents (all engineering): backend-architect, code-reviewer, devops-automator, frontend-developer, rapid-prototyper, security-engineer, senior-developer, software-architect
- Before: 192 agents, ~2.1 MB per turn. After: 9 agents, ~76 KB per turn
- Library README at `~/.claude/library/README.md` documents everything

### Plugin Trimming (DONE)
- Disabled 5 plugins: frontend-design, ralph-loop, skill-creator, security-guidance, claude-code-setup
- Kept 11: superpowers, context7, playwright, codex, commit-commands, feature-dev, code-review, code-simplifier, claude-md-management, typescript-lsp, pr-review-toolkit
- code-simplifier and pr-review-toolkit flagged as underused — should be triggered more

### MCP Servers (DONE)
- Removed Gmail, Google Calendar, Excalidraw, Cloudflare connections from claude.ai app
- context7 and playwright remain (heavily used)
- Microsoft Learn — check if still connected, was never used

## Decisions Made (2026-04-05, session 2)

### Model Routing — CLOSED
- Opus stays default for all interactive work. Sonnet/Haiku for subagents only.
- Switching models mid-session has more friction than value. No action needed.

### Tool Call Discipline — DONE
- Added `## Tool Call Efficiency` section to CLAUDE.md (4 rules, concise)
- Feedback memory already existed, now backed by durable CLAUDE.md guidance
- Key principle: targeted reads over speculative globs, batch independent calls

### Session Length Strategy — Direction Set
- Three non-competing layers identified:
  - **CLAUDE.md / memories** = behavioral guardrails for Claude (how it works)
  - **Agent CC features** = observability for the user (context bar, threshold indicators)
  - **Handoff notes** = escape valve for long sessions (graceful wrap-up)
- Agent CC feature: session health indicators — BUILT AND DEPLOYED (context %, message count, cost with configurable thresholds)

### Agent CC Feature Vision — Captured
- Full UI/UX rework brainstormed: nav consolidation, sessions rework, visual cleanup
- Session health indicators are part of this, not a standalone feature
- Detailed notes saved in project memory (project_ui_rework_vision.md)
- Next step: brainstorm + plan when ready to implement the UI rework

## What's Still Open
- Full UI/UX consolidation (workspace/config/tools nav restructure) — see project_ui_rework_vision.md
- Visual pass to unify branding, remove leftover neon colors
- Audit baked-in help menus and AI features
