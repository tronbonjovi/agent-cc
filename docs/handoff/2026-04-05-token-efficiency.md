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

## What's Still Open

### Session Length Strategy
- Agreed that handoff notes (like this one) solve the "all or nothing" context problem
- Need to define concrete habits: when to wrap up, how to measure, what signals to watch
- Agent CC feature opportunity: surface session health metrics, suggest wrap-up timing

### Model Routing
- Opus runs everything by default, Sonnet/Haiku configured for subagents only
- Need strategy for when to use /model to switch mid-session
- Or: should certain task types auto-route to cheaper models?

### Tool Call Discipline
- Claude tends to make speculative/redundant tool calls (5 globs when 1 targeted read would do)
- Each round-trip re-sends full context — fewer calls = significant savings
- Need concrete guidance in CLAUDE.md or feedback memory

### Agent CC Feature Vision
- Dashboard for managing agents/plugins/skills (enable/disable, usage stats, token cost)
- Session health monitoring (token spend, turn count, context utilization)
- "Good time to hand off" prompts based on session metrics
- This connects to the broader Agent CC roadmap as a workspace management tool

## How to Resume
Start next session with: "Let's continue the token efficiency work — read docs/handoff/2026-04-05-token-efficiency.md"
