# Cold Audit — Agent CC

**Date:** 2026-04-13
**Scope:** Full repo (server/, client/, shared/, tests/, docs/); `archive/` excluded.
**Method:** Four parallel cold-read audits (no prior context), consolidated. No code changed.
**Confidence legend:** 🟢 confirmed • 🟡 suspected • ⚪ cosmetic

---

## TL;DR

The codebase is in good shape — the major rewrites (workspace redesign, sessions/costs/messages redesigns, analytics flatten) left very little actual debris. The real issues cluster in **two categories**:

1. **Widespread formatting-helper duplication** on the client (`formatUsd`, `formatTokens`, `formatCost`, `formatDate` copy-pasted across ~15 files). No shared `lib/format.ts` exists.
2. **~1,500 lines of chain-dead code** on the client — one orphaned page + one unused analytics panel module whose sub-components aren't rendered.

Everything else is cosmetic (two confusingly-named route files, one stale doc comment, one `export` keyword that can be dropped).

---

## 1. Dead Code

### 1.1 🟢 Orphaned page: `client/src/pages/sessions.tsx`

~700 lines. No route in `client/src/App.tsx`, zero imports anywhere in the repo. Appears to be the pre-redesign sessions page left behind when the new list-detail layout moved under `components/analytics/sessions/SessionsTab.tsx`. Safe to delete.

### 1.2 🟢 Dead component: `client/src/components/health-indicator.tsx`

Zero imports outside its own file and `tests/library-tabs-migration.test.ts` (which references the name, not the module). Not rendered anywhere.

### 1.3 🟢 Chain-dead: `client/src/components/session-analytics-panel.tsx`

Exports: `SessionAnalyticsTab`, `FileHeatmapPanel`, `WeeklyDigestPanel`, `PromptLibraryPanel`, `SessionHealthPanel`, `BashKnowledgePanel`, `WorkflowConfigPanel`.

**Only `BashKnowledgePanel` (used in `library.tsx`) and `WorkflowConfigPanel` (used in `settings.tsx`) have live callers.** The other five exports are never imported. `SessionHealthPanel` lives in its own file (`session-health-panel.tsx`) and is imported here, meaning it's *transitively* dead — removing the dead exports would also free `session-health-panel.tsx`.

Recommendation: extract the two live panels into their own files (`bash-knowledge-panel.tsx`, `workflow-config-panel.tsx`) and delete the rest plus `session-health-panel.tsx`.

### 1.4 🟡 Onboarding wizard disabled but present

`client/src/components/onboarding-wizard.tsx` (~300 lines) is imported but commented out in `App.tsx:14-15,51` with `// OnboardingWizard disabled — will be rewritten later`. Intentional per the comment. No action unless you want to decide now whether the rewrite is really coming.

### 1.5 No dead server code

All 24 registered routes have live implementations. All `shared/types.ts` types have consumers (spot-checked: `FileTimelineEntry`, `ContinuationItem`, `ServiceStatus`, `StaleAnalytics`, `ContextSummary`, `BashKnowledgeBase` all have ≥2 callers). No orphaned scanner files. No `*-old.ts`/`*-legacy.ts`/`*_v1.ts` anywhere on the server.

### 1.6 ⚪ Minor: `DiscoverResult` exported but internal

`server/routes/discover.ts:9-14` exports an interface only used inside that file. Drop the `export` keyword.

---

## 2. Duplicated Logic

### 2.1 🟢 `formatUsd` — 12+ inline copies (HIGH IMPACT)

Same 4-tier branching (`≥1 → $X.XX`, `≥0.01 → $0.XX`, `≥0.0001 → $X.XXXX`, else `<$0.0001`) copy-pasted in:

- `server/cli/report.ts:20-24`
- `client/src/components/session-analytics-panel.tsx:17-21`
- `client/src/components/analytics/costs/TokenAnatomy.tsx:16-20`
- `client/src/components/analytics/costs/CostsTab.tsx:45-49`
- `client/src/components/analytics/costs/SessionProjectValue.tsx:14-18`
- `client/src/components/analytics/costs/ModelIntelligence.tsx`
- `client/src/components/analytics/costs/CacheEfficiency.tsx`
- `client/src/components/analytics/charts/token-economics/SubagentCostBreakdown.tsx:85-89`
- `client/src/components/analytics/charts/token-economics/APIEquivalentValue.tsx:75-81`
- `client/src/components/analytics/charts/file-activity/ProjectActivityComparison.tsx:59-63`
- `client/src/pages/sessions.tsx` (itself dead, see §1.1)
- `client/src/pages/stats.tsx`

**Root cause:** no `client/src/lib/format.ts`. Each new component reinvented it. Fix: extract once, import everywhere.

### 2.2 🟢 `formatTokens` — 5 copies

Same M/K abbreviation logic in `server/cli/report.ts`, `client/src/components/analytics/costs/CostsTab.tsx`, `client/src/components/analytics/charts/file-activity/ActivityTimeline.tsx`, `client/src/components/board/session-indicators.tsx` (this one is *exported* and re-imported by `SessionRow.tsx` — which is the correct pattern and should become the canonical home).

### 2.3 🟡 `formatCost` (simple `$X.XX`) — 5 copies

In `session-indicators.tsx`, `project-card.tsx`, `SessionRow.tsx`, `GraphSidebar.tsx`. Different from `formatUsd` (no micro-cent tier) but still a trivial copy-paste. Same fix as §2.1.

### 2.4 🟡 `formatDate` — 3 copies in chart files

Same `YYYY-MM-DD → "MMM DD"` logic in `ActivityTimeline.tsx`, `SidechainUsage.tsx`, `FileChurnRate.tsx` under `components/analytics/charts/file-activity/`.

### 2.5 🟡 Model pricing table duplicated client/server

`server/scanner/pricing.ts:16-28` is the source of truth. `client/src/components/analytics/charts/token-economics/APIEquivalentValue.tsx:42-49` mirrors it with a comment acknowledging the dup (client can't import server code).

**Risk:** server price update → client silently wrong. Fix options: (a) expose `/api/pricing`; (b) move the table into `shared/` and import both sides; (c) build-time codegen. Option (b) is the cheapest and matches how `shared/milestone-colors.ts` already works.

### 2.6 ✅ No-issue: subagent colors are already centralized

`client/src/components/analytics/sessions/subagent-colors.ts` is the shared home (`PALETTE`, `resolveToolOwner`, `colorClassForOwner`). CLAUDE.md mentions this was extracted in messages-redesign — the extraction held. No regressions.

### 2.7 ✅ No-issue: `computeCost` lives only in `server/scanner/pricing.ts`

Used via import in `cost-indexer.ts` and `session-analytics.ts`. Client's inline estimate in `APIEquivalentValue.tsx` uses a deliberately rougher 70/30 split — justified divergence, not a true dup.

---

## 3. Structural Issues

### 3.1 🟡 Confusing twin: `discover.ts` vs `discovery.ts`

Both registered, both live, different purposes:

- `server/routes/discover.ts` → `/api/discover/:type/sources`, `/api/discover/:type/search`, `/api/library/:type/save` — shells out to `gh` CLI, used by `client/src/hooks/use-library.ts`
- `server/routes/discovery.ts` → `/api/discovery/search` — uses `fetch` to GitHub API, used by `client/src/components/discover-tab.tsx`

Both have live consumers. The filenames differ by one letter and the feature-set overlaps (GitHub repo search). Rename one for clarity (e.g., `discovery.ts` → `discover-github.ts` or merge the two) and confirm which tab the user actually sees in production.

### 3.2 🟡 Stale doc reference in `session-tree-builder.ts:6`

```ts
/** See `docs/superpowers/specs/2026-04-12-session-hierarchy-design.md` */
```

That spec was moved to `archive/docs-superpowers/specs/...` during doc consolidation. The comment still resolves (file exists) but points at an archive path using an old location. Update the JSDoc or drop the reference.

### 3.3 ⚪ `server/cli/` and `server/services/` are the only non-conforming server dirs

- `server/cli/audit.ts`, `server/cli/report.ts` — dynamically imported from `server/index.ts:22-27` in CLI mode. Functional, borderline against the CLAUDE.md layout (`server/` is documented as routes/scanner/board/). Low-impact.
- `server/services/graph-builder.ts` — single-file directory, only consumer is `server/routes/graph.ts`. Could be inlined or moved into `server/scanner/`.

Neither is causing issues; flag only if you want to tighten the layout contract.

### 3.4 ✅ No misplaced files otherwise

All routes in `server/routes/`, all JSONL/analytics in `server/scanner/`, all board modules in `server/board/`, all tests in `tests/`, all shared types in `shared/`. Spot-checked import paths — no deep `../../../../` chains, all client imports use the `@/` alias cleanly.

### 3.5 ✅ Naming conventions consistent within each layer

Client components: kebab-case `.tsx` uniformly. Server: kebab-case `.ts`. The only outlier is `client/src/components/analytics/messages/search-highlight.tsx` — a kebab-case file in an otherwise PascalCase directory, but a comment at line 4 explains it's a shared context module, not a component. Acceptable.

---

## 4. Leftover Scaffolding

### 4.1 ✅ Redesigns left almost nothing behind

Verified cleanup from the big recent refactors:

- **Messages redesign** — legacy `message-history.tsx` gone, `PromptsPanel` extracted cleanly, barrel split avoids the circular import. No pre-redesign leftovers.
- **Sessions redesign** — new list-detail UI under `components/analytics/sessions/` is the only live path. The old `pages/sessions.tsx` is the one straggler (§1.1).
- **Analytics flatten** — decisions/workflows/prompts relocated correctly. `tests/api-routes.test.ts:403-410` has a `describe("removed decisions routes")` block that asserts they return 404. Strong anti-regression guard.
- **Nav consolidation** — all legacy routes in `App.tsx` (`/board`, `/skills`, `/plugins`, `/mcps`, `/agents`, `/markdown`, `/activity`, `/sessions`, `/stats`) are present as thin redirect stubs. These are doing their job; don't remove unless you drop backward compat deliberately.
- **Entity graph replacing topology** — no topology remnants found in server or client.
- **Session-hierarchy migration** — `shared/session-types.ts:42-44` properly marks `conversationTree` as `@deprecated` ("retained only for test compatibility; do not read in production"). Grep confirms no production readers. Legit.

### 4.2 ✅ No `-old`/`-legacy`/`-v1`/`-new` suffixed files in src

Clean.

---

## 5. Stale Comments

Only one finding worth mentioning:

- `server/scanner/session-tree-builder.ts:6` — see §3.2.

The following comment clusters were checked and are **not stale**, just documenting intentional behavior:

- `server/scanner/session-analytics.ts:113,202` — "legacy parent-only aggregation" comments document a graceful-degradation fallback for sessions without subagents. Current and correct.
- `server/task-io.ts:120` — "Try project-scoped lookup first... fall back to legacy unscoped" — documents backward compat for pre-scoped task files. Current.
- `server/routes/sessions.ts:88` — "Add timestamp suffix to avoid collisions from concurrent deletes" — still valid.
- `server/routes/update.ts:366` — "Don't exit — old server stays alive" — correct re: graceful shutdown during updates.
- `components/prompts-panel.tsx:3` — "extracted from the now-deleted message-history.tsx" — informational, not stale.

---

## 6. Recommended Action Order

1. **Delete dead code** (§1.1-1.3). ~1,500 LOC removed. Low risk; nothing imports them.
2. **Extract `client/src/lib/format.ts`** with `formatUsd`, `formatTokens`, `formatCost`, `formatDate` (§2.1-2.4). Migrate the ~15 call sites to import. Big readability win, modest diff.
3. **Decide on `discover.ts` vs `discovery.ts`** (§3.1). At minimum, rename for clarity; ideally merge.
4. **Move `MODEL_PRICING` to `shared/`** (§2.5) so the client stops drifting when prices change.
5. **Fix stale JSDoc** in `session-tree-builder.ts:6` (§3.2). One-line edit.
6. **Decide onboarding wizard** (§1.4): either schedule the rewrite or delete the file.
7. **Drop `export` from `DiscoverResult`** (§1.6). One-line edit.
8. **Optional**: tighten layout by moving `server/cli/` and `server/services/` if you care (§3.3).

**Nothing in this report is urgent.** The codebase is structurally sound. Items 1-2 would give the biggest readability/LOC wins for the smallest risk.
