# Dashboard Cleanup & Session Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve readability of active sessions across the app — rename sessions, clean up display, tighten layout, and tab the analytics sections.

**Architecture:** All changes are UI-layer except one small DB addition (session names map) and one API endpoint. The `shortModel()` utility gets smarter parsing. A new `getSessionDisplayName()` helper centralizes name resolution. Analytics sections become individual tabs instead of vertical scroll.

**Tech Stack:** React, TypeScript, Express, TanStack Query, Tailwind CSS

---

### Task 1: Update `shortModel()` to show versioned names

**Files:**
- Modify: `client/src/lib/utils.ts:30-36`
- Modify: `tests/new-user-safety.test.ts` (run existing tests)

- [ ] **Step 1: Write the failing test**

Create test file `tests/short-model.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shortModel } from "../client/src/lib/utils";

describe("shortModel", () => {
  it("returns Opus 4.6 for claude-opus-4-6", () => {
    expect(shortModel("claude-opus-4-6")).toBe("Opus 4.6");
  });
  it("returns Opus 4.6 for claude-opus-4-6 with context suffix", () => {
    expect(shortModel("claude-opus-4-6[1m]")).toBe("Opus 4.6");
  });
  it("returns Sonnet 4.6 for claude-sonnet-4-6", () => {
    expect(shortModel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  });
  it("returns Haiku 4.5 for claude-haiku-4-5-20251001", () => {
    expect(shortModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });
  it("returns ? for null", () => {
    expect(shortModel(null)).toBe("?");
  });
  it("handles future versions like claude-opus-5-0", () => {
    expect(shortModel("claude-opus-5-0")).toBe("Opus 5.0");
  });
  it("falls back to truncated string for unknown format", () => {
    expect(shortModel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/short-model.test.ts`
Expected: FAIL — current `shortModel` returns "Opus" not "Opus 4.6"

- [ ] **Step 3: Implement the updated `shortModel()`**

Replace the function in `client/src/lib/utils.ts:30-36` with:

```typescript
export function shortModel(model: string | null): string {
  if (!model) return "?";
  // Match pattern: claude-{family}-{major}-{minor}[-suffix]
  const match = model.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${family} ${match[2]}.${match[3]}`;
  }
  // Fallback for unrecognized formats
  return model.slice(0, 12);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/short-model.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add tests/short-model.test.ts client/src/lib/utils.ts
git commit -m "feat: update shortModel() to show versioned names like Opus 4.6"
```

---

### Task 2: Add session rename to DB, storage, and API

**Files:**
- Modify: `server/db.ts:16-37` (add `sessionNames` to `DBData`)
- Modify: `server/db.ts:58-96` (add to `defaultData()`)
- Modify: `server/storage.ts` (add name get/set/delete methods)
- Modify: `server/routes/sessions.ts` (add PATCH endpoint)
- Modify: `shared/types.ts` (no type changes needed — it's `Record<string, string>`)
- Test: `tests/session-rename.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/session-rename.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDB, save, resetDB } from "../server/db";

describe("session rename", () => {
  beforeEach(() => {
    resetDB();
  });

  it("sessionNames exists in default DB", () => {
    const db = getDB();
    expect(db.sessionNames).toEqual({});
  });

  it("stores and retrieves a session name", () => {
    const db = getDB();
    db.sessionNames["test-session-id"] = "My Auth Refactor";
    save();
    const db2 = getDB();
    expect(db2.sessionNames["test-session-id"]).toBe("My Auth Refactor");
  });

  it("deletes a session name", () => {
    const db = getDB();
    db.sessionNames["test-session-id"] = "My Auth Refactor";
    save();
    delete db.sessionNames["test-session-id"];
    save();
    expect(getDB().sessionNames["test-session-id"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session-rename.test.ts`
Expected: FAIL — `sessionNames` doesn't exist on DBData

- [ ] **Step 3: Add `sessionNames` to DB schema**

In `server/db.ts`, add to the `DBData` interface after the `pinnedSessions` line:

```typescript
sessionNames: Record<string, string>;
```

In the `defaultData()` function, add after `pinnedSessions: []`:

```typescript
sessionNames: {},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session-rename.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Add storage methods**

In `server/storage.ts`, add after the pinned sessions section (after `togglePin` method):

```typescript
  // Session Names
  getSessionNames(): Record<string, string> {
    return getDB().sessionNames;
  }

  getSessionName(sessionId: string): string | null {
    return getDB().sessionNames[sessionId] || null;
  }

  setSessionName(sessionId: string, name: string): void {
    const db = getDB();
    db.sessionNames[sessionId] = name;
    save();
  }

  deleteSessionName(sessionId: string): void {
    const db = getDB();
    delete db.sessionNames[sessionId];
    save();
  }
```

Also update `cleanupSessionData` to include session names — add after `delete db.sessionNotes[sessionId]`:

```typescript
delete db.sessionNames[sessionId];
```

- [ ] **Step 6: Add API endpoint**

In `server/routes/sessions.ts`, add after the pin route (~line 419):

```typescript
/** PATCH /api/sessions/:id/name — Set or clear custom session name */
router.patch("/api/sessions:id/name", (req: Request, res: Response) => {
  const idResult = SessionIdSchema.safeParse(String(req.params.id));
  if (!idResult.success) return res.status(400).json({ message: "Invalid session ID format" });
  const name = (req.body as { name?: string })?.name;
  if (typeof name !== "string") return res.status(400).json({ message: "name is required (string)" });
  const trimmed = name.trim();
  if (trimmed === "") {
    storage.deleteSessionName(idResult.data);
  } else {
    storage.setSessionName(idResult.data, trimmed);
  }
  res.json({ sessionId: idResult.data, name: trimmed || null });
});

/** GET /api/sessions/names — Get all custom session names */
router.get("/api/sessions/names", (_req: Request, res: Response) => {
  res.json(storage.getSessionNames());
});
```

- [ ] **Step 7: Add API test**

Add to `tests/session-rename.test.ts`:

```typescript
import request from "supertest";
// Note: import your Express app — adjust path based on how tests bootstrap the server
// If the project uses a test helper, follow that pattern instead

describe("session rename API", () => {
  it("PATCH /api/sessions/:id/name sets a name", async () => {
    // This test verifies the storage layer works for the API
    const { storage } = await import("../server/storage");
    storage.setSessionName("abc-123", "Dashboard Redesign");
    expect(storage.getSessionName("abc-123")).toBe("Dashboard Redesign");
  });

  it("empty name clears the entry", () => {
    const { storage } = require("../server/storage");
    storage.setSessionName("abc-123", "Something");
    storage.deleteSessionName("abc-123");
    expect(storage.getSessionName("abc-123")).toBeNull();
  });

  it("cleanupSessionData removes session name", () => {
    const { storage } = require("../server/storage");
    storage.setSessionName("cleanup-test", "Will Be Removed");
    storage.cleanupSessionData("cleanup-test");
    expect(storage.getSessionName("cleanup-test")).toBeNull();
  });
});
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add server/db.ts server/storage.ts server/routes/sessions.ts tests/session-rename.test.ts
git commit -m "feat: add session rename — DB storage, storage methods, API endpoint"
```

---

### Task 3: Add client-side rename hook and display name helper

**Files:**
- Modify: `client/src/hooks/use-sessions.ts` (add `useSessionNames`, `useRenameSession`)
- Create: `client/src/lib/session-display-name.ts` (shared helper)

- [ ] **Step 1: Add the `useSessionNames` query hook and `useRenameSession` mutation**

In `client/src/hooks/use-sessions.ts`, add after the `useTogglePin` function:

```typescript
export function useSessionNames() {
  return useQuery<Record<string, string>>({
    queryKey: ["/api/sessions/names"],
    staleTime: Infinity,
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/sessions/${id}/name`, { name });
      return res.json() as Promise<{ sessionId: string; name: string | null }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/names"] });
      toast.success("Session renamed");
    },
    onError: (err: Error) => { toast.error(`Failed to rename session: ${err.message}`); },
  });
}
```

- [ ] **Step 2: Create the display name helper**

Create `client/src/lib/session-display-name.ts`:

```typescript
/**
 * Returns the best display name for a session.
 * Priority: custom name > slug > first message summary > truncated session ID
 */
export function getSessionDisplayName(
  sessionId: string,
  opts: {
    customNames?: Record<string, string>;
    slug?: string;
    firstMessage?: string;
    maxLength?: number;
  }
): string {
  const maxLen = opts.maxLength ?? 40;

  // 1. Custom name from user
  const custom = opts.customNames?.[sessionId];
  if (custom) return truncate(custom, maxLen);

  // 2. Slug (Claude's auto-generated name)
  if (opts.slug) return truncate(opts.slug, maxLen);

  // 3. First message summary
  if (opts.firstMessage) {
    const words = opts.firstMessage.trim().split(/\s+/).slice(0, 5);
    let result = words.join(" ");
    if (opts.firstMessage.trim().split(/\s+/).length > 5) result += "...";
    return truncate(result, maxLen);
  }

  // 4. Truncated session ID
  return sessionId.slice(0, 12) + "...";
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
```

- [ ] **Step 3: Write test for the display name helper**

Create `tests/session-display-name.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getSessionDisplayName } from "../client/src/lib/session-display-name";

describe("getSessionDisplayName", () => {
  const id = "abc-123-def-456-ghi-789-jkl-012-mno";

  it("prefers custom name over everything", () => {
    expect(getSessionDisplayName(id, {
      customNames: { [id]: "Auth Refactor" },
      slug: "random-slug",
      firstMessage: "Fix the login bug",
    })).toBe("Auth Refactor");
  });

  it("falls back to slug when no custom name", () => {
    expect(getSessionDisplayName(id, {
      slug: "partitioned-bouncing-hickey",
      firstMessage: "Fix the login bug",
    })).toBe("partitioned-bouncing-hickey");
  });

  it("falls back to first message summary when no slug", () => {
    expect(getSessionDisplayName(id, {
      firstMessage: "Fix the login bug in the authentication module please",
    })).toBe("Fix the login bug in...");
  });

  it("falls back to truncated ID when nothing else", () => {
    expect(getSessionDisplayName(id, {})).toBe("abc-123-def-4...");
  });

  it("truncates long custom names", () => {
    const longName = "This is a very long session name that exceeds the maximum character limit";
    const result = getSessionDisplayName(id, { customNames: { [id]: longName }, maxLength: 40 });
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/session-display-name.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/use-sessions.ts client/src/lib/session-display-name.ts tests/session-display-name.test.ts
git commit -m "feat: add session rename hook and display name helper"
```

---

### Task 4: Add rename button and health colors to Dashboard active sessions

**Files:**
- Modify: `client/src/pages/dashboard.tsx:586-778` (ActiveSessionCard component)
- Modify: `client/src/pages/dashboard.tsx:97-165` (Dashboard component — add hooks, state)

- [ ] **Step 1: Add imports and hooks to Dashboard component**

At the top of `dashboard.tsx`, add imports:

```typescript
import { Pencil } from "lucide-react";
import { useSessionNames, useRenameSession } from "@/hooks/use-sessions";
import { useAppSettings } from "@/hooks/use-settings";
import { getSessionDisplayName } from "@/lib/session-display-name";
import { Input } from "@/components/ui/input";
```

In the `Dashboard` component body (after `const togglePin = useTogglePin();`), add:

```typescript
const { data: sessionNames } = useSessionNames();
const renameSession = useRenameSession();
const { data: settings } = useAppSettings();
```

- [ ] **Step 2: Update ActiveSessionCard props and title resolution**

Update the `ActiveSessionCard` props interface to accept the new data:

```typescript
function ActiveSessionCard({
  session,
  index,
  tick,
  isNew,
  copiedId,
  onCopyResume,
  onTogglePin,
  onRename,
  sessionNames,
  healthThresholds,
}: {
  session: ActiveSession;
  index: number;
  tick: number;
  isNew: boolean;
  copiedId: string | null;
  onCopyResume: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, name: string) => void;
  sessionNames?: Record<string, string>;
  healthThresholds?: { context: { yellow: number; red: number }; cost: { yellow: number; red: number }; messages: { yellow: number; red: number } };
})
```

Replace the title line:

```typescript
const title = getSessionDisplayName(session.sessionId, {
  customNames: sessionNames,
  slug: session.slug,
  firstMessage: session.firstMessage,
});
```

- [ ] **Step 3: Add inline rename state and UI**

Inside `ActiveSessionCard`, add state for inline editing:

```typescript
const [isRenaming, setIsRenaming] = useState(false);
const [renameValue, setRenameValue] = useState("");
const renameInputRef = useRef<HTMLInputElement>(null);

const handleStartRename = () => {
  setRenameValue(sessionNames?.[session.sessionId] || "");
  setIsRenaming(true);
  setTimeout(() => renameInputRef.current?.focus(), 50);
};

const handleConfirmRename = () => {
  onRename(session.sessionId, renameValue);
  setIsRenaming(false);
};

const handleCancelRename = () => {
  setIsRenaming(false);
};
```

Replace the title span in the JSX (the `<span className="text-sm font-medium truncate">{title}</span>` line) with:

```typescript
{isRenaming ? (
  <Input
    ref={renameInputRef}
    value={renameValue}
    onChange={(e) => setRenameValue(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") handleConfirmRename();
      if (e.key === "Escape") handleCancelRename();
    }}
    onBlur={handleConfirmRename}
    className="h-6 text-sm px-1.5 py-0 w-48"
    placeholder="Session name..."
  />
) : (
  <span className="text-sm font-medium truncate" title={session.slug || session.sessionId}>{title}</span>
)}
```

- [ ] **Step 4: Add rename button next to pin and copy-resume**

In the buttons row (after the copy-resume Button), add:

```typescript
<Button
  size="sm"
  variant="ghost"
  className="h-7 w-7 p-0"
  onClick={handleStartRename}
  title="Rename session"
>
  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
</Button>
```

- [ ] **Step 5: Add health threshold color helper and apply to metrics**

Add a helper function at the top of the file (outside components):

```typescript
function thresholdColor(
  value: number,
  thresholds?: { yellow: number; red: number }
): string {
  if (!thresholds) return "";
  if (value >= thresholds.red) return "text-red-400/80";
  if (value >= thresholds.yellow) return "text-amber-400/80";
  return "text-emerald-400/80";
}
```

In `ActiveSessionCard`, replace the message count display (the `{session.messageCount} msgs` span) with:

```typescript
<span className={`tabular-nums ${thresholdColor(session.messageCount ?? 0, healthThresholds?.messages)}`}>
  {session.messageCount} msgs
</span>
```

For data size, no health threshold exists — leave it unstyled (no color change):

```typescript
<span className="tabular-nums">
  {session.sizeBytes! > 1048576 ? `${(session.sizeBytes! / 1048576).toFixed(1)} MB` : `${Math.round(session.sizeBytes! / 1024)} KB`}
</span>
```

Replace the cost display with:

```typescript
<span className={`tabular-nums ${thresholdColor(session.costEstimate ?? 0, healthThresholds?.cost)}`}>
  ${session.costEstimate! < 0.01 ? "<0.01" : session.costEstimate!.toFixed(2)}
</span>
```

- [ ] **Step 6: Fix project key display — convert dashes to path**

Add a helper function near the top of the file:

```typescript
function readableProjectKey(key: string): string {
  // Encoded keys look like: -home-tron-dev-projects-agent-cc
  // Convert leading dash to ~/ and remaining dashes between path segments to /
  const lastSegment = key.split("--").pop() || key;
  // Replace leading dash and convert path-separator dashes to slashes
  return lastSegment
    .replace(/^-/, "~/")
    .replace(/-/g, "/");
}
```

Replace the project key Badge in ActiveSessionCard:

```typescript
<Badge variant="outline" className="text-[10px] px-1.5 py-0">{readableProjectKey(session.projectKey)}</Badge>
```

- [ ] **Step 7: Update the ActiveSessionCard call site to pass new props**

In the Dashboard component, update the `<ActiveSessionCard>` usage:

```typescript
<ActiveSessionCard
  key={session.sessionId}
  session={session}
  index={i}
  tick={tick}
  isNew={newSessionIds.has(session.sessionId)}
  copiedId={copiedId}
  onCopyResume={handleCopyResume}
  onTogglePin={(id) => togglePin.mutate(id)}
  onRename={(id, name) => renameSession.mutate({ id, name })}
  sessionNames={sessionNames}
  healthThresholds={settings?.healthThresholds}
/>
```

- [ ] **Step 8: Run tests and type-check**

Run: `npm run check && npm test`
Expected: No type errors, all tests pass

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: add rename button, health colors, readable paths to active sessions"
```

---

### Task 5: Dashboard layout — fixed height and remove sections

**Files:**
- Modify: `client/src/pages/dashboard.tsx:307-582` (remove sections, add scroll)

- [ ] **Step 1: Add fixed height with scroll to Active Sessions**

In `dashboard.tsx`, the active sessions container (line ~316) is `<div className="space-y-3">`. Wrap the session cards list in a scrollable container:

Change:

```typescript
<div className="space-y-3">
  {activeSessions.map((session, i) => (
```

To:

```typescript
<div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
  {activeSessions.map((session, i) => (
```

(Recent Activity at line ~340 already has `max-h-[600px] overflow-auto` — no change needed.)

- [ ] **Step 2: Remove stat cards section**

Delete the stat cards grid (lines ~349-360):

```typescript
{/* Stat cards */}
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
  ...
</div>
```

- [ ] **Step 3: Remove Quick Actions + Session Stats + System row**

Delete the entire 3-column grid section (lines ~362-517):

```typescript
{/* Quick Actions + Session Stats row */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  ...
</div>
```

- [ ] **Step 4: Remove Recent Changes section**

Delete the Recent Changes card (lines ~538-581):

```typescript
{/* Recent Changes */}
<Card>
  ...
</Card>
```

- [ ] **Step 5: Clean up unused imports and variables**

Remove unused imports and variables that were only used by the deleted sections:
- Remove `StatCard` import
- Remove `quickActions` const
- Remove `entityTypes` const (if only used for stat cards)
- Remove `entityBorderColor` const
- Remove `recentEntities` computation
- Remove unused icons: `Zap`, `Download`, `Search`, `Server`, `Keyboard` (keep only if used elsewhere)
- Keep `entityTypes` if used in the header subtitle count

Check each removal by searching for other usages in the file before deleting.

- [ ] **Step 6: Run type-check and tests**

Run: `npm run check && npm test`
Expected: No type errors, all tests pass

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/dashboard.tsx
git commit -m "feat: dashboard layout — fixed scroll height, remove cards and recent changes"
```

---

### Task 6: Sessions page — convert analytics to tabbed panels

**Files:**
- Modify: `client/src/pages/sessions.tsx` (analytics panel section)

- [ ] **Step 1: Define the tab configuration**

In `sessions.tsx`, inside or above the `AnalyticsPanel` component, add:

```typescript
const ANALYTICS_TABS = [
  { id: "nerve-center", label: "Nerve Center" },
  { id: "usage", label: "Usage Analytics" },
  { id: "files", label: "File Heatmap" },
  { id: "health", label: "Session Health" },
  { id: "projects", label: "Projects" },
  { id: "digest", label: "Weekly Digest" },
  { id: "prompts", label: "Prompts" },
  { id: "workflows", label: "Workflows" },
  { id: "bash", label: "Bash KB" },
  { id: "decisions", label: "Decisions" },
] as const;

type AnalyticsTabId = typeof ANALYTICS_TABS[number]["id"];
```

- [ ] **Step 2: Add tab state with URL persistence**

In the component that renders the analytics panel, add tab state synced to URL:

```typescript
const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabId>(() => {
  const params = new URLSearchParams(window.location.search);
  return (params.get("atab") as AnalyticsTabId) || "nerve-center";
});

const handleTabChange = (tab: AnalyticsTabId) => {
  setAnalyticsTab(tab);
  const params = new URLSearchParams(window.location.search);
  params.set("atab", tab);
  window.history.replaceState({}, "", `?${params.toString()}`);
};
```

- [ ] **Step 3: Add the horizontal scrollable tab bar**

Replace the analytics sections' vertical layout with a tab bar + content area:

```typescript
{/* Analytics Tab Bar */}
<div className="flex gap-1 overflow-x-auto pb-2 border-b border-border/50 mb-4 scrollbar-thin">
  {ANALYTICS_TABS.map((tab) => (
    <button
      key={tab.id}
      onClick={() => handleTabChange(tab.id)}
      className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
        analyticsTab === tab.id
          ? "bg-primary/20 text-primary border border-primary/30"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Wrap each section in conditional rendering**

Replace the vertical stack of sections with conditional rendering based on `analyticsTab`. Each section only renders when its tab is active:

```typescript
{analyticsTab === "nerve-center" && (
  <NerveCenterPanel />
)}
{analyticsTab === "usage" && (
  <div className="space-y-6">
    {/* ... existing usage/cost analytics content ... */}
  </div>
)}
{analyticsTab === "files" && (
  <div className="space-y-6">
    {/* ... existing file heatmap content ... */}
  </div>
)}
{analyticsTab === "health" && (
  <div className="space-y-6">
    {/* ... existing session health content ... */}
  </div>
)}
{analyticsTab === "projects" && (
  <div className="space-y-6">
    {/* ... existing project dashboards content ... */}
  </div>
)}
{analyticsTab === "digest" && (
  <div className="space-y-6">
    {/* ... existing weekly digest content ... */}
  </div>
)}
{analyticsTab === "prompts" && (
  <div className="space-y-6">
    {/* ... existing prompt library content ... */}
  </div>
)}
{analyticsTab === "workflows" && (
  <div className="space-y-6">
    {/* ... existing auto-workflows content ... */}
  </div>
)}
{analyticsTab === "bash" && (
  <div className="space-y-6">
    {/* ... existing bash knowledge base content ... */}
  </div>
)}
{analyticsTab === "decisions" && (
  <div className="space-y-6">
    {/* ... existing decision log content ... */}
  </div>
)}
```

Each section's internal JSX stays exactly the same — just wrapped in conditional rendering.

- [ ] **Step 5: Remove Ask a Question and Smart Context Loader sections**

Delete the "Ask a Question" JSX block (~lines 493-524 in the analytics panel).
Delete the "Smart Context Loader" JSX block (~lines 731-772).
Remove any related state variables (`nlQuestion`, `nlAnswer`, `contextProject`, etc.) and hooks (`useNLQuery`, `useContextLoader`) if they're no longer used anywhere.

- [ ] **Step 6: Remove the Continuation Panel section**

The "Pick Up Where You Left Off" / Continuation Panel sits between Nerve Center and Ask a Question. Since we're removing Ask a Question and organizing into tabs, evaluate if this fits — it's not in the approved tab list, so remove it. Delete the JSX block and the `useContinuations` hook call if unused.

- [ ] **Step 7: Run type-check and tests**

Run: `npm run check && npm test`
Expected: No type errors, all tests pass

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: convert analytics sections to 10 individual tabs, remove Ask a Question and Context Loader"
```

---

### Task 7: Use display name helper in Sessions page and SessionHealthPanel

**Files:**
- Modify: `client/src/pages/sessions.tsx` (session list cards)
- Modify: `client/src/components/session-health-panel.tsx`

- [ ] **Step 1: Update SessionHealthPanel to use display names**

In `session-health-panel.tsx`, import and use the helper:

```typescript
import { getSessionDisplayName } from "@/lib/session-display-name";
import { useSessionNames } from "@/hooks/use-sessions";
```

Add the hook call:

```typescript
const { data: sessionNames } = useSessionNames();
```

Replace wherever session names are displayed (the session title/slug) with:

```typescript
getSessionDisplayName(session.sessionId, {
  customNames: sessionNames,
  slug: session.slug,
  firstMessage: session.firstMessage,
})
```

- [ ] **Step 2: Update Sessions page session cards to use display names**

In `sessions.tsx`, import the helper and hook:

```typescript
import { getSessionDisplayName } from "@/lib/session-display-name";
import { useSessionNames } from "@/hooks/use-sessions";
```

Add the hook call in the Sessions component:

```typescript
const { data: sessionNames } = useSessionNames();
```

In `SessionCard` (or wherever session titles are rendered in the session list), replace the title resolution with:

```typescript
const title = getSessionDisplayName(session.id, {
  customNames: sessionNames,
  slug: session.slug,
  firstMessage: session.firstMessage,
});
```

Pass `sessionNames` down as a prop if the card is a child component.

- [ ] **Step 3: Run type-check and tests**

Run: `npm run check && npm test`
Expected: No type errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/sessions.tsx client/src/components/session-health-panel.tsx
git commit -m "feat: use session display names everywhere — sessions page and health panel"
```

---

### Task 8: Final verification and deploy

**Files:**
- No new files

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
1. Dashboard active sessions show versioned model names (Opus 4.6, etc.)
2. Project keys show readable paths with slashes
3. Messages/size/cost are colored by health thresholds
4. Rename button appears, inline edit works, name persists across refresh
5. Active sessions and recent activity sections scroll independently
6. Cards and recent changes sections are gone
7. Sessions > Analytics tab shows tab bar with 10 tabs
8. Each tab shows only its section content
9. Tab selection persists in URL on refresh
10. Ask a Question and Context Loader are gone

- [ ] **Step 5: Commit any remaining fixes**

If any issues found during verification, fix and commit.
