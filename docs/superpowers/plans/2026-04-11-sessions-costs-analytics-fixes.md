# Sessions, Costs & Analytics Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bugs and UX issues across the Sessions page, Costs tab, and replace the Nerve Center with a functional Analytics Overview dashboard.

**Architecture:** Three independent work streams (Sessions, Costs, Analytics Overview) that can be parallelized. Sessions and Costs are bug/UX fixes to existing components. Analytics Overview replaces the nerve-center directory with a new card-grid dashboard that composes existing data hooks.

**Tech Stack:** React, TypeScript, Tailwind CSS, Recharts (sparklines), Radix Tabs, wouter (routing), @tanstack/react-query

---

## Session 1: Sessions Page Fixes

### Task 1: Resizable center divider

The sessions list-detail layout uses a hardcoded 35/65 split. The app already has a `useResizeHandle` hook used on the board page. Wire it into `ListDetailLayout`.

**Files:**
- Modify: `client/src/components/analytics/sessions/ListDetailLayout.tsx`
- Test: `tests/sessions-list-detail-layout.test.ts` (update existing)

- [ ] **Step 1: Write the failing test**

Add a test that the layout renders a resize handle element on desktop:

```typescript
it("renders a resize handle between panels on desktop", () => {
  render(<ListDetailLayout list={<div>list</div>} detail={<div>detail</div>} />);
  expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessions-list-detail-layout.test.ts -t "resize handle"`
Expected: FAIL — no element with testid "resize-handle"

- [ ] **Step 3: Implement resizable split**

In `ListDetailLayout.tsx`, import `useResizeHandle` from `@/hooks/use-resize-handle` and add a drag handle between panels. Replace the hardcoded `w-[35%]` with a dynamic width from the hook.

Desktop section becomes:

```tsx
import { useResizeHandle } from "@/hooks/use-resize-handle";

// Inside the component, before the mobile check:
const resize = useResizeHandle({ initialWidth: 350, minWidth: 280, maxWidth: 500, side: "right" });

// Desktop return:
return (
  <div className="flex h-full overflow-hidden">
    <div style={{ width: resize.width }} className="min-w-[280px] border-r border-border/40 overflow-y-auto shrink-0">
      {list}
    </div>
    <div
      data-testid="resize-handle"
      onMouseDown={resize.onMouseDown}
      className="w-1 cursor-col-resize hover:bg-accent/50 transition-colors shrink-0"
    />
    <div className="flex-1 overflow-y-auto">
      {detail !== null ? detail : (
        emptyDetail ?? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a session to view details
          </div>
        )
      )}
    </div>
  </div>
);
```

Note: Only call `useResizeHandle` unconditionally at the top of the component (hooks can't be conditional). The mobile path just doesn't use the returned values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessions-list-detail-layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/ListDetailLayout.tsx tests/sessions-list-detail-layout.test.ts
git commit -m "feat: add resizable center divider to sessions list-detail layout"
```

---

### Task 2: Fix pin session icon toggle

The pin button fires a toast but the icon doesn't visually change because `session.isPinned` from `useSessionDetail` isn't being updated after the mutation. The mutation invalidates queries, but the icon state depends on `session.isPinned` which may not be in the returned data.

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`
- Test: `tests/sessions-redesign.test.ts` (update existing)

- [ ] **Step 1: Write the failing test**

Test that after toggling pin, the pin button has the amber class:

```typescript
it("toggles pin icon appearance after mutation", async () => {
  // Mock useTogglePin to immediately call onSuccess
  const { container } = render(<SessionDetail sessionId="test-id" />);
  const pinBtn = container.querySelector("button"); // first button
  // Initially not amber
  expect(pinBtn?.className).not.toContain("text-amber-500");
  // After click and mutation success, should be amber
  await userEvent.click(pinBtn!);
  // Verify the mutation was called
  expect(togglePinMock).toHaveBeenCalledWith("test-id");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "pin icon"`
Expected: FAIL

- [ ] **Step 3: Implement local optimistic pin state**

In `SessionDetail.tsx`, add local state to track pin optimistically:

```tsx
const [localPinned, setLocalPinned] = useState<boolean | null>(null);
const isPinned = localPinned ?? session.isPinned ?? false;

// Update the togglePin call:
<Button
  variant="ghost" size="sm"
  onClick={() => {
    setLocalPinned(prev => !(prev ?? session.isPinned ?? false));
    togglePin.mutate(session.id);
  }}
  className={isPinned ? "text-amber-500" : ""}
>
  <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
</Button>
```

Also add `fill-current` when pinned so the pin icon appears filled (not just colored outline).

Reset `localPinned` when sessionId changes:

```tsx
useEffect(() => { setLocalPinned(null); }, [sessionId]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "pin icon"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionDetail.tsx tests/sessions-redesign.test.ts
git commit -m "fix: pin session icon now toggles visually with optimistic state"
```

---

### Task 3: Wire overview panel data (duration, cost, cache hit, sidechains)

The `SessionsTab` creates `SessionDetail` without passing enrichment props (lines 80-84). The `SessionDetail` component accepts `costUsd`, `durationMinutes`, `cacheReadTokens`, etc. as props but `SessionsTab` doesn't pass them. The enriched data exists in the `enriched` array but isn't forwarded.

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionsTab.tsx`
- Test: `tests/sessions-redesign.test.ts` (update existing)

- [ ] **Step 1: Write the failing test**

```typescript
it("passes enrichment props from session list to SessionDetail", () => {
  // Render SessionsTab with mock sessions that have enrichment data
  // Select a session
  // Assert SessionDetail receives costUsd, durationMinutes, etc.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "enrichment props"`
Expected: FAIL

- [ ] **Step 3: Forward enrichment data to SessionDetail**

In `SessionsTab.tsx`, find the selected session from the enriched array and pass its data:

```tsx
const selectedSession = enriched.find(s => s.id === selectedId);

// In the detail prop of ListDetailLayout:
detail={selectedId ? (
  <SessionDetail
    sessionId={selectedId}
    parsed={selectedSession?.parsed ?? null}
    costUsd={selectedSession?.costUsd}
    durationMinutes={selectedSession?.durationMinutes}
    healthScore={selectedSession?.healthScore}
    healthReasons={selectedSession?.healthReasons}
    inputTokens={selectedSession?.inputTokens}
    outputTokens={selectedSession?.outputTokens}
    cacheReadTokens={selectedSession?.cacheReadTokens}
    cacheCreationTokens={selectedSession?.cacheCreationTokens}
    onDelete={handleBack}
  />
) : null}
```

The `EnrichedSession` type (from `SessionList.tsx`) already has `healthScore`, `costUsd`, `durationMinutes`. We need to also populate `costUsd` in the enrichment mapping. Currently it's hardcoded to `0` (line 45). The session list API response includes `totalCostUsd` — wire it:

```tsx
costUsd: s.totalCostUsd ?? 0,
```

For cache tokens, the list endpoint may not include them. If not available from the list, `SessionDetail` already fetches its own detail via `useSessionDetail(sessionId)` — the overview component can fall back to those. But for `durationMinutes` and `costUsd`, the list data is sufficient.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "enrichment props"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionsTab.tsx tests/sessions-redesign.test.ts
git commit -m "fix: wire enrichment data (cost, duration) to session detail overview"
```

---

### Task 4: Clarify or remove Linked Task section

The Linked Task section references workflow-framework board tasks via auto-linking signals (branch name, file overlap, timing). However, `SessionsTab` doesn't pass any `linkedTaskId`/`linkedTaskTitle` props to `SessionDetail` (lines 80-84), so it always shows empty. The auto-linking logic exists in `session-enricher.ts` but isn't called from the sessions endpoint.

For now, hide the section when no linked task data exists rather than showing an empty section that confuses users.

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`
- Test: `tests/sessions-redesign.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("hides Linked Task section when no task data is provided", () => {
  render(<SessionDetail sessionId="test-id" />);
  expect(screen.queryByText("Linked Task")).not.toBeInTheDocument();
});

it("shows Linked Task section when task data is provided", () => {
  render(<SessionDetail sessionId="test-id" linkedTaskId="TASK-001" linkedTaskTitle="Fix bug" />);
  expect(screen.getByText("Linked Task")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "Linked Task section"`
Expected: FAIL — "Linked Task" header renders even without data

- [ ] **Step 3: Conditionally render Linked Task section**

In `SessionDetail.tsx`, wrap the Linked Task section header and content in a conditional:

```tsx
{linkedTaskId && (
  <>
    <SectionHeader
      title="Linked Task"
      isOpen={openSections.has("linked-task")}
      onToggle={() => toggleSection("linked-task")}
    />
    {openSections.has("linked-task") && (
      <LinkedTask
        taskId={linkedTaskId}
        taskTitle={linkedTaskTitle}
        milestone={linkedMilestone}
        isManualLink={isManualLink}
        linkScore={linkScore}
        linkSignals={linkSignals}
      />
    )}
  </>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "Linked Task section"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/SessionDetail.tsx tests/sessions-redesign.test.ts
git commit -m "fix: hide Linked Task section when no task data available"
```

---

### Task 5: Fix expand/collapse UX — remove bounce, make icon clickable

The user reports categories "bounce" when clicked and the chevron icon doesn't toggle the section — only clicking the title works. Looking at the code, `SectionHeader` is a single `<button>` wrapping both the icon and title, so both should work. The "bounce" is likely a CSS `active:` or `transition` artifact. Need to verify and fix.

**Files:**
- Modify: `client/src/components/analytics/sessions/SessionDetail.tsx`
- Test: `tests/sessions-redesign.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("expand/collapse section header has no bounce animation classes", () => {
  render(<SessionDetail sessionId="test-id" />);
  const overviewHeader = screen.getByText("Overview").closest("button");
  expect(overviewHeader?.className).not.toContain("bounce");
  expect(overviewHeader?.className).not.toContain("scale");
  // Should have smooth transition only
  expect(overviewHeader?.className).toContain("transition");
});
```

- [ ] **Step 2: Run test to verify it fails (or passes — this might already be correct)**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "bounce animation"`

If it passes, the bounce might come from Radix or a parent component. Check in the browser. If the button has `active:scale-95` or similar from a global style or the Button component, remove it.

- [ ] **Step 3: Clean up SectionHeader styling**

Replace the `SectionHeader` component with explicit, clean styling that prevents any inherited bounce/scale:

```tsx
function SectionHeader({ title, isOpen, onToggle }: { title: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium border-b border-border/20 hover:bg-muted/30 transition-colors active:bg-muted/40"
    >
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
      <span>{title}</span>
    </button>
  );
}
```

Key changes:
- Use `ChevronRight` with `rotate-90` transition (matching the Costs tab pattern) instead of swapping between `ChevronDown`/`ChevronRight` icons
- Add `shrink-0` to the icon so it doesn't compress
- Add `active:bg-muted/40` for subtle press feedback instead of any scale/bounce
- Add `transition-transform duration-150` on the icon for smooth rotation

- [ ] **Step 4: Remove ChevronDown import if no longer used**

Check if `ChevronDown` is used elsewhere in `SessionDetail.tsx`. If not, remove it from the import line.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/sessions-redesign.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analytics/sessions/SessionDetail.tsx tests/sessions-redesign.test.ts
git commit -m "fix: clean up expand/collapse UX — smooth chevron rotation, no bounce"
```

---

### Task 6: Improve lifecycle events readability

The lifecycle events display raw type strings like `permission-change`, `queue-enqueue`, `tools-changed` as badges. Replace with human-friendly labels and add brief explanations.

**Files:**
- Modify: `client/src/components/analytics/sessions/LifecycleEvents.tsx`
- Test: `tests/sessions-redesign.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("renders human-readable labels for lifecycle events", () => {
  const events: LifecycleEvent[] = [
    { timestamp: "2026-04-11T10:00:05Z", type: "permission-change", detail: "allow-all" },
    { timestamp: "2026-04-11T10:00:10Z", type: "tools-changed", detail: "added: Read, Write" },
    { timestamp: "2026-04-11T10:00:15Z", type: "queue-enqueue", detail: "waiting for response" },
  ];
  render(<LifecycleEvents events={events} sessionStartTs="2026-04-11T10:00:00Z" />);
  expect(screen.getByText("Permission Changed")).toBeInTheDocument();
  expect(screen.getByText("Tools Updated")).toBeInTheDocument();
  expect(screen.getByText("Queued")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "human-readable labels"`
Expected: FAIL — renders raw type strings

- [ ] **Step 3: Add human-friendly label map**

In `LifecycleEvents.tsx`, add a label map and use it in the render:

```tsx
const EVENT_LABELS: Record<string, string> = {
  "permission-change": "Permission Changed",
  "queue-enqueue": "Queued",
  "queue-dequeue": "Processing",
  "queue-remove": "Removed from Queue",
  "tools-changed": "Tools Updated",
  "last-prompt": "Last Prompt",
};

// In the render, replace the badge text:
<Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass}`}>
  {EVENT_LABELS[event.type] ?? event.type}
</Badge>
```

Also format the relative time more readably — replace `+5s` with `+5s`, `+65s` with `+1m 5s`, `+3700s` with `+1h 1m`:

```tsx
function formatRelativeTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `+${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `+${min}m ${sec}s` : `+${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `+${hr}h ${remMin}m` : `+${hr}h`;
}
```

Use it in the render:

```tsx
const relativeStr = relativeMs != null ? formatRelativeTime(relativeMs) : "";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sessions-redesign.test.ts -t "human-readable labels"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/sessions/LifecycleEvents.tsx tests/sessions-redesign.test.ts
git commit -m "fix: lifecycle events use human-readable labels and formatted timestamps"
```

---

## Session 2: Costs Tab Fixes

### Task 7: Make all costs panels collapsible

Currently only `HistoricalLookup` is collapsible. Apply the same pattern to all 5 sections: TokenAnatomy, ModelIntelligence, CacheEfficiency, SystemPromptOverhead, SessionProjectValue.

**Files:**
- Modify: `client/src/components/analytics/costs/CostsTab.tsx`
- Modify: `client/src/components/analytics/costs/TokenAnatomy.tsx`
- Modify: `client/src/components/analytics/costs/ModelIntelligence.tsx`
- Modify: `client/src/components/analytics/costs/CacheEfficiency.tsx`
- Modify: `client/src/components/analytics/costs/SystemPromptOverhead.tsx`
- Modify: `client/src/components/analytics/costs/SessionProjectValue.tsx`
- Test: `tests/costs-deepening.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("all costs sections are collapsible", () => {
  render(<CostsTab />);
  const sections = ["Token Anatomy", "Model Intelligence", "Cache Efficiency", "System Prompt Overhead", "Session & Project Value"];
  for (const name of sections) {
    const header = screen.getByText(name).closest("button");
    expect(header).toBeInTheDocument();
    // Should have a chevron indicator
    expect(header?.querySelector("svg")).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/costs-deepening.test.ts -t "collapsible"`
Expected: FAIL — section titles aren't in buttons

- [ ] **Step 3: Create a shared CollapsibleSection wrapper**

Rather than modifying each component's internals, create a wrapper in `CostsTab.tsx` and use it:

```tsx
import { useState } from "react";
import { ChevronRight } from "lucide-react";

function CollapsibleSection({ title, icon, defaultOpen = true, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-accent/30 transition-colors rounded-xl"
      >
        {icon}
        <span className="text-sm font-medium flex-1">{title}</span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
```

Then wrap each section in `CostsTab`:

```tsx
export default function CostsTab() {
  return (
    <div className="space-y-6">
      <CollapsibleSection title="Token Anatomy" icon={<PieChart className="h-4 w-4 text-muted-foreground" />}>
        <TokenAnatomy />
      </CollapsibleSection>
      <CollapsibleSection title="Model Intelligence" icon={<Bot className="h-4 w-4 text-muted-foreground" />}>
        <ModelIntelligence />
      </CollapsibleSection>
      <CollapsibleSection title="Cache Efficiency" icon={<Zap className="h-4 w-4 text-muted-foreground" />}>
        <CacheEfficiency />
      </CollapsibleSection>
      <CollapsibleSection title="System Prompt Overhead" icon={<FileText className="h-4 w-4 text-muted-foreground" />}>
        <SystemPromptOverhead />
      </CollapsibleSection>
      <CollapsibleSection title="Session & Project Value" icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}>
        <SessionProjectValue />
      </CollapsibleSection>
      <HistoricalLookup />
    </div>
  );
}
```

Each child component will need its outer `<div className="rounded-xl border bg-card">` wrapper and its own title header removed (since `CollapsibleSection` now provides those). Adjust each component to remove its own card wrapper and title, rendering only the content.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/costs-deepening.test.ts -t "collapsible"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/costs/CostsTab.tsx client/src/components/analytics/costs/TokenAnatomy.tsx client/src/components/analytics/costs/ModelIntelligence.tsx client/src/components/analytics/costs/CacheEfficiency.tsx client/src/components/analytics/costs/SystemPromptOverhead.tsx client/src/components/analytics/costs/SessionProjectValue.tsx tests/costs-deepening.test.ts
git commit -m "feat: make all costs tab panels collapsible"
```

---

### Task 8: Fix Model Intelligence granularity

The Model Intelligence table shows model names from `msg.model` in parsed sessions. Subagent sessions using haiku/sonnet should show up if the JSONL records include those model names. The `<synthetic>` entry likely comes from messages where `msg.model` is missing or set to a placeholder. Make the display more useful.

**Files:**
- Modify: `server/scanner/model-intelligence.ts`
- Modify: `client/src/components/analytics/costs/ModelIntelligence.tsx`
- Test: `tests/costs-deepening.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("groups messages with missing model as 'unknown' not '<synthetic>'", () => {
  const sessions = [mockParsedSession({
    assistantMessages: [
      { model: undefined, usage: { inputTokens: 100, outputTokens: 50 } },
      { model: "claude-sonnet-4-6-20250514", usage: { inputTokens: 200, outputTokens: 100 } },
    ],
  })];
  const result = computeModelIntelligence(sessions);
  const modelNames = result.map(r => r.model);
  expect(modelNames).not.toContain("<synthetic>");
  expect(modelNames).toContain("unknown");
});

it("shortens model display names in the table", () => {
  render(<ModelIntelligence />);
  // After data loads, model names should be shortened
  // e.g., "claude-sonnet-4-6-20250514" → "sonnet-4-6"
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/costs-deepening.test.ts -t "model"`
Expected: FAIL

- [ ] **Step 3: Fix model name handling**

In `server/scanner/model-intelligence.ts`, verify that missing model falls through to `"unknown"` (line 37: `msg.model || "unknown"`). If `<synthetic>` appears, it's because that literal string is in the JSONL data. Add a normalization step:

```typescript
const modelName = msg.model || "unknown";
const normalized = modelName === "<synthetic>" ? "unknown" : modelName;
```

In `ModelIntelligence.tsx`, use the existing `shortModel` utility from `@/lib/utils` to shorten display names in the table cells:

```tsx
import { shortModel } from "@/lib/utils";

// In the model column render:
<td>{shortModel(row.model)}</td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/costs-deepening.test.ts -t "model"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/scanner/model-intelligence.ts client/src/components/analytics/costs/ModelIntelligence.tsx tests/costs-deepening.test.ts
git commit -m "fix: normalize model names in Model Intelligence — no <synthetic>, shortened display"
```

---

### Task 9: Reframe System Prompt Overhead

The current calculation estimates system prompt tokens as the "spike" in the first message's input tokens vs. the average of subsequent messages. The framing should be broadened to "Context Overhead" — all the recurring stuff sent every turn (system prompt, plugins, skills, agents, memory, project instructions).

**Files:**
- Modify: `client/src/components/analytics/costs/SystemPromptOverhead.tsx`
- Test: `tests/costs-deepening.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("displays 'Context Overhead' as the section title, not 'System Prompt Overhead'", () => {
  render(<SystemPromptOverhead />);
  expect(screen.getByText(/Context Overhead/i)).toBeInTheDocument();
  expect(screen.queryByText(/System Prompt Overhead/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/costs-deepening.test.ts -t "Context Overhead"`
Expected: FAIL

- [ ] **Step 3: Rename and add explanatory text**

In `SystemPromptOverhead.tsx`:

1. Change the title from "System Prompt Overhead" to "Context Overhead"
2. Update the explanatory text to describe what's included:

```tsx
<p className="text-xs text-muted-foreground">
  Estimated tokens consumed by recurring context each turn — system prompt, CLAUDE.md instructions,
  plugin/skill definitions, memory files, and project configuration. Calculated from the input token
  spike on the first message of each session compared to subsequent messages.
</p>
```

3. Keep all the calculation logic unchanged — it's a reasonable estimate regardless of what we call it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/costs-deepening.test.ts -t "Context Overhead"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/costs/SystemPromptOverhead.tsx tests/costs-deepening.test.ts
git commit -m "fix: reframe System Prompt Overhead as Context Overhead with clearer description"
```

---

### Task 10: Fix most expensive sessions navigation

`SessionProjectValue.tsx` line 102 navigates to `/?tab=sessions&id=${sessionId}` — the `/` route is the dashboard, not analytics. Should navigate to `/analytics?tab=sessions&id=${sessionId}`.

**Files:**
- Modify: `client/src/components/analytics/costs/SessionProjectValue.tsx`
- Test: `tests/costs-deepening.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("navigates to /analytics?tab=sessions when clicking an expensive session", async () => {
  const mockSetLocation = vi.fn();
  // Mock useLocation to capture navigation
  render(<SessionProjectValue />);
  // Wait for data to load, click first session row
  const row = await screen.findByText("#1");
  await userEvent.click(row.closest("[role='button']") || row.parentElement!);
  expect(mockSetLocation).toHaveBeenCalledWith(expect.stringContaining("/analytics?tab=sessions&id="));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/costs-deepening.test.ts -t "navigates to /analytics"`
Expected: FAIL — navigates to `/?tab=sessions`

- [ ] **Step 3: Fix the navigation path**

In `SessionProjectValue.tsx` line 102, change:

```tsx
// Before:
function navigateToSession(sessionId: string) {
  setLocation(`/?tab=sessions&id=${sessionId}`);
}

// After:
function navigateToSession(sessionId: string) {
  setLocation(`/analytics?tab=sessions&id=${sessionId}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/costs-deepening.test.ts -t "navigates to /analytics"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/analytics/costs/SessionProjectValue.tsx tests/costs-deepening.test.ts
git commit -m "fix: most expensive sessions link to analytics sessions tab, not dashboard"
```

---

## Session 3: Analytics Overview (replaces Nerve Center)

### Task 11: Create OverviewTab with MetricsBar

Build the new overview tab component with the top metrics bar. This is the skeleton that cards plug into.

**Files:**
- Create: `client/src/components/analytics/overview/OverviewTab.tsx`
- Create: `client/src/components/analytics/overview/MetricsBar.tsx`
- Test: `tests/analytics-overview.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

describe("OverviewTab", () => {
  it("renders the metrics bar with key metrics", async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <OverviewTab />
      </QueryClientProvider>
    );
    expect(screen.getByText("7d Spend")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("Cache Hit")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics-overview.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create MetricsBar component**

```tsx
// client/src/components/analytics/overview/MetricsBar.tsx
import { DollarSign, Activity, Heart, Zap } from "lucide-react";
import { useAnalyticsCosts, useHealthAnalytics, useNerveCenter } from "@/hooks/use-sessions";

interface MetricProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "flat";
}

function Metric({ label, value, icon, trend }: MetricProps) {
  const trendColor = trend === "up" ? "text-red-400" : trend === "down" ? "text-green-400" : "text-muted-foreground";
  const trendArrow = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "";
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono">
          {value}
          {trendArrow && <span className={`text-xs ml-1 ${trendColor}`}>{trendArrow}</span>}
        </p>
      </div>
    </div>
  );
}

export function MetricsBar() {
  const { data: costs } = useAnalyticsCosts();
  const { data: health } = useHealthAnalytics();
  const { data: nerve } = useNerveCenter();

  const totalSpend = costs?.totalCost ?? 0;
  const sessionCount = nerve?.services?.length ?? 0; // Or derive from sessions
  const goodPct = health ? Math.round((health.good / (health.good + health.fair + health.poor || 1)) * 100) : 0;
  const cacheHitRate = costs?.cacheHitRate ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Metric label="7d Spend" value={`$${totalSpend.toFixed(2)}`} icon={<DollarSign className="h-4 w-4" />} />
      <Metric label="Sessions" value={String(sessionCount)} icon={<Activity className="h-4 w-4" />} />
      <Metric label="Health" value={`${goodPct}%`} icon={<Heart className="h-4 w-4" />} />
      <Metric label="Cache Hit" value={`${Math.round(cacheHitRate * 100)}%`} icon={<Zap className="h-4 w-4" />} />
    </div>
  );
}
```

Note: The exact hook return shapes may need adjustment based on what `useAnalyticsCosts` and `useHealthAnalytics` actually return. Read the hook implementations to get the right field names. The above is a starting structure — the implementer should verify the data shapes match.

- [ ] **Step 4: Create OverviewTab skeleton**

```tsx
// client/src/components/analytics/overview/OverviewTab.tsx
import { MetricsBar } from "./MetricsBar";

export function OverviewTab() {
  return (
    <div className="space-y-6">
      <MetricsBar />
      {/* Cards will be added in subsequent tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Placeholder for cards */}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/analytics-overview.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/components/analytics/overview/OverviewTab.tsx client/src/components/analytics/overview/MetricsBar.tsx tests/analytics-overview.test.ts
git commit -m "feat: add OverviewTab skeleton with MetricsBar"
```

---

### Task 12: Create SummaryCard component and all 5 cards

Build the reusable `SummaryCard` wrapper and the 5 content cards (Costs, Sessions, Models, Files, Efficiency).

**Files:**
- Create: `client/src/components/analytics/overview/SummaryCard.tsx`
- Create: `client/src/components/analytics/overview/CostsCard.tsx`
- Create: `client/src/components/analytics/overview/SessionsCard.tsx`
- Create: `client/src/components/analytics/overview/ModelsCard.tsx`
- Create: `client/src/components/analytics/overview/FilesCard.tsx`
- Create: `client/src/components/analytics/overview/EfficiencyCard.tsx`
- Modify: `client/src/components/analytics/overview/OverviewTab.tsx`
- Test: `tests/analytics-overview.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("renders all 5 summary cards", async () => {
  render(<OverviewTab />);
  expect(await screen.findByText("Costs")).toBeInTheDocument();
  expect(screen.getByText("Sessions")).toBeInTheDocument();
  expect(screen.getByText("Models")).toBeInTheDocument();
  expect(screen.getByText("Files")).toBeInTheDocument();
  expect(screen.getByText("Efficiency")).toBeInTheDocument();
});

it("summary cards have View links", async () => {
  render(<OverviewTab />);
  const links = await screen.findAllByText(/View/);
  expect(links.length).toBeGreaterThanOrEqual(4); // 4 cards link to tabs, Efficiency doesn't
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics-overview.test.ts -t "summary cards"`
Expected: FAIL

- [ ] **Step 3: Create SummaryCard wrapper**

```tsx
// client/src/components/analytics/overview/SummaryCard.tsx
import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface SummaryCardProps {
  title: string;
  icon: React.ReactNode;
  linkLabel?: string;
  onLink?: () => void;
  children: React.ReactNode;
}

export function SummaryCard({ title, icon, linkLabel, onLink, children }: SummaryCardProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-accent/30 transition-colors rounded-t-xl"
      >
        {icon}
        <span className="text-sm font-medium flex-1">{title}</span>
        {linkLabel && onLink && (
          <span
            onClick={(e) => { e.stopPropagation(); onLink(); }}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {linkLabel} &rarr;
          </span>
        )}
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create the 5 card components**

Each card fetches its own data via existing hooks and renders a compact summary. The implementer should read the actual hook return types and adjust field names accordingly. Key patterns:

**CostsCard:** `useAnalyticsCosts()` → weekly spend number + Recharts sparkline of daily trend (7 data points, `h-16` height)

**SessionsCard:** `useHealthAnalytics()` → session count + tiny stacked horizontal bar (green/yellow/red segments using plain divs, no Recharts needed)

**ModelsCard:** `useModelIntelligence()` → dominant model + mini donut chart (Recharts `PieChart` at `h-16`)

**FilesCard:** `useFileHeatmap()` → top 3 hot files with color-coded heat badges (cool=blue, warm=amber, hot=red)

**EfficiencyCard:** Combines data from multiple hooks — daily spend rate, dominant model %, cache hit rate, health %. Renders as a compact text summary with color-coded values.

- [ ] **Step 5: Wire cards into OverviewTab**

```tsx
import { useLocation } from "wouter";
// ... card imports

export function OverviewTab() {
  const [, setLocation] = useLocation();
  const goToTab = (tab: string) => setLocation(`/analytics?tab=${tab}`);

  return (
    <div className="space-y-6">
      <MetricsBar />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CostsCard onLink={() => goToTab("costs")} />
        <SessionsCard onLink={() => goToTab("sessions")} />
        <ModelsCard onLink={() => goToTab("costs")} />
        <FilesCard onLink={() => goToTab("sessions")} />
        <EfficiencyCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/analytics-overview.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/components/analytics/overview/ tests/analytics-overview.test.ts
git commit -m "feat: add all 5 overview summary cards with data hooks and sparklines"
```

---

### Task 13: Wire OverviewTab into stats.tsx, remove Nerve Center

Replace the Nerve Center tab with the Overview tab. Delete the nerve-center component directory. Remove the redundant subtitle.

**Files:**
- Modify: `client/src/pages/stats.tsx`
- Delete: `client/src/components/analytics/nerve-center/` (all files)
- Test: `tests/analytics-overview.test.ts`
- Test: `tests/nerve-center-v2.test.ts` (update — tests for deleted components should be removed or redirected)

- [ ] **Step 1: Write the failing test**

```typescript
it("renders Overview tab instead of Nerve Center", () => {
  render(<Stats />);
  expect(screen.getByText("Overview")).toBeInTheDocument();
  expect(screen.queryByText("Nerve Center")).not.toBeInTheDocument();
});

it("does not render the redundant tab subtitle", () => {
  render(<Stats />);
  expect(screen.queryByText(/Nerve center, costs, charts/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics-overview.test.ts -t "Overview tab"`
Expected: FAIL

- [ ] **Step 3: Update stats.tsx**

1. Remove the nerve-center imports (lines 26-35 in stats.tsx):
```tsx
// DELETE these imports:
import { TopologyLayout, ScannerBrain, CostNerves, ... } from "@/components/analytics/nerve-center";
```

2. Add the new import:
```tsx
import { OverviewTab } from "@/components/analytics/overview/OverviewTab";
```

3. Remove the redundant subtitle (lines 460-462):
```tsx
// DELETE:
<p className="text-sm text-muted-foreground -mt-2">
  Nerve center, costs, charts, sessions, and messages
</p>
```

4. Change the default tab value (line 456):
```tsx
const defaultTab = new URLSearchParams(window.location.search).get("tab") || "overview";
```

5. Replace tab trigger and content:
```tsx
// Change from:
<TabsTrigger value="nerve-center">Nerve Center</TabsTrigger>
// To:
<TabsTrigger value="overview">Overview</TabsTrigger>

// Change from:
<TabsContent value="nerve-center"><NerveCenterTopology /></TabsContent>
// To:
<TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
```

6. Remove the `NerveCenterTopology` function entirely (lines 404-453).

- [ ] **Step 4: Delete the nerve-center directory**

```bash
rm -rf client/src/components/analytics/nerve-center/
```

- [ ] **Step 5: Update or remove nerve-center tests**

The file `tests/nerve-center-v2.test.ts` tests the deleted components. Remove tests for deleted components. If there are tests for data hooks (useNerveCenter, etc.) that are still used, keep those.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS (no broken imports, no references to deleted files)

- [ ] **Step 7: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: replace Nerve Center with Analytics Overview dashboard — card grid with metrics bar"
```

---

## Post-Implementation

- [ ] **Run full test suite:** `npm test`
- [ ] **Run type check:** `npm run check`
- [ ] **Run safety check:** `npx vitest run tests/new-user-safety.test.ts`
- [ ] **Visual verification:** Start dev server (`npm run dev`), test each fix in browser
- [ ] **Update CHANGELOG.md** with the changes
- [ ] **Update test count** in CLAUDE.md if new tests were added
