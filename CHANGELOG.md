# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
