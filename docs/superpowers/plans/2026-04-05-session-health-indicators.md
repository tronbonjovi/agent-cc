# Session Health Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface active session health metrics (context %, cost, messages) in a dedicated panel on the Sessions page with configurable thresholds and color-coded indicators.

**Architecture:** Add `SessionHealthThresholds` to AppSettings, create a `SessionHealthPanel` React component that consumes the existing `useLiveData()` hook with smart polling (5s active / 30s idle), and add a settings section for threshold configuration. No new server endpoints needed — all data already exists on `ActiveSession`.

**Tech Stack:** React, React Query, Tailwind CSS, Zod validation, Vitest

---

### Task 1: Add SessionHealthThresholds type and defaults

**Files:**
- Modify: `shared/types.ts:721-733` (AppSettings interface)
- Modify: `server/db.ts:39-51` (defaultAppSettings)

- [ ] **Step 1: Write the failing test**

Create `tests/session-health.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-health-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.AGENT_CC_DATA = tmpDir;

const { Storage } = await import("../server/storage");
const { getDB, defaultAppSettings } = await import("../server/db");

describe("Session Health Thresholds", () => {
  let storage: InstanceType<typeof Storage>;

  beforeEach(() => {
    const dbPath = path.join(tmpDir, "agent-cc.json");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const tmpPath = dbPath + ".tmp";
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    storage = new Storage();
  });

  it("should have default health thresholds in AppSettings", () => {
    const settings = storage.getAppSettings();
    expect(settings.healthThresholds).toBeDefined();
    expect(settings.healthThresholds).toEqual({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
  });

  it("should match defaultAppSettings export", () => {
    expect(defaultAppSettings.healthThresholds).toEqual({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session-health.test.ts --reporter=verbose`
Expected: FAIL — `healthThresholds` does not exist on AppSettings

- [ ] **Step 3: Add type to shared/types.ts**

In `shared/types.ts`, add before the `AppSettings` interface:

```typescript
export interface SessionHealthThresholds {
  context: { yellow: number; red: number };
  cost: { yellow: number; red: number };
  messages: { yellow: number; red: number };
}
```

Then add to `AppSettings`:

```typescript
export interface AppSettings {
  appName: string;
  onboarded: boolean;
  billingMode: BillingMode;
  healthThresholds: SessionHealthThresholds;
  scanPaths: {
    homeDir: string | null;
    claudeDir: string | null;
    extraMcpFiles: string[];
    extraProjectDirs: string[];
    extraSkillDirs: string[];
    extraPluginDirs: string[];
  };
}
```

- [ ] **Step 4: Add defaults to server/db.ts**

In `server/db.ts`, update `defaultAppSettings`:

```typescript
export const defaultAppSettings: AppSettings = {
  appName: "Agent CC",
  onboarded: true,
  billingMode: "auto",
  healthThresholds: {
    context: { yellow: 20, red: 50 },
    cost: { yellow: 3, red: 5 },
    messages: { yellow: 30, red: 60 },
  },
  scanPaths: {
    homeDir: null,
    claudeDir: null,
    extraMcpFiles: [],
    extraProjectDirs: [],
    extraSkillDirs: [],
    extraPluginDirs: [],
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/session-health.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/db.ts tests/session-health.test.ts
git commit -m "feat: add SessionHealthThresholds type and defaults"
```

---

### Task 2: Add storage and API support for health thresholds

**Files:**
- Modify: `server/storage.ts:135-145` (updateAppSettings)
- Modify: `server/routes/settings.ts` (validation schema + patch handler)
- Modify: `tests/session-health.test.ts` (add storage and API tests)

- [ ] **Step 1: Write failing tests for storage and API**

Append to `tests/session-health.test.ts`:

```typescript
  it("should update health thresholds via storage", () => {
    const updated = storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 25, red: 60 },
        cost: { yellow: 5, red: 10 },
        messages: { yellow: 40, red: 80 },
      },
    });
    expect(updated.healthThresholds).toEqual({
      context: { yellow: 25, red: 60 },
      cost: { yellow: 5, red: 10 },
      messages: { yellow: 40, red: 80 },
    });
  });

  it("should partially update health thresholds", () => {
    storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 25, red: 60 },
        cost: { yellow: 3, red: 5 },
        messages: { yellow: 30, red: 60 },
      },
    });
    const settings = storage.getAppSettings();
    expect(settings.healthThresholds.context).toEqual({ yellow: 25, red: 60 });
    // cost and messages should be as set
    expect(settings.healthThresholds.cost).toEqual({ yellow: 3, red: 5 });
  });

  it("should preserve other settings when updating thresholds", () => {
    storage.updateAppSettings({ appName: "Test App" });
    storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 10, red: 40 },
        cost: { yellow: 2, red: 8 },
        messages: { yellow: 20, red: 50 },
      },
    });
    const settings = storage.getAppSettings();
    expect(settings.appName).toBe("Test App");
    expect(settings.healthThresholds.context.yellow).toBe(10);
  });
```

Add a new describe block for API validation:

```typescript
describe("Session Health API Validation", () => {
  it("should accept valid health thresholds in settings patch schema", async () => {
    const { z } = await import("zod");

    // Import the schema shape by re-creating it (mirrors settings.ts)
    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    }).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

    const HealthThresholdsSchema = z.object({
      context: ThresholdPairSchema,
      cost: ThresholdPairSchema,
      messages: ThresholdPairSchema,
    });

    const valid = HealthThresholdsSchema.safeParse({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
    expect(valid.success).toBe(true);
  });

  it("should reject thresholds where yellow >= red", async () => {
    const { z } = await import("zod");

    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    }).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

    const invalid = ThresholdPairSchema.safeParse({ yellow: 50, red: 20 });
    expect(invalid.success).toBe(false);
  });

  it("should reject negative threshold values", async () => {
    const { z } = await import("zod");

    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    });

    const invalid = ThresholdPairSchema.safeParse({ yellow: -5, red: 10 });
    expect(invalid.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/session-health.test.ts --reporter=verbose`
Expected: FAIL — storage doesn't handle `healthThresholds` in updateAppSettings

- [ ] **Step 3: Update storage.ts**

In `server/storage.ts`, add to `updateAppSettings`:

```typescript
  updateAppSettings(patch: Partial<AppSettings>): AppSettings {
    const db = getDB();
    if (patch.appName !== undefined) db.appSettings.appName = patch.appName;
    if (patch.onboarded !== undefined) db.appSettings.onboarded = patch.onboarded;
    if (patch.billingMode !== undefined) db.appSettings.billingMode = patch.billingMode;
    if (patch.scanPaths) {
      db.appSettings.scanPaths = { ...db.appSettings.scanPaths, ...patch.scanPaths };
    }
    if (patch.healthThresholds) {
      db.appSettings.healthThresholds = { ...patch.healthThresholds };
    }
    save();
    return db.appSettings;
  }
```

- [ ] **Step 4: Update settings.ts route validation**

In `server/routes/settings.ts`, add the schema and patch handler:

```typescript
const ThresholdPairSchema = z.object({
  yellow: z.number().positive(),
  red: z.number().positive(),
}).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

const HealthThresholdsSchema = z.object({
  context: ThresholdPairSchema,
  cost: ThresholdPairSchema,
  messages: ThresholdPairSchema,
}).optional();
```

Add to `SettingsPatchSchema`:

```typescript
const SettingsPatchSchema = z.object({
  appName: z.string().trim().min(1, "appName must be a non-empty string").max(50, "appName must be 50 characters or fewer").optional(),
  scanPaths: ScanPathsSchema,
  onboarded: z.boolean().optional(),
  healthThresholds: HealthThresholdsSchema,
});
```

Add to the PATCH handler body (after the `onboarded` check):

```typescript
  if (parsed.healthThresholds !== undefined) patch.healthThresholds = parsed.healthThresholds;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/session-health.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass (no regressions)

- [ ] **Step 7: Commit**

```bash
git add server/storage.ts server/routes/settings.ts tests/session-health.test.ts
git commit -m "feat: storage and API support for health thresholds"
```

---

### Task 3: Create SessionHealthPanel component

**Files:**
- Create: `client/src/components/session-health-panel.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/session-health-panel.tsx`:

```typescript
import { useRef } from "react";
import { useLiveData } from "@/hooks/use-agents";
import { useAppSettings } from "@/hooks/use-settings";
import type { ActiveSession, SessionHealthThresholds } from "@shared/types";

type ThresholdLevel = "green" | "yellow" | "red";

function getLevel(value: number, thresholds: { yellow: number; red: number }): ThresholdLevel {
  if (value >= thresholds.red) return "red";
  if (value >= thresholds.yellow) return "yellow";
  return "green";
}

function worstLevel(levels: ThresholdLevel[]): ThresholdLevel {
  if (levels.includes("red")) return "red";
  if (levels.includes("yellow")) return "yellow";
  return "green";
}

const levelColors: Record<ThresholdLevel, string> = {
  green: "text-green-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};

const dotColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const barColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const badgeColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500/15 text-green-400",
  yellow: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};

interface PrevLevels {
  context: ThresholdLevel;
  cost: ThresholdLevel;
  messages: ThresholdLevel;
}

function SessionRow({
  session,
  thresholds,
  prevLevelsRef,
}: {
  session: ActiveSession;
  thresholds: SessionHealthThresholds;
  prevLevelsRef: React.MutableRefObject<Record<string, PrevLevels>>;
}) {
  const contextPct = session.contextUsage?.percentage ?? 0;
  const cost = session.costEstimate ?? 0;
  const messages = session.messageCount ?? 0;

  const contextLevel = getLevel(contextPct, thresholds.context);
  const costLevel = getLevel(cost, thresholds.cost);
  const messagesLevel = getLevel(messages, thresholds.messages);
  const overall = worstLevel([contextLevel, costLevel, messagesLevel]);

  // Detect threshold crossings for pulse animation
  const prev = prevLevelsRef.current[session.sessionId];
  const crossings = {
    context: prev ? prev.context !== contextLevel && contextLevel !== "green" : false,
    cost: prev ? prev.cost !== costLevel && costLevel !== "green" : false,
    messages: prev ? prev.messages !== messagesLevel && messagesLevel !== "green" : false,
  };
  prevLevelsRef.current[session.sessionId] = {
    context: contextLevel,
    cost: costLevel,
    messages: messagesLevel,
  };

  const pulseClass = "animate-pulse";
  const sessionName = session.firstMessage || session.slug || "Untitled session";

  return (
    <div className="bg-muted/20 rounded-md px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[overall]}`} />
          <span className="text-sm text-foreground truncate">{sessionName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-mono ${levelColors[costLevel]} ${crossings.cost ? pulseClass : ""}`}>
            ${cost.toFixed(2)}
          </span>
          <span className={`text-xs font-mono ${levelColors[messagesLevel]} ${crossings.messages ? pulseClass : ""}`}>
            {messages} msgs
          </span>
          {session.status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeColors[overall]}`}>
              {session.status}
            </span>
          )}
        </div>
      </div>
      <div className="ml-[18px]">
        <div className="bg-muted/30 rounded-sm h-1 overflow-hidden">
          <div
            className={`h-full rounded-sm transition-all duration-500 ${barColors[contextLevel]}`}
            style={{ width: `${Math.min(contextPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function SessionHealthPanel() {
  const { data: settings } = useAppSettings();
  const { data: liveData } = useLiveData();
  const prevLevelsRef = useRef<Record<string, PrevLevels>>({});

  const activeSessions = liveData?.activeSessions ?? [];
  if (activeSessions.length === 0) return null;

  const thresholds = settings?.healthThresholds ?? {
    context: { yellow: 20, red: 50 },
    cost: { yellow: 3, red: 5 },
    messages: { yellow: 30, red: 60 },
  };

  return (
    <div className="space-y-1.5 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          Active Sessions
        </h3>
        <span className="text-xs text-muted-foreground">
          {activeSessions.length} session{activeSessions.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-1">
        {activeSessions.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            thresholds={thresholds}
            prevLevelsRef={prevLevelsRef}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: PASS — no type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/session-health-panel.tsx
git commit -m "feat: create SessionHealthPanel component"
```

---

### Task 4: Add smart polling to useLiveData

**Files:**
- Modify: `client/src/hooks/use-agents.ts:76-81` (useLiveData hook)

- [ ] **Step 1: Update useLiveData with smart polling**

In `client/src/hooks/use-agents.ts`, replace the `useLiveData` function:

```typescript
export function useLiveData() {
  return useQuery<LiveData>({
    queryKey: ["/api/live"],
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.activeSessions && data.activeSessions.length > 0;
      return hasActive ? 5000 : 30000;
    },
  });
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/use-agents.ts
git commit -m "feat: smart polling for useLiveData (5s active, 30s idle)"
```

---

### Task 5: Integrate health panel into Sessions page

**Files:**
- Modify: `client/src/pages/sessions.tsx` (add panel import and render)

- [ ] **Step 1: Add import**

At the top of `client/src/pages/sessions.tsx`, add:

```typescript
import { SessionHealthPanel } from "@/components/session-health-panel";
```

- [ ] **Step 2: Add panel to page**

Find the section where stat cards are rendered (around line 145-247). Insert the `<SessionHealthPanel />` immediately after the stat cards section and before the tab bar. Look for the closing `</div>` of the stats grid and add after it:

```typescript
<SessionHealthPanel />
```

- [ ] **Step 3: Run TypeScript check and dev server**

Run: `npm run check`
Expected: PASS

Run: `npm run dev`
Verify: Open http://localhost:5100, navigate to Sessions page. If active sessions exist, the health panel should appear above the tabs. If none are active, nothing should render.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/sessions.tsx
git commit -m "feat: integrate SessionHealthPanel into Sessions page"
```

---

### Task 6: Add health thresholds to Settings UI

**Files:**
- Modify: `client/src/pages/settings.tsx` (add health thresholds section)

- [ ] **Step 1: Create the HealthThresholdsSection component**

Add a new component inside `client/src/pages/settings.tsx` (or if the file is already large, create `client/src/components/settings-health-thresholds.tsx`). The component:

```typescript
import { useState, useEffect } from "react";
import { useAppSettings, useUpdateSettings } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionHealthThresholds } from "@shared/types";

const defaultThresholds: SessionHealthThresholds = {
  context: { yellow: 20, red: 50 },
  cost: { yellow: 3, red: 5 },
  messages: { yellow: 30, red: 60 },
};

function ThresholdRow({
  label,
  unit,
  yellow,
  red,
  onYellowChange,
  onRedChange,
}: {
  label: string;
  unit: string;
  yellow: number;
  red: number;
  onYellowChange: (v: number) => void;
  onRedChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground w-24">{label}</span>
      <div className="flex items-center gap-2">
        <label className="text-xs text-amber-400">Yellow</label>
        <input
          type="number"
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
          value={yellow}
          min={0}
          onChange={(e) => onYellowChange(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-red-400">Red</label>
        <input
          type="number"
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
          value={red}
          min={0}
          onChange={(e) => onRedChange(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function HealthThresholdsSettings() {
  const { data: settings } = useAppSettings();
  const updateSettings = useUpdateSettings();
  const [thresholds, setThresholds] = useState<SessionHealthThresholds>(defaultThresholds);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.healthThresholds) {
      setThresholds(settings.healthThresholds);
    }
  }, [settings?.healthThresholds]);

  function update(metric: keyof SessionHealthThresholds, level: "yellow" | "red", value: number) {
    setThresholds((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [level]: value },
    }));
    setDirty(true);
  }

  function save() {
    // Validate yellow < red for each
    for (const key of ["context", "cost", "messages"] as const) {
      if (thresholds[key].yellow >= thresholds[key].red) {
        return; // silently prevent invalid save — inputs show the issue
      }
    }
    updateSettings.mutate({ healthThresholds: thresholds });
    setDirty(false);
  }

  function reset() {
    setThresholds(defaultThresholds);
    updateSettings.mutate({ healthThresholds: defaultThresholds });
    setDirty(false);
  }

  return (
    <Card className="rounded-xl border bg-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Session Health Thresholds</h3>
            <p className="text-xs text-muted-foreground">
              Configure when health indicators change from green → yellow → red
            </p>
          </div>
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
        </div>
        <div className="space-y-3">
          <ThresholdRow
            label="Context %"
            unit="%"
            yellow={thresholds.context.yellow}
            red={thresholds.context.red}
            onYellowChange={(v) => update("context", "yellow", v)}
            onRedChange={(v) => update("context", "red", v)}
          />
          <ThresholdRow
            label="Cost"
            unit="USD"
            yellow={thresholds.cost.yellow}
            red={thresholds.cost.red}
            onYellowChange={(v) => update("cost", "yellow", v)}
            onRedChange={(v) => update("cost", "red", v)}
          />
          <ThresholdRow
            label="Messages"
            unit="msgs"
            yellow={thresholds.messages.yellow}
            red={thresholds.messages.red}
            onYellowChange={(v) => update("messages", "yellow", v)}
            onRedChange={(v) => update("messages", "red", v)}
          />
        </div>
        {dirty && (
          <button
            onClick={save}
            className="rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            Save Thresholds
          </button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add to settings page**

In `client/src/pages/settings.tsx`, import and render the component within the General tab (or as its own section if the settings page uses tabs):

```typescript
import { HealthThresholdsSettings } from "@/components/settings-health-thresholds";
```

Add `<HealthThresholdsSettings />` in the appropriate location within the settings page layout.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/settings-health-thresholds.tsx client/src/pages/settings.tsx
git commit -m "feat: add health thresholds configuration to Settings"
```

---

### Task 7: Run full test suite and verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass including new session-health tests

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts --reporter=verbose`
Expected: PASS — no PII, no hardcoded paths

- [ ] **Step 4: Manual verification**

Run: `npm run dev`

Verify on http://localhost:5100:
1. Sessions page: Health panel appears if active sessions exist, hidden if none
2. Health panel: Dot color reflects worst metric, progress bar shows context %, cost and messages are independently colored
3. Settings page: Health thresholds section shows three rows with yellow/red inputs
4. Settings page: Changing thresholds and saving updates the health panel colors
5. Settings page: "Reset to defaults" restores original values

- [ ] **Step 5: Build production bundle**

Run: `npm run build`
Expected: No build errors

- [ ] **Step 6: Commit any fixes, then final commit**

If any fixes were needed during verification, commit them. Then:

```bash
git add -A
git commit -m "feat: session health indicators — complete"
```
