# Unified Capture — Phase 4 pickup

**Branch:** `feature/unified-capture`
**Last commit:** `d72c672` — task007 (InteractionEventRenderer)
**Suite:** 5734/5734 passing, 165 files, `npm run check` clean, tree clean
**Milestone:** 4/9 tasks remaining (Phase 4 next)

## What's already landed (Phases 1–3)

| Task | Commit | What it is |
|---|---|---|
| task001 | `dec7d57` | `InteractionEvent` discriminated union in `shared/types.ts` + helpers |
| task009 | `b0e8782` | SSE test determinism (race-fix carry-over from chat-skeleton) |
| task002 | `11498ad` | `server/interactions-db.ts` — SQLite bootstrap, schema, migrations |
| task003 | `ea35d06` | `server/interactions-repo.ts` — typed data access layer |
| task007 | `d72c672` | `client/src/components/chat/interaction-event-renderer.tsx` (rewritten) |

Phase 3 note: task007's original contract was wrong (assumed ConversationViewer contained inline sub-renderers — it doesn't, they live in `client/src/components/analytics/messages/bubbles/`). Subagent correctly stopped, orchestrator rewrote the contract to Reading #1 (new renderer for new chat surface, no ConversationViewer touch, designed fresh against the `InteractionContent` union). The rewritten contract is in `.claude/roadmap/unified-capture/unified-capture-task007.md`. If the question "why didn't task007 extract from ConversationViewer?" comes up later — answer: because ConversationViewer is 1274 lines of fetch/filter/search/nav scaffolding that dispatches rendering to 6 separate bubble files, and `TimelineMessage → InteractionEvent` is lossy (loses `model`, `isSidechain`, `commandName`, etc.).

## Next up — Phase 4 (parallel pair)

Per `.claude/roadmap/TASK.md`:

| Task | Status | Files | Notes |
|---|---|---|---|
| task004 — Chat write path persists events | pending | `server/routes/chat.ts` (POST handler) | Adds event persistence on POST; depends on task003 |
| task005 — Chat load API endpoints | pending | `server/routes/chat.ts` (GET handler) | New load endpoints; depends on task003 |

**Parallelism note from TASK.md:** both touch `server/routes/chat.ts` but add disjoint handlers (POST write path vs GET load). Plan says "if conflict emerges at staging, stagger; otherwise parallel." Expected clean — the POST handler is already there from chat-skeleton task003, task004 adds persistence into it, task005 adds new endpoints below it.

**Dispatch command (fresh session):** read `.claude/roadmap/unified-capture/unified-capture-task004.md` + `unified-capture-task005.md`, verify tree clean + branch `feature/unified-capture`, cascade both to `in_progress`, dispatch as parallel pair via `/work-task`.

## Follow-up flags (not blocking Phase 4 — review at milestone close)

1. **3 high-severity npm audit findings** landed with `better-sqlite3` install in Phase 2 — likely transitive through `prebuild-install` or its deps. Run `npm audit` review at milestone close.
2. **`better-sqlite3` is a native module.** `scripts/deploy.sh` may need `npm rebuild better-sqlite3` if the devbox Node version ever shifts. Not needed today.
3. **`SystemContent.data` rendering deferred** — task007's `SystemNote` renders `text` + `[subtype]` only. A typed dispatcher per subtype (`workflow_step` / `hook_fire` / `info`) is a later-milestone concern.
4. **`chat-panel.tsx` SSE handler hard-codes `chunk.type === 'text'`** — task006 (chat store React Query integration) must grow that branching alongside the store rewire when richer `InteractionEvent` types start flowing.
5. **Vitest config extended to `shared/**/*.test.ts`** in task001 — client still excluded, documented in `vitest.config.ts`, no surprises.

## To resume next session

```
1. Read this file (/home/tron/dev/projects/agent-cc/docs/handoff/2026-04-15-unified-capture-phase4.md)
2. Verify branch: git checkout feature/unified-capture && git status
3. Run suite + typecheck to confirm baseline: npm test && npm run check (expect 5734/5734)
4. Invoke /work-task and dispatch Phase 4 (task004 + task005 as parallel pair)
```

Delete this file once Phase 4 lands.
