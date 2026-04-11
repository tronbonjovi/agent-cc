# Analytics Overview Design

Replaces the Nerve Center tab with a dashboard-style overview that summarizes highlights from all analytics tabs with links to drill deeper.

## Layout

### Top Metrics Bar

Horizontal row of 4–5 key numbers, always visible:

| Metric | Source | Display |
|--------|--------|---------|
| Total spend (7d) | `useAnalyticsCosts()` | Dollar amount + trend arrow (up/down vs prior 7d) |
| Active sessions (today) | `useNerveCenter()` | Count |
| Health score | `useSessionHealth()` | % good sessions |
| Cache hit rate | `useAnalyticsCosts()` | Percentage |
| Avg cost/session | Computed (total spend / session count) | Dollar amount |

### Card Grid

Responsive grid: 2 columns on desktop, 1 on mobile. Each card has:
- Header: tab name + icon + "View →" link to that tab
- 1–2 headline stats
- One mini visualization (sparkline, mini bar, or mini donut)
- Collapsible body (expanded by default, remembers state)

#### Card 1: Costs
- Headline: weekly spend number
- Visual: sparkline of daily spend trend (7d)
- Source: `useAnalyticsCosts()` — `weeklyComparison`, daily breakdown
- Links to: Costs tab

#### Card 2: Sessions
- Headline: session count
- Visual: tiny stacked bar showing health distribution (green/yellow/red for good/fair/poor)
- Source: `useSessionHealth()` — good/fair/poor counts
- Links to: Sessions tab

#### Card 3: Models
- Headline: dominant model name + its % of total cost
- Visual: mini donut chart showing opus/sonnet/haiku proportions
- Source: `useModelIntelligence()` — per-model breakdown
- Links to: Costs tab (Model Intelligence section)

#### Card 4: Files
- Headline: number of hot files
- Visual: top 3 hot files listed with heat indicator (cool/warm/hot)
- Source: `useFileAnalytics()` — hot files with touch counts
- Links to: Sessions tab (File Impact section)

#### Card 5: Efficiency (cross-tab)
- Combines data from Costs + Sessions tabs into a composite view
- Shows: daily spend rate, model cost mix, cache hit rate, session health percentage
- Tells the story: "You're spending $X/day, 60% on opus, with 45% cache hits. Sessions are 80% healthy."
- Source: computed client-side from `useAnalyticsCosts()` + `useSessionHealth()` + `useModelIntelligence()`
- No single tab link — this is unique to the overview

## Data Flow

No new API endpoints. All data comes from existing hooks:
- `useAnalyticsCosts()` — spend, cache rate, weekly comparison, top sessions
- `useSessionHealth()` — good/fair/poor distribution
- `useModelIntelligence()` — per-model token and cost breakdown
- `useFileAnalytics()` — hot files with touch counts
- `useNerveCenter()` — session count, service status

All hooks already have polling/refetch intervals configured.

## What Gets Removed

### Nerve Center components (entire directory)
- `TopologyLayout.tsx` — circuit-board layout with SVG traces
- `ScannerBrain.tsx` — central brain visualization
- `CostNerves.tsx` — cost organ module
- `SessionVitals.tsx` — session health organ
- `FileSensors.tsx` — file heatmap organ
- `ActivityReflexes.tsx` — filesystem change organ
- `ServiceSynapses.tsx` — service health organ
- All pathway state logic, organ state derivation, SVG circuit traces

### Service health data
Service Synapses checked port health for external services. This is more of an ops concern than analytics. Dropping it from the overview — the data is still available via the `/api/sessions/nerve-center` endpoint if needed later.

### Redundant tab subtitle
The line of text under "Analytics" that lists tab names gets removed.

## Tab Rename

The first tab changes from "Nerve Center" to "Overview" in the tab bar.

## Interactions

- **Card collapse/expand** — click header to toggle, state persisted in local state
- **"View →" links** — switch to the respective tab (same page, tab parameter change)
- **Sparklines/mini charts** — display only, non-interactive (Recharts `ResponsiveContainer` at small size)
- **Metrics bar** — static display, no interactions

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/components/analytics/overview/OverviewTab.tsx` | Main overview tab component |
| `client/src/components/analytics/overview/MetricsBar.tsx` | Top metrics row |
| `client/src/components/analytics/overview/SummaryCard.tsx` | Reusable card component |
| `client/src/components/analytics/overview/CostsCard.tsx` | Costs summary card |
| `client/src/components/analytics/overview/SessionsCard.tsx` | Sessions summary card |
| `client/src/components/analytics/overview/ModelsCard.tsx` | Model usage card |
| `client/src/components/analytics/overview/FilesCard.tsx` | Hot files card |
| `client/src/components/analytics/overview/EfficiencyCard.tsx` | Cross-tab efficiency card |

## Files to Delete

All files in `client/src/components/analytics/nerve-center/`.

## Files to Modify

| File | Change |
|------|--------|
| `client/src/pages/stats.tsx` | Replace NerveCenter tab with OverviewTab, rename tab label, remove subtitle text |
