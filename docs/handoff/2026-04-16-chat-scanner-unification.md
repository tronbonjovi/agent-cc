# Chat–Scanner Unification — Handoff

**Date:** 2026-04-16
**Status:** Spec + roadmap ready, no implementation started

## Context

The chat system was built as a parallel data world (SQLite, InteractionEvent, ingester) instead of extending the scanner. User identified this as an architectural misstep. Decision: rip it out and make chat sessions flow through the existing JSONL scanner pipeline.

## What Was Done

- Design spec: `docs/superpowers/specs/2026-04-16-chat-scanner-unification-design.md`
- Roadmap: `.claude/roadmap/chat-scanner-unification/` (5 tasks, 4 phases)
- ROADMAP.md, MILESTONE.md, TASK.md all updated
- CHANGELOG.md updated

## How to Resume

Start with `/work-task` — milestone `chat-scanner-unification` is ready for execution. Branch before any work: `feature/chat-scanner-unification`.

## Open Questions from Spec

1. Session ID capture — need to confirm CLI `stream-json` init envelope contains the session ID
2. Conversation sidebar — needs redesign after InteractionSource removal
3. Scanner refresh timing — may need a rescan trigger after chat sessions end
