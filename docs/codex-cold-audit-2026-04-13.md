# Codex Cold Audit - 2026-04-13

Scope: cold read of the repository, explicitly excluding `archive/`. I did not edit source code. The only write from this audit is this report.

Commands used: source file inventory via `rg --files`/`find`, TypeScript AST import graph from `client/src/main.tsx` and `server/index.ts`, direct `rg` consumer checks, `git status --short`, `git ls-files`, `git check-ignore`, and `npm run check -- --noUnusedLocals --noUnusedParameters`.

Note: `docs/cold-audit-2026-04-13.md` already existed as an untracked file before this audit. I left it untouched.

## Executive Summary

The codebase is generally navigable, but it has clear cleanup residue from recent UI moves: old sessions and analytics panels remain in source, tests still pin some removed-era exports, and several files/components are no longer production-reachable. The strict TypeScript unused pass also shows a broad layer of unused imports, dead locals, and abandoned helper components that normal `npm run check` does not catch because `noUnusedLocals`/`noUnusedParameters` are not enabled in `tsconfig.json`.

The highest-value cleanup areas are:

1. Remove or rehome old analytics/session panels that were superseded by `/analytics` tabs.
2. Delete production-unreachable components/pages that now only have tests or comments as consumers.
3. Consolidate duplicated formatting and library-tab patterns.
4. Resolve naming/shape confusion around `discover` vs `discovery`, `DiscoverTab` vs `DiscoverPanel`, and the two `SessionHealthPanel` implementations.

## Dead Code And Unused Surface

### 1. Production-unreachable files from the AST import graph

The AST import graph started from `client/src/main.tsx` and `server/index.ts`, excluding tests, `dist/`, `node_modules/`, `.git/`, and `archive/`. It found 290 source files and 279 production-reachable files. The non-reachable source files were:

- `client/src/components/board/board-filters.tsx`
- `client/src/components/health-indicator.tsx`
- `client/src/components/onboarding-wizard.tsx`
- `client/src/components/session-health-panel.tsx`
- `client/src/components/stat-card.tsx`
- `client/src/hooks/use-count-up.ts`, only imported by dead `stat-card.tsx`
- `client/src/hooks/use-debounce.ts`, only imported by dead `pages/sessions.tsx`
- `client/src/pages/activity.tsx`
- `client/src/pages/prompts.tsx`
- `client/src/pages/sessions.tsx`
- `script/build.ts`, not imported by source but live through `package.json`'s `build` script

Interpretation: `script/build.ts` is live as tooling. The rest are source-level dead or disabled unless they are intentionally kept for future work.

### 2. Old Sessions page is orphaned

`client/src/App.tsx` redirects `/sessions` to `/analytics?tab=sessions` and never lazy-loads `client/src/pages/sessions.tsx` (`App.tsx:83-85`). The old page still contains its own `SessionsPanel`, search/highlighting helpers, duplicated formatting helpers, and imports `MessagesTab` as `MessagesTabContent` (`client/src/pages/sessions.tsx:1-76`).

Impact:

- `client/src/pages/sessions.tsx` is dead in production.
- `client/src/hooks/use-debounce.ts` is dead transitively because the old sessions page is its only production consumer.
- Multiple tests still read the old file directly, so deleting it will require test cleanup.

### 3. Disabled onboarding wizard is leftover scaffolding

`client/src/App.tsx:14-15` comments out the import, and `client/src/App.tsx:51` comments out the render with "disabled - will be rewritten". The actual component remains in `client/src/components/onboarding-wizard.tsx`, but it has no production importer.

Recommendation: either schedule the rewrite and keep it deliberately, or delete the component and reintroduce it when the rewrite starts. Right now it is explicit stale scaffolding.

### 4. Old analytics panel module is partially live, mostly stale

`client/src/components/session-analytics-panel.tsx` exports a mix of live and dead panels:

- Dead exports by consumer scan: `SessionAnalyticsTab` (`line 36`), `FileHeatmapPanel` (`line 182`), `SessionHealthPanel` (`line 246`), `NerveCenterPanel` (`line 393`), `WeeklyDigestPanel` (`line 513`), `PromptLibraryPanel` (`line 558`)
- Live exports: `BashKnowledgePanel` (`line 454`) used by `client/src/pages/library.tsx`; `WorkflowConfigPanel` (`line 631`) used by `client/src/pages/settings.tsx`

This is a structural smell: two live panels are keeping a large legacy mixed-purpose analytics module alive. Extracting `BashKnowledgePanel` and `WorkflowConfigPanel` to focused files would make the dead panels straightforward to remove.

### 5. `client/src/components/session-health-panel.tsx` is dead and name-conflicts with another implementation

There are two exported `SessionHealthPanel` functions:

- `client/src/components/session-health-panel.tsx:125`
- `client/src/components/session-analytics-panel.tsx:246`

The standalone file is production-unreachable. Tests still reference the standalone health panel behavior directly. The duplicated name makes it easy to import the wrong one and obscures which health UI is current.

### 6. `client/src/components/board/board-filters.tsx` is dead

No production importer exists. The board now uses `applyBoardFilters` from `client/src/hooks/use-board.ts` directly in `client/src/pages/board.tsx`; `board-filters.tsx` remains as an unused component. It also accepts `milestones` but never reads it (`client/src/components/board/board-filters.tsx:8-14`), which TypeScript flags under `noUnusedParameters`.

Tests explicitly assert that the file still exists, so cleanup will need matching test changes.

### 7. `client/src/components/health-indicator.tsx`, `client/src/components/stat-card.tsx`, and `client/src/hooks/use-count-up.ts` are dead

No production importers were found. `stat-card.tsx` is only referenced by a polish test that checks CSS classes; `use-count-up.ts` is only pulled in by `stat-card.tsx`.

### 8. `client/src/pages/activity.tsx` and `client/src/pages/prompts.tsx` are dead route remnants

`client/src/pages/activity.tsx` is now only a redirect component, but `App.tsx` handles `/activity` inline with a redirect to `/analytics?tab=nerve-center`. The file is production-unreachable.

`client/src/pages/prompts.tsx` has no production importer. `client/src/pages/prompts-panel.tsx` is live via Library, which suggests `prompts.tsx` is an old page-level wrapper from the Library migration.

### 9. Dead tabs inside live files

`client/src/pages/stats.tsx` defines `UsageTab` (`line 128`) and `ActivityTab` (`line 273`), but the rendered `Tabs` only include `nerve-center`, `costs`, `charts`, `sessions`, and `messages` (`lines 388-417`). That leaves the overview usage and watcher activity UI dead inside the live analytics page.

`client/src/components/library/agents-tab.tsx` defines the current sub-tabs as only `"installed" | "library" | "discover"` (`lines 59-63`, rendered at `lines 105-128`), but still contains `HistoryTab`, `ExecutionCard`, and `StatsTab` (`lines 499-682+`). Because no sub-tab can select history or stats, those functions are unreachable.

## Unused Imports, Locals, And Parameters

`npm run check -- --noUnusedLocals --noUnusedParameters` failed with many unused-symbol diagnostics. Normal `npm run check` does not include these flags, so this is latent cleanup rather than a current CI failure.

Representative unused-symbol clusters:

- App/route leftovers: `Projects` lazy import in `client/src/App.tsx:18`; `UsageTab`/`ActivityTab` in `client/src/pages/stats.tsx`; `BarChart3`/`Settings` in dead `client/src/pages/sessions.tsx`.
- Analytics/cost tabs: unused icons and helpers across `CacheEfficiency.tsx`, `ModelIntelligence.tsx`, `SessionProjectValue.tsx`, `SystemPromptOverhead.tsx`, `TokenAnatomy.tsx`.
- Board: unused `useCallback` in `board-side-panel.tsx`; unused `Cpu`, `CostPill`, `SessionStats`, `shortenModel`, `formatAgentRole`, `LastSessionSnapshot`, and `priorityColors` in `board-task-card.tsx`.
- Library: unused handler/import residue in `skills-tab.tsx`, `mcps-tab.tsx`, `plugins-tab.tsx`, and unused `HistoryTab`/`StatsTab` in `agents-tab.tsx`.
- Server routes/scanners: unused imports/locals in `server/routes/stats.ts`, `server/routes/sessions.ts`, `server/scanner/index.ts`, `server/scanner/session-parser.ts`, `server/scanner/session-scanner.ts`, `server/scanner/watcher.ts`, and others.

Recommendation: enable `noUnusedLocals` and `noUnusedParameters` only after a cleanup pass, or add a dedicated non-blocking audit script first. Turning them on immediately would create a broad failure.

## Duplicated Logic And Copy-Paste Patterns

### 1. Formatting helpers are copy-pasted widely

`formatUsd` and `formatTokens` are locally redefined in many files instead of using shared helpers:

- `client/src/pages/sessions.tsx:56-65`
- `client/src/pages/stats.tsx:45-54`
- `client/src/components/session-analytics-panel.tsx:17-23`
- `client/src/components/analytics/costs/CacheEfficiency.tsx`
- `client/src/components/analytics/costs/ModelIntelligence.tsx`
- `client/src/components/analytics/costs/SessionProjectValue.tsx`
- `client/src/components/analytics/costs/CostsTab.tsx`
- `client/src/components/analytics/costs/SystemPromptOverhead.tsx`
- `client/src/components/analytics/costs/TokenAnatomy.tsx`
- several chart files under `client/src/components/analytics/charts/`
- `server/cli/report.ts`

There is already `client/src/lib/utils.ts` for `formatBytes` and `relativeTime`; this is a good home for client-side `formatUsd`/`formatTokens`, with a server-safe equivalent if the CLI needs it.

### 2. Library tab sub-tab shells are repeated

`skills-tab.tsx`, `plugins-tab.tsx`, and `agents-tab.tsx` repeat the same installed/library/discover state and tab-bar rendering. `mcps-tab.tsx` uses the same pattern but with `"installed" | "saved" | "marketplace"`.

This repetition is now causing drift:

- Agents has dead `HistoryTab` and `StatsTab` remnants.
- MCPs has handlers/imports for copy/open-source paths that are no longer called directly because card actions inline the same behavior.
- Plugins imports unused icons and returns a constant installed status helper.

Recommendation: extract a tiny internal `LibrarySubTabs` helper or a shared tab-bar component, not a large abstraction. The goal is to remove repeated tab-shell code and reduce future migration residue.

### 3. Discovery UI and API are split into near-duplicates

There are two discovery routes:

- `server/routes/discover.ts` uses `gh search repos` for typed library searches at `/api/discover/:type/search` and `/api/discover/:type/sources` (`lines 79-101`).
- `server/routes/discovery.ts` uses GitHub's HTTP API for generic repository search at `/api/discovery/search` (`lines 7-69`).

There are also two `DiscoverTab` components:

- `client/src/components/discover-tab.tsx`, a generic GitHub search UI for the Library-level `discover` tab.
- `client/src/components/library/agents-tab.tsx:495-497`, a local wrapper around `DiscoverPanel entityType="agents"`.

This naming is easy to confuse: "discover" vs "discovery", `DiscoverTab` vs `DiscoverPanel`, typed library discovery vs generic GitHub discovery. If both API shapes are intentionally different, the names should encode that distinction, e.g. `library-discover` and `github-discovery`.

### 4. Session health display logic is scattered

Health colors/reasons are implemented in:

- `server/scanner/session-analytics.ts` for scoring and reasons.
- `client/src/components/session-analytics-panel.tsx` for an old health table.
- `client/src/components/session-health-panel.tsx` for a separate active-session panel.
- `client/src/components/board/session-indicators.tsx`
- `client/src/components/analytics/sessions/HealthDetails.tsx`, `SessionOverview.tsx`, and `SessionRow.tsx`.

Some of this is presentation-specific, but the duplicate `SessionHealthPanel` names plus dead health panels suggest the current surface could be simplified after deciding which health views are still product-supported.

## Structural Issues And Naming Inconsistencies

### 1. `session-analytics-panel.tsx` is a catch-all module in the wrong place

The file contains analytics tabs, file heatmaps, nerve center, bash knowledge, weekly digest, prompt library, workflows, and file timeline UI. Only Bash Knowledge and Workflows are live. The filename no longer describes the live responsibilities.

Recommendation: split live panels into `client/src/components/library/bash-knowledge-panel.tsx` and `client/src/components/settings/workflow-config-panel.tsx` or similar, then delete the stale analytics contents.

### 2. `pages/projects.tsx` vs `/projects` route naming is misleading

`App.tsx` defines `const Projects = lazy(() => import("@/pages/projects"))` but never renders it; `/projects` renders `BoardPage` instead (`client/src/App.tsx:17-26`, `58-60`). The `Projects` lazy import is dead and makes route ownership less clear.

### 3. Tests pin stale implementation details

Several tests assert that dead or migration-era files still exist or still export old panels:

- `tests/board-filters.test.ts` expects `board-filters.tsx` to exist even though the component is unused.
- `tests/analytics-nerve-center-subtabs.test.ts` expects old exports from `session-analytics-panel.tsx`.
- Multiple tests read `client/src/pages/sessions.tsx` even though `/sessions` now redirects to analytics.

These tests will block cleanup unless updated to assert the current product surface instead of the old source layout.

### 4. Build artifacts are present locally but ignored

`dist/` exists locally, but `git ls-files dist` returns nothing and `.gitignore` ignores it. This is not a tracked-code issue, but it can confuse broad file audits if not excluded. `node_modules/` is similarly present and ignored.

## Leftover Scaffolding From Rewritten Or Removed Features

- Onboarding rewrite placeholder: `client/src/App.tsx:14-15` and `51` explicitly disable `OnboardingWizard`.
- Analytics restructure remnants: old `SessionAnalyticsTab`, `NerveCenterPanel`, `FileHeatmapPanel`, `WeeklyDigestPanel`, `PromptLibraryPanel`, and `SessionHealthPanel` remain in `session-analytics-panel.tsx` while `/analytics` now renders the newer tab set in `stats.tsx`.
- Sessions redesign remnants: old `client/src/pages/sessions.tsx` remains while `/sessions` redirects to `/analytics?tab=sessions`.
- Activity merge remnants: `client/src/pages/activity.tsx` remains as a redirect while `App.tsx` already performs the `/activity` redirect inline.
- Agents sub-tab remnants: `HistoryTab`, `ExecutionCard`, and `StatsTab` remain after the agents sub-tabs were reduced to installed/library/discover.
- MCP marketplace placeholder: `client/src/components/library/mcps-tab.tsx` has a `Marketplace coming soon` tab. This may be intentional product scaffolding, but it is currently a placeholder surface.

## Suggested Cleanup Order

1. Update tests that pin stale files/exports to target current routes and UI behavior.
2. Delete or quarantine production-unreachable files: old sessions page, dead health/stat components, board filters, activity/prompts wrappers, and onboarding if the rewrite is not imminent.
3. Split `session-analytics-panel.tsx` so `BashKnowledgePanel` and `WorkflowConfigPanel` live in appropriately named modules; then remove dead analytics panels.
4. Remove dead functions inside live files: `UsageTab`/`ActivityTab` in `stats.tsx`, `HistoryTab`/`StatsTab`/`ExecutionCard` in `agents-tab.tsx`, unused route lazy imports in `App.tsx`.
5. Consolidate formatter helpers and the library sub-tab shell.
6. Rename or document `discover` vs `discovery` route responsibilities.
7. Run `npm run check -- --noUnusedLocals --noUnusedParameters` again and clean the remaining diagnostics in smaller batches.

## Verification Notes

- `git status --short` before writing this report showed one pre-existing untracked file: `docs/cold-audit-2026-04-13.md`.
- `npm run check -- --noUnusedLocals --noUnusedParameters` was intentionally run as an audit check and failed with unused-symbol diagnostics; no code was changed.
- `archive/` was excluded from all intentional source scans.
