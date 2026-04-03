# Phase 1: Fix What's Broken

**Date:** 2026-04-03
**Status:** Approved
**Context:** Phase 0 cleanup is done. Now we fix the bugs that make the app unreliable.

---

## Goal

Fix the 6 issues identified in AUDIT.md that prevent the app from working correctly: project discovery, session tracking, live view stats, trash persistence, and user feedback.

---

## 1. Fix Project Discovery

**Problem:** Projects page often returns empty. Extra scan paths added via Settings don't trigger a rescan, and `~/` paths aren't expanded to the real home directory.

**Fix:**
- In `server/scanner/utils.ts`: expand `~/` and `~` prefixes to `os.homedir()` in `getExtraPaths()` before returning paths
- In `server/routes/settings.ts`: after saving `scanPaths`, invalidate the project discovery cache so the next API call picks up the new paths immediately
- In `server/scanner/utils.ts`: clear the `cachedProjectDirs` cache when settings change (export a `clearProjectCache()` function)

**Verification:** Add a path via Settings, hit the Projects page — projects appear without restarting the server.

---

## 2. Fix Session Status Detection (Stale Sessions)

**Problem:** Sessions are marked "active" based on file existence alone. Crashed sessions leave stale `.json` files in `~/.claude/sessions/`, showing phantom active sessions. Sessions idle >10min show as "stale" even when the process is alive.

**Fix:**
- In `server/scanner/live-scanner.ts`: after reading each `.json` session file, extract the PID and check if the process is running using `process.kill(pid, 0)` (signal 0 = existence check, doesn't kill anything)
- If the process is dead: ignore the session (don't show it in Live View), optionally clean up the stale `.json` file
- If the process is alive but file mtime is old: show as "waiting" (not "stale")

**Verification:** Kill a Claude Code process manually — Live View stops showing it within one poll cycle (3 seconds).

---

## 3. Fix Session Continuation (findSessionFile Fallback)

**Problem:** `findSessionFile()` in `live-scanner.ts` has a comment describing fallback logic for context-compacted sessions, but the code only does exact ID matching. When Claude creates a new session ID after compaction, Live View shows "no history."

**Fix:**
- In `server/scanner/live-scanner.ts`: implement the fallback described in the comment — when exact match isn't found or is stale (>5 min old), find the most recently modified JSONL in the same project directory and use that
- This covers the common case where context compaction creates a new JSONL with a different session ID

**Verification:** Start a long session that triggers compaction — Live View still shows session history and context usage after the session ID changes.

---

## 4. Fix Live View Stats Mismatch

**Problem:** "X agents today" counts from the agent-scanner cache (refreshed every 30s), while "models in use" only counts models from currently active agents. This causes mismatches like "24 agents today, 0 models used."

**Fix:**
- In `server/scanner/live-scanner.ts`: change `modelsInUse` to collect models from today's agent executions (same data source as `agentsToday`), not just from live active agents
- This makes both stats pull from the same cache, so they're always consistent

**Verification:** After running several agents, the "models used" count matches what you'd expect from the agent activity.

---

## 5. Fix Trash Location

**Problem:** Deleted sessions go to `/tmp/claude-sessions-trash`. The OS clears `/tmp` on reboot, which silently breaks the undo feature.

**Fix:**
- In `server/config.ts`: change `TRASH_DIR` from `os.tmpdir()` to `~/.claude-command-center/trash/`
- This survives reboots and is easy to find for manual cleanup

**Verification:** Delete a session, reboot, undo still works. `ls ~/.claude-command-center/trash/` shows the trashed files.

---

## 6. Add Toast Notifications

**Problem:** Every mutation (delete, save, rescan) gives zero visual feedback. Users can't tell if an action succeeded or failed.

**Fix:**
- Install `sonner` (lightweight, zero-config toast library, ~3KB)
- Add `<Toaster />` component to `client/src/App.tsx`
- Add success/error toasts to all mutation hooks in:
  - `client/src/hooks/use-sessions.ts` (14 mutations: delete, bulk delete, undo, summarize, pin, notes, etc.)
  - `client/src/hooks/use-settings.ts` (settings save)
  - Any other mutation hooks that trigger async operations
- Pattern: `onSuccess` → `toast.success("Session deleted")`, `onError` → `toast.error("Failed to delete session")`

**Verification:** Delete a session — see a toast confirming it. Trigger an error (disconnect server) — see an error toast.

---

## Out of Scope (Deferred to Phase 2)

| Item | Why |
|------|-----|
| New test coverage for scanners | Phase 2: Harden |
| Path traversal security fix | Phase 2: Harden |
| MCP secret redaction fix | Phase 2: Harden |
| Error boundaries on all pages | Phase 2: Harden |
| Deep search improvements | Phase 2: Harden |

---

## Success Criteria

- [ ] Projects page discovers projects from extra scan paths without server restart
- [ ] Live View doesn't show phantom sessions from dead processes
- [ ] Live View shows session history after context compaction
- [ ] "Agents today" and "models used" pull from the same data source
- [ ] Deleted sessions survive a reboot in `~/.claude-command-center/trash/`
- [ ] All mutations show success/error toast notifications
- [ ] All existing tests still pass
- [ ] No regressions in Live View, Sessions, or Settings pages
