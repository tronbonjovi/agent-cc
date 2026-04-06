# Visual Cleanup & Sessions Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace decorative green accents (borders, glows, active indicators) with theme-aware primary colors, fix dashboard column heights, and clean up the sessions page top bar and stat cards. Semantic green/yellow/red health traffic-light colors stay untouched.

**Architecture:** All changes are UI-layer. Decorative green Tailwind classes on borders, glows, active indicators, and highlights get replaced with `primary` CSS variable classes. Health-related greens (thresholdColor, session-health-panel, health-indicator, success checkmarks, diff additions) are NOT touched — the green/yellow/red semantic pattern persists. Dashboard columns get matched `max-h-[264px]` for 3-card scroll. Sessions page loses stat cards and gets a tighter header.

**Tech Stack:** React, TypeScript, Tailwind CSS

**What stays green (DO NOT CHANGE):**
- `thresholdColor()` returning `text-emerald-400/80` for healthy state
- `session-health-panel.tsx` level/dot/bar/badge color maps (green = healthy)
- `health-indicator.tsx` ok state (`bg-green-500`)
- Success checkmarks (`text-green-400` on Check icons after copy)
- Diff additions (`bg-green-500/10`)
- Context bar gradient (green → yellow → red is semantic)

---

### Task 1: CSS — add primary-aware live-border and glow classes

**Files:**
- Modify: `client/src/index.css:304-311` (live-border keyframes)
- Modify: `client/src/index.css:402-406` (neon glow classes)

- [ ] **Step 1: Update live-border animation to use primary instead of green HSL**

In `client/src/index.css`, replace the `live-border` keyframes:

```css
/* Old */
@keyframes live-border {
  0%, 100% { border-color: hsl(var(--border)); }
  50% { border-color: hsl(142 76% 36% / 0.3); }
}

/* New — uses theme primary */
@keyframes live-border {
  0%, 100% { border-color: hsl(var(--border)); }
  50% { border-color: hsl(var(--primary) / 0.3); }
}
```

- [ ] **Step 2: Add a `neon-glow-primary` utility class**

After the existing neon glow classes (~line 406), add:

```css
.neon-glow-primary { box-shadow: 0 0 calc(12px * var(--glow-intensity, 1)) hsl(var(--primary) / 0.4); }
```

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add theme-aware live-border and primary glow CSS classes"
```

---

### Task 2: Dashboard — replace decorative green accents with primary

**Files:**
- Modify: `client/src/pages/dashboard.tsx`

**IMPORTANT: Do NOT touch any of these (they are semantic health colors):**
- `thresholdColor()` function (line 48-56) — keeps `text-emerald-400/80`
- `text-green-400` on Check icons (line 467) — success feedback
- Context bar gradient `#22c55e` (line 554) — semantic green-to-red bar

- [ ] **Step 1: Update STATUS_CONFIG thinking dot**

Replace line 76-77:

```typescript
// Old
dotClass: "bg-green-500 animate-pulse drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]",
borderClass: "border-green-500/20",

// New
dotClass: "bg-primary animate-pulse drop-shadow-[0_0_4px_hsl(var(--primary)/0.5)]",
borderClass: "border-primary/20",
```

- [ ] **Step 2: Update status bar — live border class and status indicator dots**

Replace line 178 (the status bar container's active class):

```typescript
// Old
hasActive ? "live-border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.08)]" : ""

// New
hasActive ? "live-border border-primary/20 shadow-[0_0_20px_hsl(var(--primary)/0.08)]" : ""
```

Replace lines 182, 189, 194 (Server/Scanner/Watcher dots):

```typescript
// Old (each of three occurrences)
<span className="w-2 h-2 rounded-full bg-green-500 animate-glow-pulse shadow-glow-green" />

// New
<span className="w-2 h-2 rounded-full bg-primary animate-glow-pulse neon-glow-primary" />
```

Replace line 209 (active session pulse dot):

```typescript
// Old
{hasActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}

// New
{hasActive && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
```

- [ ] **Step 3: Update agent dropdown — running agent borders and dots**

Replace line 233 (running agent card):

```typescript
// Old
agent.status === "running" ? "border-green-500/20 bg-green-500/5" : "border-border/30 bg-muted/20"

// New
agent.status === "running" ? "border-primary/20 bg-primary/5" : "border-border/30 bg-muted/20"
```

Replace line 236 (running agent dot):

```typescript
// Old
<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />

// New
<span className="w-2 h-2 rounded-full bg-primary animate-pulse drop-shadow-[0_0_4px_hsl(var(--primary)/0.5)]" />
```

- [ ] **Step 4: Update live cost display**

Replace line 281:

```typescript
// Old
<span className="text-xs font-mono text-green-400">

// New
<span className="text-xs font-mono text-primary">
```

- [ ] **Step 5: Update ActiveSessionCard — new session ring**

Replace the `isNew` ring class in `ActiveSessionCard` (line 415):

```typescript
// Old
isNew ? "ring-2 ring-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.2)]" : ""

// New
isNew ? "ring-2 ring-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.2)]" : ""
```

- [ ] **Step 6: Update ActiveSessionCard — running agent sub-cards**

Replace line 575 (agent card border in session):

```typescript
// Old
agent.status === "running" ? "border-green-500/20 bg-green-500/5" : "border-border/30 bg-muted/20"

// New
agent.status === "running" ? "border-primary/20 bg-primary/5" : "border-border/30 bg-muted/20"
```

Replace line 578 (agent running dot in session):

```typescript
// Old
<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0 drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />

// New
<span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0 drop-shadow-[0_0_4px_hsl(var(--primary)/0.5)]" />
```

- [ ] **Step 7: Run type-check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: dashboard — replace decorative green accents with theme-aware primary"
```

---

### Task 3: Dashboard — match column heights to 3 recent activity cards

**Files:**
- Modify: `client/src/pages/dashboard.tsx:294-336`

- [ ] **Step 1: Update both containers to matched height**

Replace the Active Sessions scrollable container (line 303):

```typescript
// Old
<div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">

// New
<div className="space-y-3 max-h-[264px] overflow-y-auto pr-1">
```

Replace the Recent Activity scrollable container (line 330):

```typescript
// Old
<div className="space-y-2 max-h-[600px] overflow-auto">

// New
<div className="space-y-2 max-h-[264px] overflow-y-auto pr-1">
```

264px = ~3 activity cards (72px each) + 2 gaps (8px each) + 8px breathing room.

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: dashboard — limit both columns to 3-card height with scroll"
```

---

### Task 4: Sessions page — remove stat cards

**Files:**
- Modify: `client/src/pages/sessions.tsx:143-252`

- [ ] **Step 1: Delete the statCards array and the stat cards grid**

Remove the `statCards` array (lines 143-148):

```typescript
  const statCards = [
    { label: "Total", value: stats?.totalCount ?? 0, icon: MessageSquare, color: "text-blue-400" },
    { label: "Storage", value: formatBytes(stats?.totalSize ?? 0), icon: HardDrive, color: "text-purple-400" },
    { label: "Active", value: stats?.activeCount ?? 0, icon: Clock, color: "text-green-400" },
    { label: "Empty", value: stats?.emptyCount ?? 0, icon: Hash, color: "text-amber-400" },
  ];
```

Remove the stat cards grid JSX (lines 237-252):

```typescript
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((s, i) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 animate-fade-in-up gradient-border" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">{s.label}</p>
                <p className="text-2xl font-bold font-mono mt-1">{s.value}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-2.5">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
```

- [ ] **Step 2: Remove unused imports that were only used by stat cards**

Check if `Hash` and `HardDrive` are used elsewhere in the file. If not, remove them from the lucide import.

Keep `Clock` (used in session list), `MessageSquare` (used in tab bar and empty state).

- [ ] **Step 3: Run type-check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: sessions — remove stat cards section"
```

---

### Task 5: Sessions page — clean up top bar

**Files:**
- Modify: `client/src/pages/sessions.tsx:150-235`

The current header crams everything in one line: title, Delete All, Hide Empty, Active Only, sort dropdown, Summarize All, search bar with mode toggle. Goal: tighten it into two rows — title+search on top, filters+actions below.

- [ ] **Step 1: Replace the header section**

Replace the entire `{/* Header */}` div (lines 152-235) with this cleaner layout:

```typescript
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sessions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}{stats ? `, ${formatBytes(stats.totalSize)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-0">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={searchMode === "deep" ? "Deep search content..." : "Search sessions..."} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-r-none" />
            </div>
            <div className="flex border border-l-0 border-border rounded-r-md overflow-hidden">
              <button
                onClick={() => setSearchMode("titles")}
                className={`text-[11px] px-2.5 py-[7px] transition-colors ${
                  searchMode === "titles" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Titles
              </button>
              <button
                onClick={() => setSearchMode("deep")}
                className={`text-[11px] px-2.5 py-[7px] transition-colors ${
                  searchMode === "deep" ? "bg-purple-500/10 text-purple-400 font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Zap className="h-3 w-3 inline mr-0.5" />Deep
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              hideEmpty ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Hide Empty
          </button>
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              activeOnly ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Only
          </button>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground"
          >
            <option value="lastTs:desc">Newest First</option>
            <option value="lastTs:asc">Oldest First</option>
            <option value="slug:asc">Name A-Z</option>
            <option value="slug:desc">Name Z-A</option>
            <option value="sizeBytes:desc">Largest First</option>
            <option value="sizeBytes:asc">Smallest First</option>
            <option value="messageCount:desc">Most Messages</option>
            <option value="messageCount:asc">Fewest Messages</option>
          </select>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => summarizeBatch.mutate()}
            disabled={summarizeBatch.isPending}
            className="gap-1.5"
          >
            {summarizeBatch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summarizeBatch.isPending ? "Summarizing..." : "Summarize All"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteConfirm({ type: "all" })}
            disabled={sessions.length === 0}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete All
          </Button>
        </div>
      </div>
```

Key changes:
- Removed "— Browse and manage Claude sessions" from subtitle (obvious)
- Search bar moved to top row next to title
- Filters (Hide Empty, Active Only, sort) on second row left-aligned
- Actions (Summarize All, Delete All) on second row right-aligned
- `Active Only` and `Hide Empty` active states use `primary` instead of green/blue
- `Titles` search mode active state uses `primary` instead of blue

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: sessions — clean up top bar, two-row layout, primary accents"
```

---

### Task 6: Final verification and deploy

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass including `new-user-safety.test.ts`

- [ ] **Step 2: Run type-check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Build and deploy**

Run: `scripts/deploy.sh`
Expected: Build succeeds, service restarts, health check passes

- [ ] **Step 4: Manual verification**

Open the app and verify:
1. Dashboard status dots are primary-colored (orange in Anthropic theme, blue in default dark)
2. Live border pulses with primary color, not green
3. Running agent cards use primary border/bg, not green
4. New session ring glows primary, not green
5. Cost display uses primary color
6. Health colors STILL green/yellow/red (thresholdColor, health panel, health indicator)
7. Success check icons STILL green
8. Context bar gradient STILL green → yellow → red
9. Active Sessions and Recent Activity columns are same height (~3 cards)
10. Both columns scroll independently
11. Sessions page has no stat cards
12. Sessions top bar is two rows: title+search, filters+actions
13. Filter buttons (Hide Empty, Active Only) use primary when active
