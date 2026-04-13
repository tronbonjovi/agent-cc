# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Codebase cleanup Phase 4 — config cleanup, test audit, strict TS flags (milestone complete)** — single commit on `feature/codebase-cleanup` closes the `codebase-cleanup` milestone at 8/8 tasks. **task008 (commit `2433159`)** bundles three threads. **Part 1 — config deletion:** removed `.github/workflows/release.yml` (triggered on `v*` tags, blocked by `"private": true` in `package.json`), `.github/workflows/scorecard.yml` (OSSF Scorecard is a public-OSS tool, useless on a private repo), `scripts/load-test-tasks.sh` and `scripts/clear-test-tasks.sh` (referenced the removed pipeline feature and used stale `.claude/tasks/` paths predating the `.claude/roadmap/` restructure), and `.update-prefs.json` (orphan `{enabled, autoUpdate, dismissedCommit}` config left behind by the deleted auto-updater — `server/routes/update.ts`'s `loadPrefs()` gracefully falls back to defaults when the file is absent, and `savePrefs()` recreates it on first user write; the file is in `.gitignore` so the recreation is invisible to git). Also removed the `/api/tasks` orphan cache key from `client/src/lib/queryClient.ts:4`'s `invalidateDataQueries` — no backend endpoint matches (only `/api/board/tasks/*` exists). Kept `.github/workflows/ci.yml`, `codeql.yml`, and `dependency-review.yml` (actively used). **Part 2 — test audit:** zero tests deleted, with documented reasoning for every kept file. Suspected duplicate pairs verified disjoint — `library-tab-migration.test.ts` asserts the vertical-TierHeading→sub-tab design invariant (single describe block), `library-tabs-migration.test.ts` asserts 7 granular blocks covering component existence, tab rendering, and route redirects; `sessions-tabs.test.ts` does not exist (contract was speculative — only singular `sessions-tab.test.ts` is present). All 13 `library-*.test.ts` and 6 `analytics-*.test.ts` files contain only historical comments referencing deleted files, not live imports or `fs.existsSync` pins — `git grep -l "health-indicator\|board-filters\|session-analytics-panel" tests/` returns matches only in comment strings, no dependencies. `phase1-fixes.test.ts` kept because it pins meaningful production invariants: `getExtraPaths()` tilde expansion, `isProcessAlive()` PID semantics, `findSessionFile()` fresh-vs-stale fallback, `getLiveData().stats.modelsInUse` array type, `TRASH_DIR` under home dir. **Part 3 — strict TS flags:** `tsconfig.json` now has `noUnusedLocals: true` and `noUnusedParameters: true`. Full diagnostic pass dropped from 88 errors across ~50 files to 0 in one pass — well under the 500-threshold deferral trigger the contract anticipated, so both flags shipped together instead of splitting. Zero `@ts-ignore` / `@ts-expect-error` / `eslint-disable` escape hatches introduced. Unused parameters required by interface/callback signatures prefixed with `_`; genuinely dead locals, imports, and exported functions deleted outright. Larger sweeps: `client/src/hooks/use-scanner.ts` dropped the dead `useScannerStatus` hook (task007 had flagged it out-of-scope but allowed deletion "if surfaced naturally" by the strict pass — it was, and the deletion is clean with zero consumers); `client/src/components/library/mcps-tab.tsx` and `skills-tab.tsx` dropped orphaned `handleCopyCommand`/`handleOpenSource`/`handleCopy`/`handleEdit` handlers that wrote to state nothing read back (the copy-to-clipboard UX now lives inside `EntityCard`'s `actions` prop via the `copiedId` state that remains); `client/src/components/board/board-task-card.tsx` dropped trailing `priorityColors`/`LastSessionSnapshot` constants plus several unused icon/helper imports — all JSX-rendered icons (`AlertTriangle`, `Bot`, `User`, `MessageSquare`, `Clock`, `Activity`, `DollarSign`) verified as still exercised by the component body. The two pre-existing `eslint-disable-next-line @typescript-eslint/no-unused-vars` comments in `client/src/components/analytics/sessions/TokenBreakdown.tsx` (lines 52, 95) suppress ESLint on `_userMessages` parameters that are already `_`-prefixed per TS convention — correct and pre-existing, not a workaround introduced by this task. Test suite remains **5,553 tests across 152 files** (no net change from Phase 3), `npm run check` clean with strict flags enabled, `npm run build` passes, pre-commit safety hook passes. Reviewer verdict PASS with no issues, no scope creep, no `CHANGELOG.md`/`CLAUDE.md`/`MILESTONE.md` edits from the subagent (those are wrap artifacts on this commit). **Milestone `codebase-cleanup` complete (8/8 tasks)** — Phase 1 deleted ~2,000 LOC of dead pages and orphan files, Phase 2 consolidated formatters and session-health mapping into shared modules, Phase 3 standardized server error responses and fixed structural/naming drift, Phase 4 closed the loop with config cleanup and strict unused-symbol enforcement. The milestone shipped on `feature/codebase-cleanup` as 8 refactor commits + 4 docs wrap commits, opened as a single PR. (codebase-cleanup-task008)

- **Codebase cleanup Phase 3 — structural fixes + server error handling** — two commits on `feature/codebase-cleanup` complete the planned Phase 3 work. **task007 — structural and naming fixes (commit `2fec969`):** renamed `server/routes/discovery.ts` → `discover-github.ts` (single import site at `server/routes/index.ts:7` updated) to end the one-letter twin-route confusion with `server/routes/discover.ts`; renamed the nested local `DiscoverTab` function in `client/src/components/library/agents-tab.tsx:475` → `AgentsDiscoverTab` so only one `DiscoverTab` identifier exists in the client tree (the canonical top-level `components/discover-tab.tsx`); moved `client/src/pages/prompts-panel.tsx` → `client/src/components/library/prompts-panel.tsx` via `git mv` so location matches intent (it's a component, not a route page), updated the import in `library.tsx:12` and the pinned path in `tests/messages-tab.test.ts:151`; created `shared/pricing.ts` with the canonical 4-field `MODEL_PRICING` record + `ModelPricing` interface, updated `server/scanner/pricing.ts` to import from shared and re-export the type, and rewrote `APIEquivalentValue.tsx` to derive its local 2-field `PRICING` array from the shared table via `Object.entries` (preserves insertion order, the 70/30 estimate ratio, and the client-side `.toLowerCase()` normalization); fixed three stale comment references pointing at archived paths — `server/scanner/session-tree-builder.ts:6` spec link removed, `client/src/hooks/use-scanner.ts:85` ScannerBrain reference replaced with an "unused in current UI" note, `client/src/components/analytics/charts/session-patterns/SessionDepthDistribution.tsx` lines 5 and ~85 archived-task references removed; moved `script/build.ts` → `scripts/build.ts` (single-file directory merge) with `package.json:27` updated to `tsx scripts/build.ts` and the empty `script/` directory deleted; dropped the `export` keyword from `server/routes/discover.ts:9`'s `DiscoverResult` interface (only internal consumer). `useScannerStatus` in `use-scanner.ts` is now confirmed dead code (zero call sites after ScannerBrain deletion) — flagged for a future cleanup pass, intentionally out of scope for this task. **task006 — server error handling standardization (commit `b9da1ba`):** created `server/lib/route-errors.ts` (new directory) with `handleRouteError(res, err, context)` helper plus `ValidationError`/`NotFoundError`/`ConflictError` lightweight classes — maps each class to 400/404/409, defaults to 500 for unknown errors with `{error: "Internal server error", detail}` shape, logs with `[context]` prefix only on 500+ paths, stringifies non-Error throws sensibly (null → `"null"`), sets `this.name` on each class for clean stack traces, and omits `detail` key entirely when undefined; 16-test TDD-first `tests/route-errors.test.ts` covers every branch including non-Error throws and the log-vs-silence policy. Migrated 11 of 13 route files with catch blocks: `chart-analytics` (10 call sites), `cost-analytics` (6), `ai-suggest` (5), `markdown` (5), `sessions` (5), `board` (4), `agents` (2), `apis` (2), `projects` (1 with `throw new NotFoundError`/`ValidationError`), `scanner` (1 with `throw new ConflictError`), `discover` (1). Two routes deliberately skipped with documented reasons: `update.ts` returns a custom 10-field `UpdateStatus` shape (not a plain error body), and `discover-github.ts` needs a 502 status override for upstream GitHub-API gateway semantics the helper doesn't support — manual log and response retained there, already emitting the canonical `{error}` shape. **Scope expanded beyond catch blocks to the full API surface:** a one-line change in `server/routes/validation.ts:106` flips Zod validation failures from `{message}` to `{error}`, cascading through every route that uses `validate()`; all `res.status(400|403|404|409|502|503)` responses in route files now use `{error, detail?}` shape, so the canonical error shape is universal across the API. Four test files updated to assert `body.error` instead of `body.message` — tightened, not loosened. **Safety-critical preserved:** `isClaudeAvailable()` 503 check in `sessions.ts:475` unchanged (CLAUDE.md Rule #4); SSE stream handlers in `scanner.ts` `/api/scanner/events` and `board.ts` `/api/board/events` untouched (still `res.write()`, helper is applied only to their sibling JSON catch blocks); graceful-degradation routes returning empty arrays/objects on error preserved (CLAUDE.md Rule #7); successful response shapes untouched; zero client code modified. Client risk is nil — `client/src/lib/queryClient.ts:12` does `throw new Error(\`${res.status}: ${text}\`)` and dumps the raw body string into `err.message`, so the hooks never parsed the JSON shape. **Process correction during Phase 3 pre-flight:** three numeric errors in `docs/audit-2026-04-13.md` were corrected at source after the refreshed contracts surfaced drift between audit claims and actual codebase state (141 console.errors → 43 across 12 files; 26 route files → 25; `use-scanner.ts:15-20` → actual line 85). The `feedback_preflight_contracts` memory was rewritten from "pre-flight per task at dispatch" to "fix audit errors at source and regenerate contracts in one pass" — the original pre-flight discipline was born from real task001/004/005 drift incidents, but was being over-applied as a dispatch-time ritual rather than the roadmap-build-time reconciliation step it should be. Reviewer verdict PASS on both commits, zero quality issues, zero out-of-scope edits. Test suite now **5,553 tests across 152 files** (+32 from Phase 2 baseline: 16 route-errors tests plus ambient growth). `npm run check` clean, pre-commit safety hook passes on both commits, dev-server smoke test confirmed 400/404 paths return canonical `{error}` shape. Phase 3 complete (7/8 tasks). Only task008 (config cleanup, test audit, strict TS flags) remains — deferred to a fresh session. (codebase-cleanup-task006, codebase-cleanup-task007)

- **Codebase cleanup Phase 2 — formatter and session-health consolidation** — two commits on `feature/codebase-cleanup` collapse scattered duplication into canonical shared modules. **task004 — formatter consolidation:** created `shared/format.ts` with canonical `formatUsd`, `formatCost`, `formatTokens`, and `formatDate` exports, plus `client/src/lib/format.ts` as a one-line `@shared/format` re-export so existing `@/lib/format` import patterns keep working. Migrated `server/cli/report.ts` and 19 client files (6 in `analytics/costs/`, 6 in `charts/token-economics/`, 4 in `charts/file-activity/`, 1 in `analytics/entity-graph/`, 1 in `analytics/sessions/`, and the three `components/board/` callers). `session-indicators.tsx` re-exports `formatCost` and `formatTokens` from `@/lib/format` so downstream imports keep working without changes; `formatCostLabel` (a different helper for chart labels) is preserved as the only locally-defined formatter. Deleted the redundant `shortenModel` helper from `session-indicators.tsx` — all three callers (`session-indicators.tsx` internal, `board-task-card.tsx`, `board-side-panel.tsx`) now use the canonical `shortModel` from `@/lib/utils`. The 4 `shortenModel` assertions at `tests/board-session-card.test.ts:45-48` were deleted (equivalent `shortModel` coverage already exists in `tests/short-model.test.ts`). TDD gate: `tests/format.test.ts` written red first, implementation made it green. User-visible display change: board token counts now render with uniform 1-decimal precision across all tiers (e.g. `50000 → "50.0K"` where the old board-specific `formatTokens` used `Math.round` in the 10k–1M band and returned `"50k"`). Contract explicitly prioritized consistency over preserving divergent tier boundaries. **task005 — session health color/label/variant consolidation:** created `client/src/lib/session-health.ts` with `SessionHealthScore` type and three canonical helpers — `sessionHealthColor` (Tailwind bg class: `bg-emerald-500`/`bg-amber-500`/`bg-red-500`/`bg-muted-foreground/30`), `sessionHealthLabel` (human string: "Healthy"/"Some issues"/"High error rate"/"Unknown"), and `sessionHealthBadgeVariant` (shadcn variant: `default`/`secondary`/`destructive`/`outline`). Migrated 5 call sites: `board/session-indicators.tsx` `statusLightColor`/`statusLightTooltip` delegate to the canonical helpers; `analytics/sessions/SessionRow.tsx` local `healthColor` export deleted; `HealthDetails.tsx`, `SessionOverview.tsx`, and `SessionDetail.tsx` inline Badge variant ternaries replaced with `sessionHealthBadgeVariant`. TDD gate: 14 new UI helper tests appended to `tests/session-health.test.ts` (which previously only covered backend health threshold settings — same filename, two concepts). `tests/session-list.test.ts` updated to import from `@/lib/session-health`; collateral update to `tests/board-session-card.test.ts` for the new "Active — some issues" tooltip string and emerald-for-good canonical. Pre-flight contracts for both tasks were rewritten in place after significant drift was found against the original audit docs: 3 moved-file paths, 2 non-scope files, 6 missed chart files, and a three-way health vocabulary mismatch (`good|fair|poor` session health vs. `ok|warning|error|unknown` service health vs. `healthy|warning|critical|unknown` project-card aggregate — only the first is in scope). `components/board/project-card.tsx` was explicitly verified untouched via acceptance grep. User-visible UX changes: "good" session dots go from green-500 → emerald-500 (slightly cooler green), null + active session dots go from green-500 → muted-foreground/30 (null now means "unknown" everywhere, not "assumed good"), and the "fair" tooltip reads "Active — some issues" instead of "Active — moderate issues". Test suite now **5,521 tests across 151 files** (up from 5,475/150 after Phase 1 — +14 session-health UI tests, +9 format tests, plus ambient growth; -4 `shortenModel` assertions). `npm run check` clean, pre-commit safety hook passes on both commits. Phase 2 complete (5/8 tasks). Phase 3 (task006 server error handling, task007 structural/naming) still needs pre-flight verification against the audit docs before dispatching. (codebase-cleanup-task004, codebase-cleanup-task005)

### Removed
- **Codebase cleanup Phase 1 — ~2,000 LOC of dead code** — three commits on `feature/codebase-cleanup` delete production-unreachable files and dead functions identified by a three-audit convergence (Claude cleanup pass, Codex cold audit, 4-agent cold read). **task002 — session-analytics-panel split:** extracted `BashKnowledgePanel` → `client/src/components/library/bash-knowledge-panel.tsx` and `WorkflowConfigPanel` → `client/src/components/settings/workflow-config-panel.tsx`, then deleted `client/src/components/session-analytics-panel.tsx` (739 LOC, catch-all module) and `client/src/components/session-health-panel.tsx` (164 LOC, zero importers). Updated `library.tsx` and `settings.tsx` imports to the new locations. **task001 — dead page deletion:** deleted `client/src/pages/sessions.tsx` (~1,068 LOC), `client/src/pages/activity.tsx` (redirect stub), `client/src/pages/prompts.tsx` (dead copy of `prompts-panel.tsx`), and `client/src/pages/projects.tsx` (dead re-export stub). Removed `Projects` lazy import from `App.tsx`. Deleted duplicate `usePromptTemplates`/`useCreatePrompt`/`useDeletePrompt` hooks from `use-sessions.ts` — canonical versions live in `use-prompts.ts`. The `/board`, `/sessions`, `/activity` redirect routes are preserved so bookmarks still work. **Caught a contract error:** the audit claimed `client/src/pages/board.tsx` was dead, but it is the live `BoardPage` rendered at `/projects` — subagent correctly refused to delete it and flagged the audit for correction. **task003 — remaining dead files + dead code inside live files:** deleted `client/src/components/health-indicator.tsx`, `client/src/components/stat-card.tsx`, `client/src/hooks/use-count-up.ts`, `client/src/hooks/use-debounce.ts`, `client/src/components/board/board-filters.tsx`, and `client/src/components/onboarding-wizard.tsx`. Removed commented-out `OnboardingWizard` import/render from `App.tsx`. Removed `UsageTab` and `ActivityTab` functions from `client/src/pages/stats.tsx` (plus 12 helper functions and 20+ unused imports) — file collapsed from 421 LOC to 52 LOC. Removed `HistoryTab`, `ExecutionCard`, and `StatsTab` from `client/src/components/library/agents-tab.tsx` — file collapsed from 773 LOC to 461 LOC. Live tabs (`nerve-center | costs | charts | sessions | messages` in stats, `installed | library | discover` in agents-tab) are unchanged. Test suite now **5,475 tests across 150 files** (down from 5,682/155 — delta is pinned-dead-export assertions removed with their files, not coverage loss). Phase 2 contracts (task004 formatter consolidation, task005 session health color consolidation) rewritten in place after pre-flight revealed significant drift from the audit docs: 3 moved-file paths, 2 non-scope files, 6 missed chart files, vocabulary mismatch between session health (`good|fair|poor`) and service health (`ok|warning|error|unknown`) that the original contract incorrectly unified. Ready to dispatch in a fresh session.

### Fixed
- **Messages redesign — manual QA cleanup for 5 timeline bugs** — browser testing of the deployed Messages tab surfaced five bugs the automated tests missed. (1) **Empty thinking blocks**: Claude Code JSONL persists thinking records as `{thinking: "", signature: "..."}` — the raw reasoning text is never persisted, only an encrypted signature. `flattenAssistant` now skips thinking blocks when `text` is empty so the timeline no longer shows broken "Thinking... (0 chars)" rows with nothing to expand. No-op if Claude Code ever starts persisting thinking text. (2) **Sidechain grouping never triggered**: `parseSessionMessages` only read the main session JSONL and never opened subagent files at `<sessionDir>/subagents/agent-*.jsonl` — all `isSidechain: true` records live exclusively in those files, so the messages array always had zero subagent records and tree enrichment always produced null `subagentContext`. Extracted the per-file parser loop into `parseJsonlFileToMessages`, then `parseSessionMessages` now calls `discoverSubagents(filePath)` and merges + timestamp-sorts subagent records into the unified timeline. Tree enrichment walks `subagent-root` ancestors and populates `subagentContext` correctly, so `SidechainGroup` renders with the shared subagent-colors palette. (3) **System-injected user content rendering as USER bubbles**: the strip regex only covered `system-reminder|command-name|command-message|command-args` and missed `local-command-stdout|local-command-stderr|local-command-caveat|local-command-stdin`. Extended to a single `SYSTEM_INJECTED_TAG_RE` covering all 8 tags. Also: when a user record contained a skill invocation, the old flow emitted only the skill_invocation chip and dropped co-located user text ("/effort max\\nyes" lost the "yes"). Refactored `flattenUser` with an `emitUserFromRaw` helper that always emits both the `skill_invocation` and the residual `user_text` when present. (4) **Subagent role=user records rendering as blue USER bubbles**: these are parent-to-subagent dispatch prompts, not human input. `UserBubble` now branches on `message.isSidechain` — when true, renders with `bg-muted/40` + `border-l-muted-foreground/50` + "Agent Prompt" label in muted gray instead of blue, so the surrounding `SidechainGroup`'s subagent color dominates. (5) **Skill body framework injection rendering as USER bubble**: when a user invokes `/work-task`, Claude Code emits the command as one user record (with `command-name` XML → `skill_invocation` chip) and injects a SECOND user record with `isMeta: true` containing the skill's full body ("Base directory for this skill: ..."). That second record has no XML to strip, so it landed as a blue user_text bubble full of skill boilerplate. `flattenUser.emitUserFromRaw` now skips `user_text` emission when `isMeta === true`. The preceding non-meta record already represents the command via its skill_invocation chip. All five fixes validated via live browser deploy on `acc.devbox`.

### Added
- **Messages redesign — full milestone (6/6 tasks + manual QA cleanup)** — complete replacement of the legacy Messages panel with a filterable, searchable conversation viewer. **task001 — message timeline endpoint:** `GET /api/sessions/:id/messages` returns a typed `TimelineMessage` stream covering all 7 variants (`user_text`, `assistant_text`, `thinking`, `tool_call`, `tool_result`, `system_event`, `skill_invocation`) with optional `?include=tree` enrichment attaching `treeNodeId` and `subagentContext` (agentId, agentType, description) to every message under a subagent root. `meta.treeStatus: 'ok' | 'unavailable'` signals enrichment state. **task002 — session sidebar:** `SessionSidebar.tsx` narrow left panel with project grouping, search, relative timestamps, URL-sync helpers (`readSelectedSessionFromUrl` / `writeSelectedSessionToUrl`). **task003 — 7 message bubble components + dispatcher + tool renderer registry:** `bubbles/` with `UserBubble`, `AssistantBlock`, `ThinkingBlock`, `ToolResultBlock`, `SystemEventBlock`, `ToolCallBlock`, `SidechainGroup` (collapsible wrapper grouping by `subagentContext.agentId`, shared `subagent-colors.ts` palette border stripe, fallback to generic label when tree unavailable). Central `renderMessage(msg, opts)` dispatcher exhaustive over all 7 variants with `never` guard. Pure barrel `bubbles/index.ts` — `SidechainGroup` imports `renderMessage` from `./dispatcher` directly to avoid a circular import. Tool renderer registry at `bubbles/tool-renderers/` with per-tool Summary modules (bash, read, grep, edit, write, agent, fallback) exposed via `TOOL_RENDERERS` Map and `getToolRenderer(name)` with guaranteed fallback. **task004 — ConversationViewer:** `ConversationViewer.tsx` fetches `?include=tree` via React Query, sorts by timestamp, groups messages under `SidechainGroup` wrappers using authoritative `subagentContext.agentId` (not `isSidechain` heuristics) when tree is available, falls back to consecutive-sidechain grouping with a subtle header banner when tree is unavailable. `useLayoutEffect` anchor-to-nearest-visible-message scroll preservation on filter changes (no jump to top). Jump-to-top / jump-to-bottom floating buttons. "Message X of Y" position indicator counting visible messages only. Keyboard nav: Up/Down walks the visible list, Enter/Escape activates `aria-expanded` disclosure buttons on expandable bubbles. Pure helpers extracted for testability: `filterMessages`, `isMessageVisible`, `groupMessagesForRender`, `sortMessagesByTimestamp`, `computeVisiblePosition`, `findAnchorAfterFilterChange`. **task005 — FilterBar + MessagesTab wiring:** `FilterBar.tsx` with 6 toggle pills (Conversation / Thinking / Tools / System / Sidechains / Errors Only) and 3 mode presets (Conversation / Full / Errors). `MessagesTab.tsx` two-panel layout owning `selectedId` + `filters` state, wired into `stats.tsx` replacing the legacy `<MessagesPanel />` (617-line `message-history.tsx` deleted, `PromptsPanel` + `PromptModal` extracted to new `prompts-panel.tsx` for Library). Extended task004's `FilterState` with optional `sidechains?` and `errorsOnly?` keys to back the 6 pills. Route docblock polish: JSDoc on `GET /api/sessions/:id/messages` now explicitly states `totalMessages` is post-filter when `?types=` is present; `TIMELINE_MESSAGE_TYPES` ReadonlySet carries a "keep in sync with shared union" comment. **task006 — in-conversation search + errors surrounding context:** `ConversationSearch.tsx` overlay with query input, match counter, prev/next nav, clear button, Ctrl+F / `/` global shortcut. `search-highlight.tsx` module exports `SearchHighlightContext`, `useSearchHighlight`, `highlightText` helpers (extracted from ConversationViewer to avoid a `ConversationViewer → bubbles barrel → UserBubble → ConversationViewer` cycle). 4 text-first bubbles (UserBubble, AssistantBlock, ThinkingBlock, ToolResultBlock) consume the context and render `<mark>`-wrapped highlighted spans when search is active, falling back to plain text during search and restoring markdown on dismiss. Auto-expand for matches in collapsed items via `aria-expanded` querySelector + one-rAF scroll-into-view pattern. Cross-filter surfacing: matches in filter-hidden messages are temporarily surfaced with a "Hidden by filter" badge. **Errors Only surrounding context (step 5):** `filterMessages` rewritten with a two-path structure — fast path for non-errorsOnly modes, errorsOnly path that walks the stream to collect each errored tool_result plus its paired `tool_call` (by `toolUseId === callId`) and the preceding assistant turn that issued the call, deduplicated via `Set<number>` on raw indices, returned in chronological order. Sidechain precedence: `sidechains=false` hides sidechain errors in errorsOnly mode ("hide sidechains" beats "show errors"). **Filter coverage gap closed (step 6):** 10 new `filterMessages` tests in `conversation-viewer.test.ts` cover `errorsOnly` basic, dedup, orphan error, orphan tool_call, non-errored ignored, plus `sidechains=false` hiding by `isSidechain` and by `subagentContext`, default backward-compat, and precedence rules. **Visual distinction fix:** `UserBubble` and `AssistantBlock` now use distinct palettes — User in blue (`bg-blue-500/10` + `border-l-blue-500` + bold blue "User" label), Claude in violet (`bg-violet-500/10` + `border-l-violet-500` + bold violet "Claude" label folded into the existing model/stop-reason badge row). Previous `primary/5` vs `muted/40` styling was too subtle in the dark theme (primary resolves to near-white). **surfacedRawIndices errorsOnly fix:** extracted `filteredRawIdxSet` as a shared memo so both `visibleWithRawIdx` and `surfacedRawIndices` consult the authoritative post-filter raw-index set instead of calling the per-message `isMessageInFilteredSet` predicate, which cannot recognize errorsOnly surrounding-context rows. Closes `messages-redesign` milestone (6/6 tasks). (messages-redesign-task001 through task006)

- **Charts enrichment — rich visualization playground (7/7 tasks)** — expanded the Charts tab from a single placeholder into 21 charts across 5 thematic sections backed by 10 new aggregation endpoints. **Infrastructure (task001):** `GlobalFilterBar` with React context `useChartFilters()`, time range (7d/30d/90d/All/Custom), project and model multi-selects, URL param sync; reusable `ChartCard` wrapper with title, loading skeleton, controls slot, and expand-to-modal; `ChartsTab` shell wraps everything in `ChartFiltersProvider`. **Backend (task002):** new `server/routes/chart-analytics.ts` exposes `/api/charts/tokens-over-time`, `/cache-over-time`, `/models`, `/sessions`, `/session-distributions`, `/stop-reasons`, `/tools`, `/files`, `/activity`. All cost and token aggregations prefer `SessionTree.totals` with a `console.warn`-annotated flat fallback — totals include subagent spend, matching Sessions detail, Costs tab, and board numbers. `?breakdown=all|parent` query param flips between tree-inclusive and parent-only metrics. `/api/charts/models` walks `tree.nodesById` so subagents running a different model show up in the per-model series. Session-level `?models=` filter via a new `passesModelFilter` helper with any-match semantics across parent and subagent turns. **Token Economics section (task003):** `TokenUsageOverTime` (line/area toggle across total/input/output/cache-read/cache-creation), `CacheEfficiencyOverTime` (hit-rate line + stacked cached/uncached areas), `TokenDestinationBreakdown` (pie from `/api/analytics/costs/anatomy`), `ModelDistribution` (stacked bars per day), `APIEquivalentValue` (what usage would cost at API rates). Section-level "Include subagents / Parent only" toggle maps to `?breakdown=all|parent` on the 4 tree-aware charts. **Session Patterns section (task004):** `SessionFrequency` (health-segmented bars), `SessionDepthDistribution` (horizontal histogram with axis label `"Assistant turns (includes subagent turns)"` so tree-inclusive depth is legible, mean reference line), `SessionDurationDistribution`, `SessionHealthOverTime` (stacked area good/fair/poor), `StopReasonDistribution` (horizontal bars with `max_tokens` highlighted). **Tool Usage section (task005):** `ToolFrequency` (horizontal bars with consistent per-tool color palette), `ToolErrorRate` (grouped success/failure), `ToolDurationDistribution` (explicit "Duration data not yet available" empty state pending backend enhancement), `ToolUsageOverTime` (stacked area). `breakdown?: 'all' | 'parent'` prop on all charts for future toggle wiring. **File & Codebase / Activity & Workflow sections (task006):** `FileHeatmapExtended` (top 25/50 files segmented by read/write/edit), `FileChurnRate` (unique files per day), `ActivityTimeline` (ComposedChart with session bars + unique files line), `ProjectActivityComparison` (fetches `/api/analytics/costs/value` — the tree-backed `byProject` array — so project cost comparisons match the Costs tab exactly, not the flat `/api/charts/activity` projects block), `SidechainUsage` (dual-axis absolute count + percentage of total messages). **Per-subagent cost breakdown (task007):** new `GET /api/charts/subagent-costs` endpoint walks each session's `SessionTree`, iterates `subagentsByAgentId`, and aggregates `rollupCost.costUsd` by `agentType` with per-bucket `topSessions`, overall `delegationPercentage`, and a `mostDelegationHeavy` top-10 by ratio. `SubagentCostBreakdown.tsx` renders a horizontal bar chart in the Token Economics section as the 6th card, with a delegation-percentage headline tile, click-to-drill-in panel showing top parent sessions per agent type with clickable session links, and palette from the shared subagent-colors module. Empty state when no subagents are dispatched. (charts-enrichment-task001 through task007)

### Fixed
- **Charts models filter silent no-op** — `/api/charts/models?models=` previously hung the response when a session on the flat-fallback path had a non-matching model (`return` inside `for...of` exited the entire route handler instead of continuing the loop). Changed to `continue`; regression test wraps the request in a 3-second `Promise.race` so a future regression fails fast with a clear error instead of hanging the suite. The session-level `?models=` filter is now applied in `passesFilters` across every chart endpoint (not just `/api/charts/models`), with any-match semantics that include subagent turns. (charts-enrichment-task002 review fixes)

### Added
- **Flat-to-tree wave 2 — per-subagent breakdowns in the Sessions detail panel** — every component in the Sessions detail panel (Overview, Token Breakdown, File Impact, Tool Timeline) now visibly communicates which subagent ran which turns, spent which tokens, and touched which files. A shared `client/src/components/analytics/sessions/subagent-colors.ts` module extracted from `ToolTimeline` exports `PALETTE`, `ToolOwner`, `colorClassForOwner`, `resolveToolOwner`, and `resolveAssistantTurnOwner`, so the same subagent gets the same palette color everywhere in the detail panel (13-case unit test suite). `SessionOverview` gains an optional `tree` prop, a tree-aware model walk that includes models appearing only inside subagents, and a new "Subagents" chip strip rendered below Models — one outline badge per subagent with palette color, agent type label, cost, and token count (hidden when no subagents). `TokenBreakdown` gains an optional `tree` prop and a tree-aware row builder that walks parent and subagent assistant turns in a single chronological sequence; cumulative totals are now accurate (previously undercounted by the full subagent cost) and a new Agent column shows a palette dot + agentType abbreviation on subagent rows (column hidden entirely when no subagents — not just empty). `FileImpact` gains an optional `tree` prop and extended `FileEntry.ownerCounts`; each file row renders up to 3 right-aligned palette dots showing which subagents touched that file, with native `title` tooltips of the form `{agentType}: N ops` (hidden for parent-only files). `SessionDetail` forwards `session.tree` to all three components (wave1 already wired it to `ToolTimeline`). Null-tree fallback preserved on every component — sessions without subagents render byte-identical to pre-wave2. Closes `flat-to-tree-wave2` milestone (5/5 tasks). (flat-to-tree-wave2-task001 through task005)

### Fixed
- **TokenBreakdown cumulative undercounting** — the cumulative column in the Sessions detail Token Breakdown section now includes subagent spend. Previously it walked only the parent session's flat `assistantMessages` array, silently undercounting the session total by the full cost of every subagent run. Tree-aware row builder closes the gap.

### Added
- **Flat-to-tree wave 1 — subagent spend now included everywhere** — first wave of `SessionTree` consumer migration shipped. `server/scanner/session-analytics.ts`, `server/scanner/session-project-value.ts`, and `server/board/session-enricher.ts` now read session cost, tokens, tool counts, and turn counts from `sessionParseCache.getTreeById()` via `tree.totals.*` instead of summing parent-only `assistantMessages[].usage`. Every board card, cost breakdown, and efficiency ranking now reflects full subagent spend. Output shapes unchanged — zero API contract drift, no client updates required. Null-tree fallback preserved on every migrated surface: `console.warn` + the original flat-array code path when the tree is absent, matching the graceful-degradation rule in `CLAUDE.md`. Per-model breakdowns now walk `tree.nodesById` to include models that appear only inside subagents. Session health scoring receives the tree-derived assistant-turn count via a new optional `SessionHealth.messageCount` field (additive, observability). Header comment on `session-enricher.ts` acknowledging the subagent-cost gap has been removed — the gap is closed. `ToolTimeline.tsx` gains an optional `tree` prop wired through a new `useSessionDetail(id, { includeTree: true })` option that appends `?include=tree` to the sessions route. When the tree is present, tools are grouped under their issuing assistant turn with a lightweight header and each subagent-owned row receives a deterministic color tag from a 6-color palette hashed on `agentId`; when the tree is absent, render output is byte-identical to pre-migration. Pure helpers (`resolveToolOwner`, `colorClassForOwner`, `groupToolsByAssistantTurn`) extracted and unit-tested directly — matching the "extract pure helpers" pattern every other client-component test in the repo uses. Added `SerializedSessionTreeForClient` to `shared/session-types.ts` so the client-side hook type matches what the server wires over JSON (`Object.fromEntries(nodesById)`). Safe null-tree fallback on the client matches the server pattern: tree omitted or null renders the original flat chronological list. Closes `flat-to-tree-wave1` milestone (4/4 tasks). Test suite now 6324 tests across 130 files (+18 new for ToolTimeline helpers, +existing suites extended). (flat-to-tree-wave1-task001, task002, task003, task004)
- **Flat-to-tree wave 1 spec and roadmap** — design spec (`docs/superpowers/specs/2026-04-11-flat-to-tree-wave1-design.md`) and `flat-to-tree-wave1` roadmap milestone with 4 tasks scoping the first wave of `SessionTree` consumer migration. Phase 1 (3 parallel-safe server tasks) routes `session-analytics.ts`, `session-project-value.ts`, and `session-enricher.ts` through `sessionParseCache.getTreeById()` to fix cost undercounting for every session with subagents — output shapes preserved so no API contract changes. Phase 2 (1 client bundle) adds an optional `tree` prop to `ToolTimeline` so every tool call renders with indent under its issuing assistant turn and a deterministic color tag per subagent; `useSessionDetail(id, { includeTree: true })` opts into the already-shipped `?include=tree` route param. Sessions without subagents and any null-tree fallback render identically to today. Ready for `/work-task` parallel dispatch.
- **Flat-to-tree consumer audit** — `docs/audits/2026-04-13-flat-to-tree-audit.md` surveys every `ParsedSession` consumer in the codebase and ranks migration opportunities: 4 HIGH (correctness fixes), 10 MEDIUM (per-subagent breakdowns), 6 LOW (flat-array sufficient). Top targets: `session-analytics.ts` (undercounted costs), `session-enricher.ts` (gap already documented in a file-header comment), `ToolTimeline.tsx` (no parent-turn context for tools). Confirms `conversationTree` fossil has zero production consumers and is safe to keep as-is.
- **Scanner capabilities reference** — `docs/scanner-capabilities.md` documents what the scanner produces and how consumers should read it. Covers `ParsedSession` flat arrays and `SessionTree` hierarchy side-by-side, cost computation formula, three-tier subagent linkage, cache behavior, all `/api/*` endpoints, and known gaps (nested subagents, `conversationTree` accuracy, streaming sessions). Serves as the first-stop reference for anyone building a feature on scanner output.
- **Session hierarchy Phase 5 — sessions route opt-in tree via `?include=tree`** *(branch `feature/session-hierarchy`, not yet merged)* — closes the `session-hierarchy` milestone (6/6 tasks). `GET /api/sessions/:id` now accepts an `?include=tree` query parameter that adds the cached `SessionTree` to the response. Default behavior is byte-identical to the pre-task shape: when the query param is absent the `tree` field is omitted entirely, so no existing client sees a payload change. `?include=tree` returns `tree: SessionTree` on cache hit, `tree: null` on cache miss (not an error — the scanner may not have visited that session yet), and 404 on an unknown session id. Unknown include values (`?include=other` or `?include=tree,unknown`) are silently ignored — the route stays forgiving as new sections get added. `SessionTree.nodesById` and `SessionTree.subagentsByAgentId` are `Map` instances, which `JSON.stringify` would leak as empty `{}`; the route serializes them as plain objects keyed by node id / agentId via a new `SerializedSessionTree` wire type. `subagentsByAgentId` is typed narrowly as `Record<string, SubagentRootNode>` so clients can read subagent-specific fields without narrowing. The handler is strictly read-only against the cache — no parse or build is triggered from the route. 8 new route-level tests in `tests/sessions-route.test.ts` cover all three response states, serialization fidelity, unknown-include tolerance, 404 parity, and warnings passthrough. Milestone deploy gate (`scripts/deploy.sh`) passes. (session-hierarchy-task006)
- **Session hierarchy Phase 4 — scanner wiring and end-to-end integration test** *(branch `feature/session-hierarchy`, not yet merged)* — `parseSessionAndBuildTree(parentFilePath, projectKey)` in `server/scanner/session-scanner.ts` is the single "teach the cache about a session" entry point: parses the parent, discovers and parses each subagent, builds the `SessionTree`, and populates `setEntry` so `getById`/`getTreeById` always return a matching pair. Rewires the existing per-file scanner worker through this helper and keeps the file-size-keyed cache fast path so repeat scans of unchanged sessions stay O(1). Fixes a parser gap that was blocking tier-1 linkage on real data: `ToolResult.agentId` is now lifted from `record.toolUseResult.agentId` and the builder's tier-1 check is an exact match on that field (was previously a substring scan of `user.textPreview`, which is empty for real-world tool_result-only user records). 6 existing builder unit tests migrated to stash `agentId` on the `ToolResult` instead of text. Ships a fully synthetic 5-subagent fixture at `tests/fixtures/session-hierarchy/` (nothing copied verbatim from any real session) and `tests/session-tree-integration.test.ts` with 9 cases that round-trip the fixture through parser → discovery → builder → cache and assert every milestone invariant: single root, 5 subagent-roots, tier-1 wins for all, rollup > self-cost, `nodesById` completeness, empty warnings, zero-subagent code-path parity, missing parent returns null without poisoning the cache, and corrupt subagent surfaces `subagent-parse-failed`. (session-hierarchy-task005)
- **Session hierarchy Phase 3 — cache stores tree** *(branch `feature/session-hierarchy`, not yet merged)* — `SessionParseCache` now stores `{ parsed, tree }` per entry. New `setEntry(filePath, parsed, tree)` for atomic population by the scanner, plus `getByPath`, `getTreeById`, and `getTreeByPath` read accessors. Existing public API (`getOrParse`, `getById`, `getAll`, `invalidate*`, `size`) is byte-identical — no consumer changes required. Cache remains a pure storage layer and does not import the tree builder. Invalidation drops parsed and tree together. 6 new cache tests; 5 existing unchanged. (session-hierarchy-task004)
- **Session hierarchy Phase 2 — SessionTree builder** *(branch `feature/session-hierarchy`, not yet merged)* — `server/scanner/session-tree-builder.ts` exports `buildSessionTree(parent, subagents)` as a pure, side-effect-free function. Two-pass parent-tree construction handles out-of-order `parentUuid`; tool calls hang off the assistant turn that issued them via `issuedByAssistantUuid`; strict three-tier subagent linkage (`agentid-in-result` → `timestamp-match` within 10ms → `orphan`) with first-match-wins precedence; post-order cost rollup using `pricing.ts` as the single source of truth; recursive in-tree build for each subagent's own messages and tool calls. Nested subagent discovery is intentionally skipped — emits `nested-subagent-skipped` warning instead. `orphan-user-turn` added to the `SessionTreeWarning` union. 16 new tests covering all spec cases. (session-hierarchy-task003)
- **Session hierarchy Phase 1 — types and subagent discovery** *(branch `feature/session-hierarchy`, not yet merged)* — task001 adds the full `SessionTree` type surface from the spec to `shared/session-types.ts` (5 node kinds, `SubagentLinkage` 3-tier union, `SessionTreeWarning`, `SessionTree` container, `NodeCost`) and threads `issuedByAssistantUuid` through the parser's pending-tool-calls map so every `ToolExecution` records the uuid of the assistant turn that issued it. `ConversationNode` and `ParsedSession.conversationTree` marked `@deprecated` (retained for test compatibility). task002 adds `server/scanner/subagent-discovery.ts` — a side-effect-free enumerator for `<session>/subagents/agent-*.jsonl` files plus their optional `.meta.json` sidecars, sorted by filename, with graceful per-file degradation. 10 new tests (2 parser linkage + 8 discovery).
- **Session hierarchy design spec** — Option B design for modeling sessions as trees: keep `ParsedSession` flat and add a new `SessionTree` type built alongside. Covers the `SessionTreeNode` data model (5 kinds with prefixed ids), subagent discovery (`<session>/subagents/agent-*.jsonl` with `.meta.json` siblings), three-tier linkage priority (`agentid-in-result` → `timestamp-match` → `orphan`), the required `ToolExecution.issuedByAssistantUuid` additive fix, cost rollup semantics (`selfCost` vs. `rollupCost`), edge cases, and testing strategy. Out of scope: UI, cost route changes, graph integration. Ready for `/build-roadmap` task scoping.
- **Nerve Center redesign — force-directed entity graph** — replaced the CNS topology layout with a d3-force entity graph showing all entities as nodes (projects, sessions, MCPs, skills, plugins, markdown, configs), hierarchical and cross-reference edges, hover subgraph highlighting, click drill-in (system → project sessions), drag repositioning, and a sidebar detail panel. Position cache preserves layout across drill-in so children appear near the clicked parent instead of scattering. Performance: `requestAnimationFrame` render loop collapses many d3 ticks into one React render per frame, with in-place position cache mutation to avoid per-tick allocations. System view shows 296 nodes / 561 edges; per-project sessions view shows ~1000 nodes.

### Removed
- **Nerve Center topology layout** — `TopologyLayout`, `ScannerBrain`, `NervePathway`, and the 5 organ modules (`CostNerves`, `SessionVitals`, `FileSensors`, `ActivityReflexes`, `ServiceSynapses`) deleted along with 8 dedicated test files (~3,400 lines removed). Replaced by `EntityGraph` in the same `nerve-center` tab.

### Fixed
- **Sessions page UX fixes** — resizable list-detail divider (reuses existing `useResizeHandle` hook), pin icon now toggles visually with optimistic state, overview panel wired to show duration/cost/health from enrichment data, Linked Task section hidden when no data, expand/collapse chevron smoothly rotates instead of bouncing, lifecycle events display human-friendly labels with readable time formatting.
- **Costs tab UX fixes** — all 5 cost sections now collapsible with smooth chevron animation, "System Prompt Overhead" renamed to "Context Overhead" with accurate description, model names shortened and `<synthetic>` normalized to "unknown", expensive session links navigate to correct analytics page instead of dashboard.

### Added
- **Entity graph design spec** — force-directed entity graph visualization replacing the Nerve Center topology. d3-force physics simulation, SVG rendering with React, project/session/tool/model nodes, curved bezier edges, flow particle animations, hover subgraph highlighting, click drill-in (system → project sessions), drag repositioning, sidebar detail panel, mobile fallback.
- **Implementation plan for sessions/costs/analytics fixes** — 13 tasks across 3 milestones from post-implementation review: 6 sessions page fixes, 4 costs tab fixes, 3 nerve center redesign tasks. Roadmap files created for workflow-framework execution.

### Changed
- **Analytics overview → nerve-center-redesign** — pivoted milestone from card-grid overview dashboard to force-directed entity graph. Full rename across roadmap files (milestone, task IDs, directory). Review gates added after task001 and task002 for planning partner sign-off.

### Added
- **Costs deepening — token intelligence panel** — transformed the Costs tab from basic aggregates into a 6-section analytics panel. Token Anatomy donut chart categorizing usage (system prompt, conversation, tool execution, thinking, cache overhead). Model Intelligence sortable table with per-model cost and cache savings. Cache Efficiency metrics with hit rate, first-message vs steady-state comparison, ROI, and per-message cache curve. System Prompt Overhead section with trend indicator and Library config link. Session & Project Value rankings with clickable session navigation. Collapsible Historical Lookup preserving original daily spend view. 84 new tests.

### Added
- **Sessions redesign — list-detail inspector layout** — replaced flat session card list with an email-client style list-detail split. Compact scannable rows with health dots, model badges, cost, and duration. 7 sort options, filter pills (health/status/project/model), keyboard navigation. Detail panel with 7 collapsible sections: overview metric grid, linked task with auto-link score transparency, tool timeline (filterable, color-coded durations), token breakdown (sparkline + per-message table), file impact (directory-grouped), health details (actionable metrics), lifecycle events. Auto-linking enhanced with 2 new scoring signals (command invocations, message content), directory-level file matching, session-duration-aware timing, and milestone minimum length safety.

### Added
- **Nerve Center v2 — CNS topology visualization** — replaced stacked panel layout with a circuit-board topology: Scanner Brain at center, 5 organ modules (Cost Nerves, Session Vitals, File Sensors, Activity Reflexes, Service Synapses) connected by right-angle SVG circuit traces with junction dots. State-reactive coloring flows from organs to brain. Tiered pulse animations (idle/active/alert). Responsive stacked layout on mobile. 247 tests.
- **Billing-mode-aware cost display** — Cost Nerves organ respects `billingMode` setting. Subscription mode (default): high usage = green (value), low usage = red (waste). API mode: high usage = red (cost pressure). Trend text adapts accordingly.

### Fixed
- **Slow server restarts** — initial JSONL scan (~846 files, 215MB) no longer blocks the server from accepting requests. Scan runs in background after listen. Deploy script uses health endpoint polling instead of kill -9 + 2s sleep.

### Added
- **Analytics 5-tab layout** — analytics page restructured from 4 tabs with nested subtabs to 5 flat tabs: Nerve Center, Costs, Charts, Sessions, Messages. Sessions and Messages content now lives under Analytics.
- **Workflows in Settings** — WorkflowConfigPanel (auto-summarize, stale flags, cost alerts) relocated from Nerve Center subtabs to Settings page as a dedicated Workflows tab.
- **Prompts in Library** — full-featured PromptsPanel relocated from Messages page to Library Prompts tab. Messages page is now full-width.

### Changed
- **Nav sidebar reduced to 5 items** — Dashboard, Projects, Library, Analytics, Settings. Sessions and Activity removed (content absorbed into Analytics tabs).
- **Route redirects** — `/sessions` redirects to `/analytics?tab=sessions`, `/activity` redirects to `/analytics?tab=nerve-center`.

### Removed
- **Decisions feature** — DecisionLogPanel, `/api/decisions` endpoint, Decision type, storage methods, and decision-extractor.ts removed entirely.

### Fixed
- **Empty milestone display bug** — stale "analytics overhaul 0/0" no longer appears on project cards. Removed superseded milestone directory and fixed `activeMilestones()` filter to exclude milestones with zero tasks.

### Added
- **Analytics V2 roadmap** — 6 new milestones (39 tasks) for analytics overhaul: foundation restructure, Nerve Center CNS topology, costs deepening, charts enrichment, sessions redesign, messages redesign. Design specs in `docs/superpowers/specs/`.

### Added
- **Kanban card session detail accordion** — expandable inline panel on board cards showing health reason tags, tool call stats, retries, cache hit rate, max token stops, web requests, sidechains, and turn count.
- **Auto session-task linking** — tasks without a manual `sessionId` are automatically matched to sessions using behavioral signals: git branch name, file path overlap with `touches:` labels, and timing correlation. Best match above 0.4 threshold is linked.
- **HealthReasonTag component** — color-coded pills for health reasons: red (high error rate, context overflow), amber (excessive retries, long idle gaps, high cost), muted (short session).

### Added
- **Comprehensive JSONL session parser** — single-pass `parseSessionFile()` extracts messages, tool executions, cost/token totals, models, timestamps, and conversation structure from raw JSONL files. 16 typed interfaces in `shared/session-types.ts` define the full parsed schema.
- **Session parse cache** — file-size-based `SessionParseCache` avoids re-parsing unchanged JSONL files. Singleton instance shared across scanner and analytics.
- **Full JSONL schema types** — `shared/session-types.ts` with `ParsedSession`, `ParsedMessage`, `ToolExecution`, `FileHistorySnapshot`, and 12 supporting interfaces.

### Changed
- **Session scanner uses parsed cache** — `session-scanner.ts` now reads from `SessionParseCache` instead of doing its own JSONL parsing, eliminating a redundant full-file read per session.
- **Session analytics consumes parsed cache** — `session-analytics.ts` reads from the same cache, eliminating a second redundant full-file read per session.

### Added
- **Library configuration management** — Library page is now a full config manager. Install, uninstall, edit, and remove skills, agents, and plugins directly from the UI. Three-state model: items move between External (GitHub) → Library (inactive on disk) → Installed (active in Claude Code).
- **Discover tab** — search GitHub for community skills, agents, and plugins. Results show as cards with "Save to Library" action. Safety disclaimer with VirusTotal link.
- **Structured discover sources** — Browse section with links to skill hubs (Claude Skill Hub, SkillsMP, SkillHub), plugin marketplaces (Anthropic Official/Community), and cross-type directories (Build with Claude). GitHub search is the universal fallback.
- **Library scanner** — new scanner reads `~/.claude/library/` for uninstalled items and includes them in entity queries.
- **Library file operations API** — backend routes for install (library → active), uninstall (active → library), remove (permanent delete), and list operations.

### Changed
- **Library subtabs renamed** — "Saved" → "Library", "Marketplace" → "Discover" across Skills, Agents, and Plugins tabs. MCPs retain the old naming (out of scope — different config model).
- **Remove confirmation** — permanently removing items from the Library now requires confirmation dialog.

### Added (prior)
- **Fixed shell layout system** — app layout changed from scroll wrapper to fixed viewport box. Pages now own their scrolling — either as a single scroll area (Library, Sessions, Analytics, Settings) or as independently scrollable panels (Board, Dashboard). Nav sidebar and terminal panel stay fixed at all times.
- **Dashboard panel layout** — status bar pins at top while active sessions scroll independently below. Sessions area centered at 85% width (1400px cap).
- **Board independent panel scrolling** — all three zones (projects, kanban columns, completed milestones) now scroll independently within the viewport.

### Fixed
- **Analytics costs tab** — swapped to correct session-based cost view (subscription-aware, horizontal bars, top sessions, cost by project).
- **Agents tab** — converted from vertical stacked sections to Installed/Saved/Marketplace sub-tabs matching other Library entity tabs.
- **Kanban center-alignment** — board columns now centered in their section.
- **Session health column alignment** — table headers left-aligned to match data alignment.
- **Library info tab position** — Info tab moved to first position in tab bar.
- **Plugins marketplace separation** — marketplace cards moved from Installed view to dedicated Marketplace sub-tab.
- **Library tabs** — added Discover, Prompts, and Bash KB tabs.
- **Analytics tabs** — Charts tab with time-series visualizations, session health drill-down table.

### Changed
- **Board 3-zone layout** — board page now has three zones at desktop: left sidebar (projects), center (kanban), right sidebar (completed milestones). Both sidebars are independently scrollable and width-adjustable via drag handles.
- **Project cards stacked vertically** — project cards in the left sidebar now stack vertically instead of scrolling horizontally. Each card shows per-milestone progress bars for active (incomplete) milestones.
- **Milestone bars relocated** — milestone progress indicators moved from the board header to their respective project cards (active milestones) and a new right sidebar (completed milestones). Header is now cleaner with just title, stats, and filters.

### Added
- **Completed milestones sidebar** — new right panel showing fully-completed milestones with done badges and full progress bars. Independently scrollable, width adjustable (160-360px).
- **Resizable sidebar hook** — `useResizeHandle` hook for drag-to-resize panel widths, used by both board sidebars.
- **Active milestone bars on project cards** — each project card shows individual progress bars for milestones that still have incomplete tasks.

### Added (prior)
- **Library page** — consolidated Skills, Plugins, MCP Servers, Agents, and File Editor into a single tabbed page at `/library`. Tab state syncs to URL via `?tab=` parameter.
- **Entity card component** — shared `EntityCard` with status badges (installed/saved/available), health indicators, tags, and action buttons. Used across all Library tabs.
- **Three-tier layout** — each Library entity tab organized into Installed, Saved, and Marketplace sections. Marketplace is a placeholder for future content.
- **Design specs for next phase** — four specs covering navigation restructure + board cleanup, Library page redesign, responsive foundation, and analytics overhaul (draft). Implementation plans written for specs 1-3.

### Changed
- **Board columns simplified** — 5 columns → 4: Queue, In Progress, Review, Done. Backlog renamed to Queue, Ready column removed entirely.
- **Board layout** — 3-zone (Projects/Board/Archive) → 2-zone (Projects 25% / Board 75%). Archive zone removed.
- **Sidebar navigation** — 10 items across 3 sections → flat list of 6: Dashboard, Projects, Library, Sessions, Analytics, Settings. Section headers removed.
- **Route rename** — `/board` → `/projects`, `/stats` → `/analytics`. Old URLs redirect automatically.
- **Entity page routes** — `/skills`, `/plugins`, `/mcps`, `/agents`, `/markdown` now redirect to their corresponding Library tab. `/markdown/:id` editor remains standalone.

### Removed
- **Standalone entity pages** — `skills.tsx`, `plugins.tsx`, `mcps.tsx`, `agents.tsx`, `markdown-files.tsx` deleted (~2,600 lines). All content lives in Library tabs.
- **Archive zone** — completed milestones archive panel removed from board page. Server-side archive API retained for future use.
- **Ready column** — board no longer has a Ready column; those tasks map to Queue.

### Added
- **Responsive design system** — `useBreakpoint()` hook returning viewport tier (xs/sm/md/lg/xl), CSS responsive tokens (`--page-padding`, `--card-padding`, `--card-gap`, `--section-gap`), and Tailwind utility extensions (`p-page`, `p-card`, `gap-card`, `gap-section`).
- **Responsive sidebar** — sidebar adapts to viewport: expanded at desktop, icon-only at tablet, hamburger drawer (Sheet component) at mobile. Ctrl+L toggle preserved at all breakpoints.
- **PageContainer component** — shared page wrapper with responsive padding, optional title/actions header, consistent section spacing. Adopted across all pages.
- **Per-page responsive pass** — Dashboard, Board, Library, Sessions, Analytics, and Settings all adapt: card grids scale 4→3→2→1 columns, tables collapse progressively, tab bars scroll at narrow widths, Board gets column tabs on mobile.
- **Design specs** — board overhaul (completed task handling, card info restoration, project sidebar), library cleanup (file editor tab reorg), analytics overhaul (updated with detailed decisions and brainstorm items).

### Added (prior)
- **Milestone color grouping** — each milestone gets a deterministic color from a 10-color dark-theme palette. Task cards show milestone color on the vertical bar (replacing project color). Board header displays color dots next to milestone names.
- **Agent role badge** — board cards now show the subagent type (e.g. "Explore", "Plan", "Code Review") alongside the model badge when available.
- **Cost session qualifier** — cost pill on board cards now shows "(session)" label with tooltip explaining the cost covers the entire session, not just the task.
- **Status light tooltips** — the colored status dot on board cards now has a tooltip explaining each state: "Active — healthy", "Active — moderate issues", "Active — high error rate", "Session ended".
- **Session analytics in Analytics page** — analytics panel moved from sessions page to the Analytics page as a "Sessions" first tab.
- **Graph tab in Analytics** — Graph page embedded as a lazy-loaded tab in Analytics, removing the standalone `/graph` route.
- **Sessions page tabs** — sessions page restructured from Sessions/Analytics to Sessions/Messages/Prompts tabs.

### Changed
- **Card layout polish** — tighter spacing, smaller badges, conditional row rendering for minimal-data cards, `line-clamp-2` titles, `flex-wrap` on badge row.
- **Sidebar streamlined** — Messages and Graph removed from sidebar nav (now tabs within Sessions and Analytics respectively).
- **Analytics page** — now has 6 tabs: Sessions, Usage, Costs, Activity, Graph, Discover.

### Removed
- **Standalone Messages route** — `/messages` removed, content is now a tab in Sessions.
- **Standalone Graph route** — `/graph` removed, content is now a tab in Analytics.
- **Standalone Prompts route** — `/prompts` removed, content is now a tab in Sessions.

### Fixed
- **"Open Full Detail" 404** — removed broken link from board task popout footer that navigated to a non-existent `/tasks/` route.
- **"View Full Session" navigation** — sessions page now reads `?highlight=` query param, auto-expands the matching session, scrolls to it, and shows a brief blue highlight ring.
- **Dashboard message previews showing YAML frontmatter** — `shortSummary` now strips frontmatter before truncating. Also fixed server-side in session scanner.
- **Milestone status stuck in backlog** — workflow-framework v0.5.0 stopped updating ROADMAP.md on task changes, but our milestone status used ROADMAP.md as an override. Removed that stale override path; milestone status now computed from child tasks, with MILESTONE.md `status_override` as the only manual override.

### Changed
- **Manual milestone archive** — milestones with all tasks done now stay visible on the board instead of auto-archiving. An "Archive" button appears on the milestone progress bar when 100% complete.

### Removed
- **SessionHealthPanel from sessions page** — duplicated active session data already shown on dashboard.
- **Project filter dropdown from board** — redundant now that the project zone provides project-level navigation. Priority and Flagged filters remain.

### Added
- **`planned` status mapping** — workflow-framework's new `planned` milestone status now explicitly maps to the backlog board column.
- **Workflow-framework integration contract** — CLAUDE.md now documents the exact field contract, status mapping, and coordination requirements between Agent CC and the workflow-framework plugin.

### Added
- **Stale project auto-pruning** — projects whose directories no longer exist on disk are automatically removed after 3 consecutive scan cycles. Cascade removes relationships and board colors. Temporarily missing directories (e.g., unmounted drives) are not pruned.
- **Manual project deletion** — "Remove Project" button on project popout with confirmation dialog. `DELETE /api/projects/:id` endpoint with cascade cleanup. Cannot delete the current project.
- **Board filter safety** — project filter automatically clears stale project IDs when projects are deleted or pruned, preventing empty board states.

### Added
- **Three-zone workspace** — board page restructured into a viewport-filling layout with project cards (35%), kanban board (35%), and archive graveyard (30%). No more unbounded vertical scrolling.
- **Project info-radiator cards** — compact cards showing health status, milestone/task progress bar, session count, and cost. Click opens a floating detail popout; clicking the current project navigates to the detail page.
- **Archive zone** — completed milestones displayed in a dimmed graveyard at the bottom of the workspace, yielding space to the terminal panel when open.
- **Delete endpoint for DB-stored tasks** — `DELETE /api/board/tasks/:id` with confirmation dialog in the task popout. Only available for ingested tasks (itm- prefix), not workflow file tasks.
- **Task source field** — `BoardTask.source` distinguishes "db" vs "workflow" tasks, used by the delete button to conditionally render.
- **5-column kanban flow** — `/work-task` skill now moves tasks through all columns: backlog → ready → in_progress → review → completed. Sibling pending tasks move to "ready" when a milestone is dispatched.

### Changed
- **Projects page removed** — `/projects` now redirects to the workspace where project cards live. Individual `/projects/:id` detail pages still accessible.
- **Board layout** — kanban columns are now height-constrained with internal scroll instead of growing the page.

### Fixed
- **Pipeline Test stale data** — removed 6 orphaned test cards and their milestone from the database.
- **Health color consistency** — project popout now uses the same color palette as project cards (emerald/amber/slate, not green/yellow/gray).

### Removed
- **Standalone projects listing** — replaced by workspace project zone. Nav sidebar "Projects" item removed.

### Added (prior session, continued)
- **Workflow bridge** — kanban board natively discovers and displays claude-workflow task files from `.claude/roadmap/<milestone>/` directories. Workflow tasks appear alongside regular `.claude/tasks/` items with no configuration needed.
- **Status bridge** — workflow statuses (`pending`, `in_progress`, `completed`, `cancelled`, `blocked`) map to board columns automatically. Board moves write back in workflow format, preserving all workflow-specific frontmatter fields (milestone, complexity, parallelSafe, phase, filesTouch).
- **Synthetic milestones** — each workflow milestone directory produces a milestone card on the board with computed progress (done/total), title derived from directory name, and status computed from child tasks. ROADMAP.md descriptions and MILESTONE.md status overrides are respected.
- **Workflow integration tests** — 9 end-to-end tests covering discovery, status mapping, board move write-back, milestone grouping, session linking, and coexistence with regular tasks.
- **Dashboard recent activity popout** — Recent Activity moved from inline side panel to a popover button with activity count badge, freeing dashboard space for Active Sessions to span full width.
- **Terminal toggle button** — separate open/close buttons consolidated into a single toggle that changes icon (chevron down/up) based on panel state.
- **Board milestone archive** — completed milestones can be archived off the active board. Fully-completed milestones auto-archive. Archived milestones accessible via collapsible section. Archive state persisted in agent-cc storage.
- **Board task floating popout** — task detail panel replaced with a floating popout anchored near the clicked card. Positioned intelligently (left/right of card based on screen position), dismissible via outside click or Escape.
- **Terminal ping keepalive** — client sends 30-second ping messages to prevent WebSocket connections from dying during tab inactivity. Server responds with pong and sends its own protocol-level pings to detect dead connections.
- **Terminal expired state recovery** — terminals that hit the 5-minute reconnect timeout can now be re-established via visibility change or user input, instead of requiring a page reload.
- **Draggable explorer panel** — terminal explorer panel width is now resizable via a drag handle on its left edge (100-400px range, default 140px). Width persists in the terminal group store.
- **Session ID write-back** — subagents dispatched by `/work-task` now self-write their session ID into task frontmatter as their first action, completing the session-to-task linking automation loop.

### Fixed
- **Workflow write-back data loss** — board moves on workflow files previously destroyed workflow-specific frontmatter fields by roundtripping through TaskItem model. Now uses targeted field updates that preserve all original frontmatter.
- **Message timeline "(no content)"** — messages with only tool_use/tool_result blocks now show tool names (e.g., "Used: Read, Edit, Bash") instead of "(no content)". User messages with raw XML system tags are stripped.
- **Dead `autoTagByPath` workflow option** — toggle referenced removed tag system, now cleaned up from types, DB defaults, processor, and UI.
- **Misleading empty states** — DecisionLogPanel no longer references the removed "Extract Decisions" button.
- **Terminal disconnects after tab inactivity** — WebSocket connections silently died in background tabs due to missing keepalive. Added client/server ping/pong (30s interval), WebSocket constructor error handling, and stale connection cleanup.
- **Stale pipeline project on board** — fully-completed milestones (including the old pipeline-removal milestone) now auto-archive instead of cluttering the board.

### Removed
- **Session tags** — word-frequency tag system removed entirely. Tags were top-4 common words from user messages, producing meaningless results. Can be re-added with a better algorithm.
- **Delegate bar** — Terminal, Telegram, Voice, and Extract Decisions buttons removed from session detail view (no API backing).
- **Summarize AI button** — single-session and batch summarize buttons removed (no API backing). Existing auto-generated summaries still display.
- **Session delegation backend** — `session-delegation.ts` deleted, 5 API routes removed (delegate, decisions extract, summarize, summarize-batch, context). Read-only decisions and summary endpoints retained.
- **Keyboard shortcut button** — removed from dashboard (overlay still accessible via `?` key).

## [2.1.0] — 2026-04-08

### Added
- **Board-session integration** — board cards are now info radiators showing live session data. When a session is linked to a task, the card shows a status light (green/amber/red pulsing dot), model badge (e.g. "Sonnet 4.6"), agent activity line, message count, duration, token count, and cost. Cards without sessions keep the existing minimal layout.
- **Session enricher** — new `server/board/session-enricher.ts` module bridges the task scanner and session analytics, looking up cost, health, model, and activity data for linked sessions
- **Session detail in side panel** — clicking a card with a linked session shows a detail grid: model, health score, messages, duration, tokens (in/out), cost, and a link to view the full session
- **Manual session linking** — side panel has a "Link Session" button that shows a picker of recent sessions. Linked sessions can be unlinked. No pipeline required.
- **`GET /api/board/tasks/:id/session`** — API endpoint returning session enrichment for a board task
- **`POST /api/board/tasks/:id/link-session`** — API endpoint to link/unlink a session to a task
- **`session-updated` SSE event** — board event bus emits session updates for real-time card refresh
- **`getSessionHealth()`** — new export from session-analytics matching the existing `getSessionCost()` pattern
- **`sessionId` field on tasks** — standalone field (not pipeline-prefixed) for manually linking sessions to task files

### Fixed
- **`pipelineSessionIds` persistence** — field was defined on `TaskItem` but never read/written by `task-io.ts`, causing session links to be lost on restart. Now persisted.
- **`pipelineSummary` persistence** — same gap, now persisted
- **Session enrichment performance** — sessions array fetched once per board refresh instead of per-task (avoids O(n) array copies)
- **Duration edge case** — single-message sessions (0ms duration) now show "<1m" instead of blank

### Removed
- **Task automation pipeline** — manager, workers, budget tracking, git-ops, event bus (`server/pipeline/` directory)
- **Pipeline API routes** — `/api/pipeline/*` endpoints (start, pause, resume, approve, cancel, descope, config, status, events)
- **Pipeline client hooks and stage resolution** — `use-pipeline.ts`, `pipeline-stages.ts`, `client/src/types/pipeline.ts`
- **Pipeline-specific fields from TaskItem and BoardTask types** — `pipelineStage`, `pipelineActivity`, `pipelineCost`, `pipelineSummary`, `pipelineSessionIds`
- **Pipeline state from database schema** — `pipelineState` removed from DB
- **Pipeline freeze guard from board move API** — board moves no longer check for active pipeline runs
- **10 pipeline test files** — `pipeline-budget`, `pipeline-events`, `pipeline-types`, `pipeline-git-ops`, `pipeline-worker`, `pipeline-manager`, `pipeline-routes`, `pipeline-integration`, `pipeline-claude-runner`, `pipeline-board-ui`
- **Pipeline documentation** — test guide, specs, and implementation plans
- **Pipeline manager singleton** — `server/pipeline/singleton.ts`
- **Legacy `/tasks` page** — page component, 6 UI components (`pipeline-board`, `milestone-swimlane`, `pipeline-task-card`, `project-picker`, `task-detail-panel`, `task-sidebar`), `use-tasks` hook, and server-side `/api/tasks/` routes all removed. Superseded by `/board`. Underlying `task-io` and `task-scanner` modules retained (still used by board)
- **Tasks nav entry** — removed from sidebar; Projects no longer has a Tasks child item
- **Stale feature branches** — deleted 5 merged local branches (`feat/pipeline-kanban-ui`, `feat/task-management`, `feat/terminal-group-redesign`, `feat/terminal-reliability`, `feat/theme-aesthetic-profiles`)

### Added
- **Terminal group redesign** — VS Code-style terminal groups replace flat tabs. Groups contain 1+ terminal instances shown side by side with resizable split panes (allotment). Explorer sidebar on the right shows all groups with tree connectors, status dots, close buttons, inline rename, and right-click context menu (Rename/Split/Kill). Unread activity indicators for background groups. 4 rounds of Codex adversarial review, 11 findings fixed.
- **TerminalInstanceManager** — singleton class owns all xterm.js Terminal + WebSocket lifecycles independent of React. Terminals survive group switches without reconnect — instant attach/detach with preserved scroll position and output buffer.
- **Zustand terminal store** — replaces React hook with app-scoped state for group CRUD, persistence, unread tracking, and server sync with 300ms debounce.
- **Terminal reliability** — terminals survive page refreshes and brief disconnects. Sessions stay alive on the server for 5 minutes, client auto-reconnects with exponential backoff, output history is replayed on reconnect. Tab indicators show connection state (green/yellow/red). Explicit kill on tab close with HTTP fallback when disconnected. 2 rounds of Codex adversarial review, 7 findings fixed.
- **Ring buffer** — server-side circular buffer (50K chunks) captures terminal output for replay on reconnect
- **Shell type detection** — server reports shell type (bash/zsh/powershell) on PTY creation, used as default terminal name

### Changed
- Terminal panel rewritten from flat tab model to group-based architecture
- TerminalInstance component reduced from 320 lines to 25-line mount point
- Old `use-terminal.ts` hook deleted, replaced by zustand store

### Fixed
- Terminal styling restored — xterm.css import was dropped during redesign, causing garbled escape sequences (visible title characters) over terminal panes
- Terminal reconnection after tab sleep — added `visibilitychange` listener that force-reconnects all disconnected/expired terminals when the browser tab becomes visible again
- Terminal clear on new session — when server-side PTY expired and reconnect creates a fresh session, old disconnect messages are cleared instead of piling up
- Split terminal width redistribution — removing a split pane now redistributes space equally among remaining panes (previously only the adjacent pane absorbed the freed space)
- Tab-to-group migration preserves existing terminal layouts, split views, and panel preferences on upgrade
- Panel remount no longer kills live PTY sessions (guards with `manager.has()`)
- Persistence suppressed until server state loads — transient fetch failures can't overwrite valid data
- Empty group state persisted so deleting last terminal group is durable across refresh
- PTY geometry synced immediately on attach — no stale 80x24 after restore
- User-renamed terminals preserved across reconnect and restore (userRenamed flag)
- Rename input capped at 100 chars to match server validation schema
- Migration validates activeGroupId — stale references fall back to first group
- Split terminal no longer creates phantom PTY sessions — each tab renders exactly once in the correct pane
- Split state normalized on every reducer action — prevents stuck layouts from stale persisted state

### Previously Added
- **Centralized kanban board** — cross-project board at `/board` aggregates tasks from all projects into 5 columns (Backlog → Ready → In Progress → Review → Done). Includes:
  - Board types, column definitions, cross-project aggregator with per-project colors
  - Dependency validation with flagging (advise, not block) and auto-unflag
  - Board API routes: GET state/stats, POST move with validation, POST roadmap ingest, SSE events
  - Roadmap ingest parser (markdown → milestones + tasks with dependency resolution)
  - React Query hooks with 10s polling fallback and SSE auto-reconnect with backoff
  - Rich task cards (project colors, priority badges, tags, activity, cost, assignee)
  - Side panel with task details, move controls, flag dismissal
  - Filter bar (project, priority, flagged) with milestone progress indicators
  - 7 new test files, 47 tests covering types, aggregator, validator, events, routes, filters, integration
  - 7 rounds of Codex adversarial review, 16 bugs caught and fixed
- **Task automation pipeline** (removed) — was a server-side pipeline manager orchestrating Claude CLI workers in git worktrees. Superseded by human-first kanban board approach.
- **Workflow system design** — spec for markdown-based project workflow system (ROADMAP.md → milestones → tasks) with YAML frontmatter, tags, status lifecycle, and kanban integration. Skill-based approach keeps CLAUDE.md lean.
- **Session rename** — click the pencil icon on any active session to give it a meaningful name. Custom names appear everywhere: Dashboard, Sessions page, and health panel. Names persist across restarts
- **Data size health threshold** — session file size now color-coded (green < 500KB, yellow 500KB–2MB, red > 2MB), configurable in Settings alongside existing thresholds
- **Analytics tabs** — Sessions page Analytics panel converted from 12 vertically-stacked sections to 10 individual tabs with URL persistence (`?atab=` param)

### Changed
- **Model tags** — now show versioned names (Opus 4.6, Sonnet 4.6, Haiku 4.5) instead of just family name
- **Dashboard layout** — active sessions and recent activity have fixed height with scroll (~3 cards visible, scrollable); removed stat cards, quick actions, session stats, system card, and recent changes sections
- **Dashboard accents** — decorative green highlights (status dots, live border, running agent indicators, new session ring, cost display) now use theme-aware primary color instead of hardcoded green. Health traffic-light colors (green/yellow/red) unchanged
- **CSS animations** — `live-border` pulse and glow classes now use `--primary` CSS variable, adapting to active theme (orange in Anthropic, blue in default dark)
- **Sessions top bar** — restructured into two rows: title + search on top, filters + actions below. Filter buttons use theme primary accent when active
- **Project paths** — encoded project keys now display as readable paths (`~/dev/projects/agent-cc` instead of dashes)
- **Health threshold colors** — message count and cost on active session cards colored green/yellow/red based on configured thresholds

### Removed
- **Session stat cards** — Total/Storage/Active/Empty cards removed from Sessions page (info already in subtitle)

### Removed
- **Ask a Question** — NL query section removed from analytics (AI integration not a current focus)
- **Smart Context Loader** — context generation section removed from analytics
- **Continuation Panel** — "Pick up where you left off" section removed from analytics

### Fixed
- **Health thresholds migration** — existing databases created before the health feature now get default thresholds backfilled automatically
- **Session health indicators** — active session health panel on Sessions page showing context usage progress bar, cost, and message count with color-coded thresholds (green/yellow/red)
- **Configurable health thresholds** — Settings page section to customize when indicators change color, with validation (yellow < red) and reset to defaults
- **Smart polling** — live data polling adjusts automatically: 5s when sessions are active, 30s when idle (was fixed 3s)
- **Deploy script** — `scripts/deploy.sh` handles build, kill, restart, and verification in one command
- **Session handoff notes** — `docs/handoff/` directory for carrying in-progress work between sessions, integrated into `/wrap-up` skill

- **Cost indexer** — new `cost-indexer.ts` module incrementally parses JSONL files, stores structured `CostRecord` objects in `agent-cc.json` with exact model versions, pricing snapshots, and subagent parent-child relationships
- **Compute/cache cost split** — daily chart now shows stacked bars for compute (input+output) vs cache (read+write) costs with legend
- **Exact model versions** — model breakdown shows full model strings (`claude-opus-4-6`) instead of family names (`opus`), with per-category token columns (In/Out/Cache Rd/Cache Wr)
- **Subagent cost attribution** — top sessions show subagent count and cost rolled up to the parent session
- **Session cost detail endpoint** — `GET /api/analytics/costs/session/:id` returns per-session breakdown including subagent costs and applied rates
- **Costs page time period selector** — 7d / 30d / 90d pill toggle, all data scoped to selected window
- **Weekly cost comparison** — banner showing this week vs last week spend with % change
- **Top sessions table** — 20 most expensive sessions with model and cost

### Fixed
- **Service restart hang** — SIGTERM handler now closes HTTP server and exits process, so `systemctl restart` completes instantly instead of timing out after 90s
- **Subagent JSONL path** — indexer was looking for subagents at `{projectDir}/subagents/` instead of `{projectDir}/{sessionId}/subagents/`, missing all sonnet/haiku subagent cost data
- **Project name display** — `decodeProjectKey` is lossy (hyphens become slashes), so "agent-cc" displayed as "cc". Now uses entity lookup with `path.basename()` for correct names
- **Partial line data loss** — indexer advanced offset to file size even when last JSONL line was incomplete (mid-write). Now only advances through last complete newline
- **Cost record ID collision** — two assistant responses in the same second with the same model produced identical IDs, silently dropping one. Added line index to hash
- **Index state persistence** — deletions and offset changes weren't persisted when no new records were inserted, causing stale data after restart
- **Model column layout** — long model names (`claude-haiku-4-5-20251001`) blew out column alignment. Stripped `claude-` prefix, condensed to 4 columns
- **Session click 404** — top sessions linked to nonexistent `/sessions/:id` route
- **Opus 4.5/4.6 pricing** — was using Opus 4.0 rates ($15/$75 per MTok), actual Opus 4.6 rate is $5/$25. Costs were inflated 3x
- **Haiku 4.5 pricing** — was using Haiku 3.5 rates ($0.80/$4), actual Haiku 4.5 rate is $1/$5
- **Live-scanner cost estimate** — was applying cache-read rate (10%) to all input tokens instead of proper per-category rates
- **Unified pricing module** — cost-analytics.ts was duplicating pricing definitions; now imports from single source
- **Cache savings calculation** — was hardcoded to Sonnet pricing; now uses dominant model's actual rates
- **Weekly comparison accuracy** — was computed from truncated daily window (broken in 7d mode, off-by-one in all modes); now computed from raw token data with equal half-open 7-day ranges
- **Plan limit comparison** — was using period-scoped total against monthly cap; now uses dedicated 30-day `monthlyTotalCost`
- **Cost totals scoped to period** — `/api/analytics/costs` totals were all-time while chart showed 30 days; now both respect the `days` query param
- **Token display in top sessions** — was only showing input+output; now includes cache tokens so numbers explain the cost

### Changed
- **Cost analytics route** — rewrote from 488-line async JSONL parser to 30-line sync query layer over cost-indexer; response shape changed from flat token counts to structured `CostSummary` with token breakdowns per model/project/day

### Changed
- **Embedded terminal panel** — VS Code-style bottom panel with xterm.js rendering and node-pty backend. Features: multiple terminal tabs, side-by-side split view (max 2 panes), resizable drag handle, collapsible panel, state persistence across navigation and reloads. WebSocket bridge at `/ws/terminal` with origin validation, sanitized environment, cwd restriction to home directory, and max 10 concurrent terminals
- **Terminal React hooks** — `useTerminalPanel()` and `useUpdateTerminalPanel()` for panel state management

### Changed
- **UI consolidation** — reduced sidebar navigation from 15 items to 11 by merging related pages:
  - Dashboard + Live View → Dashboard (combined status bar, active sessions, recent activity)
  - Messages + Prompts → Messages (split-screen: message history left, prompt templates right)
  - Activity & Discover + Analytics & Cost → Analytics (four tabs: Usage, Costs, Activity, Discover)
  - APIs removed from sidebar (route still accessible directly)
- **Fluid page width** — removed rigid `max-w-[1400px]` from all pages; content now fills available screen width dynamically
- **Analytics deep-linking** — `/stats?tab=discover` and `?tab=activity` link directly to specific tabs; old routes (`/live`, `/prompts`, `/activity`) redirect to merged destinations
- **Task project picker** — replaced sidebar project list with dropdown combobox in top bar, eliminating double-sidebar clutter
- **Project scanner** — fixed phantom projects (Docker, Tron, home dir) appearing in project list; session key fallback now requires project markers; home-level infra dirs excluded
- **Anthropic Dark theme** — replaced warm brown palette with neutral greys matching Claude app UI; accent color updated to Anthropic brand orange (#da7756); now the default theme
- **Terminal colors** — theme-reactive: background, foreground, cursor, and selection colors now derive from the active theme and update live on theme switch; separate ANSI palettes for dark and light variants
- **Terminal panel UI** — replaced text symbols with Lucide icons (Plus, X, Columns2, ChevronUp/Down, Terminal); improved drag handle hover feedback; polished collapsed state bar
- **Markdown editor theming** — editor now matches the selected theme; dynamic `data-color-mode` based on theme variant with CSS overrides mapping editor backgrounds, toolbar, borders, code blocks, tables, and links to theme variables
- **Deployment** — switched from Docker to bare metal systemd service for reduced friction

### Fixed
- **Terminal security** — WebSocket origin validation, sanitized PTY environment, cwd restriction, terminal ID collision handling, max 10 concurrent terminals, cols/rows bounds checking
- **Terminal React state** — rewrote panel with useReducer for atomic state transitions, fixed stale closures in resize/persist handlers
- **Shell fallback** — use `/bin/sh` instead of `bash` for cross-platform compatibility (Alpine, minimal containers)
- **Build externals** — keep node-pty and ws as external requires (native addon can't be bundled)
- **Horizontal scroll** — prevented infinite horizontal scrolling on main content area

### Removed
- **Docker deployment for Agent CC** — replaced with bare metal systemd; other homelab services still use Docker
- **Task sidebar component** — replaced by dropdown project picker
- **App brand icon** — removed gradient Terminal icon from sidebar and associated brand-glow CSS animations; placeholder for new icon

## [2.1.0] - 2026-04-05

### Added
- **Task management** — project-level task boards with kanban view, drag-and-drop, and markdown-based task files. Tasks are stored as `.md` files with YAML frontmatter in `{project}/.claude/tasks/`, following the same pattern as skills and memories. Features: flexible hierarchy (roadmap → milestone → task or any user-defined structure), customizable statuses/types/priorities, rich task cards with priority colors and description preview, slide-out detail panel, inline task creation, and board setup flow for new projects
- **Task API** — full CRUD endpoints at `/api/tasks/` with optimistic concurrency control, atomic file writes, column reorder, and board config management
- **Task sidebar navigation** — Tasks appears as a sub-item under Projects in the sidebar, with project picker and hierarchy tree

### Fixed
- **CORS behind reverse proxy** — added `ALLOWED_ORIGINS` env var so the app works when accessed via Caddy (`acc.devbox`) instead of localhost
- **Drag-and-drop crash** — fixed crash when dragging tasks due to incomplete column order initialization
- **Drag-and-drop duplicates** — fixed duplicate card entries when dragging between columns (reorder + status change both wrote to columnOrder)
- **Task directory permissions** — created directories now use 775 mode for Docker volume compatibility
- **Save feedback** — detail panel now shows toast and closes on save

### Changed
- 1956 tests across 22 test files, all passing
- New npm dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for drag-and-drop

## [2.0.0] - 2026-04-04

Project reborn as **Agent CC** (Agent Control Center). Originally started as a fork of sorlen008/claude-command-center, the project diverged significantly and was re-established as an independent private project.

### Changed
- Renamed from "Claude Command Center" to "Agent CC" across entire codebase
- New private GitHub repo (no longer a fork)
- Data directory changed from `~/.claude-command-center/` to `~/.agent-cc/`
- Env var changed from `COMMAND_CENTER_DATA` to `AGENT_CC_DATA`
- Database file renamed from `command-center.json` to `agent-cc.json`
- Caddy subdomain changed from `ccc.devbox` to `acc.devbox`
- Removed MIT license, CONTRIBUTING.md, SECURITY.md, and other public open-source artifacts
- Reset version to 2.0.0 to mark the clean break

### Carried forward from pre-2.0
- 14 themes with aesthetic profiles (Dark, Light, Glass, Anthropic Light/Dark, Catppuccin Mocha, Nord, Dracula, Tokyo Night, Solarized Dark, and more)
- Full session intelligence (deep search, AI summaries, cost analytics, file heatmap, health scores)
- Operations nerve center, continuation intelligence, bash knowledge base, decision log
- Docker support, security hardening, path traversal protection, MCP secret redaction
- 1792+ tests across 19 test files
