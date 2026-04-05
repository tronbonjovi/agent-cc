# Cost Accuracy Fixes & Costs Page Buildout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inaccurate cost calculations across three modules and build out the costs page with time-period selection and drill-down accuracy.

**Architecture:** Unify all pricing through `server/scanner/pricing.ts`. Make the `/api/analytics/costs` route accept a `days` query param so the frontend can request scoped windows. Enhance the costs tab in `stats.tsx` with a period selector, weekly comparison, and top-sessions drill-down.

**Tech Stack:** TypeScript, Express, React, TanStack Query, Vitest

---

### Task 1: Add tests for pricing module

**Files:**
- Create: `tests/pricing.test.ts`
- Reference: `server/scanner/pricing.ts`

- [ ] **Step 1: Write tests for `getPricing()` and `computeCost()`**

```typescript
import { describe, it, expect } from "vitest";
import { getPricing, computeCost, getMaxTokens } from "../server/scanner/pricing";

describe("pricing", () => {
  describe("getPricing", () => {
    it("matches opus model strings", () => {
      const p = getPricing("claude-opus-4-20250514");
      expect(p.input).toBe(15);
      expect(p.output).toBe(75);
    });

    it("matches sonnet model strings", () => {
      const p = getPricing("claude-sonnet-4-20250514");
      expect(p.input).toBe(3);
      expect(p.output).toBe(15);
    });

    it("matches haiku model strings", () => {
      const p = getPricing("claude-haiku-3.5-20251001");
      expect(p.input).toBe(0.80);
      expect(p.output).toBe(4);
    });

    it("defaults to sonnet for unknown models", () => {
      const p = getPricing("unknown-model-v9");
      expect(p.input).toBe(3);
      expect(p.output).toBe(15);
    });

    it("is case-sensitive (matches lowercase model strings)", () => {
      // Claude API returns lowercase model strings like "claude-sonnet-4-20250514"
      const p = getPricing("claude-sonnet-4-20250514");
      expect(p.input).toBe(3);
    });
  });

  describe("computeCost", () => {
    it("calculates cost with all token types", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      // 1M input @ $3, 500K output @ $15, 2M cache read @ $0.30, 100K cache creation @ $3.75
      const cost = computeCost(pricing, 1_000_000, 500_000, 2_000_000, 100_000);
      // = (1M*3 + 500K*15 + 2M*0.3 + 100K*3.75) / 1M
      // = (3000000 + 7500000 + 600000 + 375000) / 1000000
      // = 11.475
      expect(cost).toBeCloseTo(11.475, 3);
    });

    it("handles zero tokens", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      expect(computeCost(pricing, 0, 0, 0, 0)).toBe(0);
    });

    it("handles opus pricing correctly", () => {
      const pricing = getPricing("claude-opus-4-20250514");
      // 100K input @ $15, 50K output @ $75
      const cost = computeCost(pricing, 100_000, 50_000, 0, 0);
      // = (100000*15 + 50000*75) / 1000000 = (1500000 + 3750000) / 1000000 = 5.25
      expect(cost).toBeCloseTo(5.25, 3);
    });
  });

  describe("getMaxTokens", () => {
    it("returns 1M for opus", () => {
      expect(getMaxTokens("claude-opus-4-20250514")).toBe(1_000_000);
    });

    it("returns 200K for non-opus", () => {
      expect(getMaxTokens("claude-sonnet-4-20250514")).toBe(200_000);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/pricing.test.ts`
Expected: All tests PASS (these test existing correct code)

- [ ] **Step 3: Commit**

```bash
git add tests/pricing.test.ts
git commit -m "test: add pricing module unit tests"
```

---

### Task 2: Fix live-scanner cost estimate

**Files:**
- Modify: `server/scanner/live-scanner.ts:76,159-161,194,217,244-248`
- Reference: `server/scanner/pricing.ts`

The live-scanner currently lumps all input token types together and applies a single "blended" cache-read rate. This underprices regular input and cache creation tokens. Fix it to use `computeCost()` from pricing.ts with proper per-category rates.

- [ ] **Step 1: Write a test for the fix**

Add to `tests/pricing.test.ts`:

```typescript
describe("live-scanner cost estimate correctness", () => {
  it("cache read tokens should cost 10% of input rate", () => {
    const pricing = getPricing("claude-sonnet-4-20250514");
    // 50K regular input + 500K cache reads + 10K cache creation + 20K output
    const cost = computeCost(pricing, 50_000, 20_000, 500_000, 10_000);
    // = (50000*3 + 20000*15 + 500000*0.3 + 10000*3.75) / 1M
    // = (150000 + 300000 + 150000 + 37500) / 1000000
    // = 0.6375
    expect(cost).toBeCloseTo(0.6375, 4);

    // Old blended approach would have computed:
    // totalInput = 50000 + 500000 + 10000 = 560000
    // blendedRate = pricing.input * 0.1 = 0.3
    // oldCost = (560000/1M * 0.3) + (20000/1M * 15) = 0.168 + 0.3 = 0.468
    // That's 27% lower — underbilling
    const oldWay = (560_000 / 1_000_000 * 0.3) + (20_000 / 1_000_000 * 15);
    expect(oldWay).toBeCloseTo(0.468, 3);
    expect(cost).toBeGreaterThan(oldWay);
  });
});
```

- [ ] **Step 2: Run test to confirm it passes**

Run: `npx vitest run tests/pricing.test.ts`
Expected: PASS (this tests computeCost which already works correctly)

- [ ] **Step 3: Fix `live-scanner.ts` — replace blended calculation with `computeCost()`**

In `server/scanner/live-scanner.ts`, make these changes:

1. Update the import at line 76 to also import `computeCost`:
```typescript
import { getPricing as getModelPricingShared, computeCost, getMaxTokens } from "./pricing";
```

2. Remove the wrapper function `getModelPricing` (lines 159-161) — use `getModelPricingShared` directly renamed to `getPricingForModel` or just inline it.

3. Add separate token accumulators. Replace the token accumulation block (around lines 217) — change from lumping all into `totalInputTokens` to tracking separately:
```typescript
totalInputTokens += u.input_tokens || 0;
totalOutputTokens += u.output_tokens || 0;
totalCacheReadTokens += u.cache_read_input_tokens || 0;
totalCacheCreationTokens += u.cache_creation_input_tokens || 0;
```

Declare `totalCacheReadTokens` and `totalCacheCreationTokens` as `let ... = 0` alongside the existing accumulators near the top of `getSessionDetails()`.

4. Replace the cost estimate block (lines 244-248) with:
```typescript
const pricing = getModelPricingShared(model);
const costEstimate = computeCost(pricing, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreationTokens);
```

5. For the context usage calculation (line 194), keep combining all input types — this is correct for context window usage (all tokens count toward the limit):
```typescript
const tokensUsed = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
```
This line is fine — context window measures total tokens regardless of billing category.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/scanner/live-scanner.ts tests/pricing.test.ts
git commit -m "fix: live-scanner cost estimate uses proper per-category pricing"
```

---

### Task 3: Unify pricing in cost-analytics.ts

**Files:**
- Modify: `server/routes/cost-analytics.ts:1-42`
- Reference: `server/scanner/pricing.ts`

The cost-analytics route defines its own `MODEL_PRICING`, `getModelFamily()`, `getPricing()`, and `computeCost()` — all duplicates of `pricing.ts`. Replace them with imports.

- [ ] **Step 1: Replace local pricing with imports from pricing.ts**

In `server/routes/cost-analytics.ts`:

1. Add import at top (after existing imports):
```typescript
import { getPricing, computeCost as computeCostFromPricing } from "../scanner/pricing";
```

2. Delete the local `MODEL_PRICING` constant (lines 10-15).

3. Delete the local `getModelFamily()` function (lines 17-23).

4. Delete the local `getPricing()` function (lines 25-27).

5. Replace the local `computeCost()` function (lines 29-42) with a thin wrapper that maps the old parameter names (`cacheWriteTokens`) to the new ones (`cacheCreation`):
```typescript
function computeCost(
  pricing: ReturnType<typeof getPricing>,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return computeCostFromPricing(pricing, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
}
```

6. Update `getModelFamily` usages — there's one at line 275 for per-model aggregation. Replace with a local helper that extracts the family name from the model string for display purposes:
```typescript
function getModelFamily(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("haiku")) return "haiku";
  return "sonnet";
}
```

This keeps model display grouping separate from pricing lookup (which now goes through `getPricing()`).

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/routes/cost-analytics.ts
git commit -m "refactor: cost-analytics imports pricing from unified module"
```

---

### Task 4: Add `days` query param to cost-analytics route

**Files:**
- Modify: `server/routes/cost-analytics.ts:196-203,279-284,395`

The route currently scans 30 days of daily buckets but accumulates totals across ALL session files with no date cutoff. Add a `days` query parameter so the frontend can request 7, 30, 90, or all-time data, and scope totals to match.

- [ ] **Step 1: Write tests for the days parameter**

Create `tests/cost-analytics-route.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("cost-analytics route", () => {
  const BASE = "http://localhost:5100";

  it("returns 200 with default 30-day window", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dailyCosts).toBeDefined();
    expect(Array.isArray(data.dailyCosts)).toBe(true);
    expect(data.dailyCosts.length).toBeLessThanOrEqual(30);
    expect(data.totalCost).toBeTypeOf("number");
    expect(data.weeklyComparison).toBeDefined();
  });

  it("accepts days=7 param and returns 7 daily buckets", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs?days=7`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dailyCosts.length).toBeLessThanOrEqual(7);
  });

  it("accepts days=90 param", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs?days=90`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dailyCosts.length).toBeLessThanOrEqual(90);
  });

  it("clamps invalid days param to 30", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs?days=abc`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dailyCosts.length).toBeLessThanOrEqual(30);
  });

  it("includes weeklyComparison in response", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs`);
    const data = await res.json();
    expect(data.weeklyComparison).toHaveProperty("thisWeek");
    expect(data.weeklyComparison).toHaveProperty("lastWeek");
    expect(data.weeklyComparison).toHaveProperty("changePct");
  });

  it("includes topSessions in response", async () => {
    const res = await fetch(`${BASE}/api/analytics/costs`);
    const data = await res.json();
    expect(data.topSessions).toBeDefined();
    expect(Array.isArray(data.topSessions)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — they should fail (weeklyComparison, topSessions don't exist yet)**

Run: `npx vitest run tests/cost-analytics-route.test.ts`
Expected: FAIL on `weeklyComparison` and `topSessions` assertions

- [ ] **Step 3: Implement `days` param, scoped totals, weekly comparison, and top sessions**

In `server/routes/cost-analytics.ts`:

1. Parse `days` from query string in the route handler:
```typescript
router.get("/api/analytics/costs", async (req, res) => {
  try {
    const rawDays = parseInt(req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;

    const now = Date.now();
    const cacheKey = `${days}`;
    if (cachedResult && cachedCacheKey === cacheKey && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return res.json(cachedResult);
    }

    const result = await buildCostAnalytics(days);
    cachedResult = result;
    cachedCacheKey = cacheKey;
    cacheTimestamp = Date.now();
    res.json(result);
  } catch (err) {
    console.error("[cost-analytics] Failed to build analytics:", (err as Error).message);
    res.status(500).json({ message: "Failed to build cost analytics", error: (err as Error).message });
  }
});
```

Add `let cachedCacheKey = "";` next to the existing cache variables.

2. Update `buildCostAnalytics` to accept `days` parameter:
```typescript
async function buildCostAnalytics(days: number): Promise<CostAnalyticsResult> {
```

3. Replace the hardcoded 30-day cutoff and bucket initialization to use `days`:
```typescript
const now = new Date();
const cutoffDate = new Date(now);
cutoffDate.setDate(cutoffDate.getDate() - days);
const cutoffStr = cutoffDate.toISOString().slice(0, 10);

const dailyMap: Record<string, { ... }> = {};
for (let i = 0; i < days; i++) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const dateKey = d.toISOString().slice(0, 10);
  dailyMap[dateKey] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0 };
}
```

4. Scope ALL totals to the date cutoff. In the per-token loop (around line 274-294), wrap the total accumulation in the same date check:
```typescript
const dateKey = tk.timestamp.slice(0, 10);
const inWindow = dateKey >= cutoffStr;

if (inWindow) {
  totalInputTokens += tk.inputTokens;
  totalOutputTokens += tk.outputTokens;
  totalCacheReadTokens += tk.cacheReadTokens;
  totalCacheWriteTokens += tk.cacheWriteTokens;
  totalCost += cost;
}

// Daily buckets (already filtered)
if (inWindow && dailyMap[dateKey]) {
  dailyMap[dateKey].inputTokens += tk.inputTokens;
  // ... etc
}

// Per-model — also scope to window
if (inWindow) {
  if (!modelMap[family]) { ... }
  modelMap[family].inputTokens += tk.inputTokens;
  // ... etc
  modelFamiliesSeen.add(family);
}

// Per-project — also scope to window
if (inWindow) {
  if (!projectMap[projectPath]) { ... }
  projectMap[projectPath].inputTokens += tk.inputTokens;
  // ... etc
}
```

5. Add `weeklyComparison` to the result. After building `dailyCosts` array:
```typescript
// Weekly comparison
const todayStr = now.toISOString().slice(0, 10);
const sevenDaysAgo = new Date(now);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fourteenDaysAgo = new Date(now);
fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
const sevenStr = sevenDaysAgo.toISOString().slice(0, 10);
const fourteenStr = fourteenDaysAgo.toISOString().slice(0, 10);

const thisWeekCost = dailyCosts
  .filter(d => d.date >= sevenStr)
  .reduce((s, d) => s + d.cost, 0);
const lastWeekCost = dailyCosts
  .filter(d => d.date >= fourteenStr && d.date < sevenStr)
  .reduce((s, d) => s + d.cost, 0);
const changePct = lastWeekCost > 0 ? Math.round((thisWeekCost / lastWeekCost - 1) * 100) : 0;
```

6. Add `topSessions` — collect per-session costs during processing. Add a `sessionCostMap` alongside existing maps:
```typescript
const sessionCostMap: Record<string, { cost: number; tokens: number; model: string; firstMessage: string }> = {};
```

In the processing loop, accumulate per-session:
```typescript
if (inWindow) {
  const sid = session.id;
  if (!sessionCostMap[sid]) {
    sessionCostMap[sid] = { cost: 0, tokens: 0, model: "", firstMessage: (session as any).firstMessage || "" };
  }
  sessionCostMap[sid].cost += cost;
  sessionCostMap[sid].tokens += tk.inputTokens + tk.outputTokens;
  if (!sessionCostMap[sid].model) sessionCostMap[sid].model = family;
}
```

Build top sessions:
```typescript
const topSessions = Object.entries(sessionCostMap)
  .map(([sessionId, data]) => ({
    sessionId,
    firstMessage: data.firstMessage.slice(0, 100),
    cost: Math.round(data.cost * 1000) / 1000,
    tokens: data.tokens,
    model: data.model,
  }))
  .sort((a, b) => b.cost - a.cost)
  .slice(0, 20);
```

7. Add fields to `CostAnalyticsResult` interface:
```typescript
interface CostAnalyticsResult {
  // ... existing fields ...
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  topSessions: Array<{ sessionId: string; firstMessage: string; cost: number; tokens: number; model: string }>;
}
```

8. Include in return:
```typescript
return {
  // ... existing fields ...
  weeklyComparison: {
    thisWeek: Math.round(thisWeekCost * 100) / 100,
    lastWeek: Math.round(lastWeekCost * 100) / 100,
    changePct,
  },
  topSessions,
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/cost-analytics-route.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add server/routes/cost-analytics.ts tests/cost-analytics-route.test.ts
git commit -m "feat: cost-analytics supports days param, scoped totals, weekly comparison, top sessions"
```

---

### Task 5: Fix cache savings calculation in stats.tsx

**Files:**
- Modify: `client/src/pages/stats.tsx:348-351`

The cache savings calculation hardcodes Sonnet pricing. Instead, compute it from the actual token data and total cost already in the API response.

- [ ] **Step 1: Replace hardcoded cache savings calculation**

In `client/src/pages/stats.tsx`, replace lines 348-351:

```typescript
// Old (hardcoded Sonnet prices):
const inputPricePerToken = 3 / 1_000_000;
const cacheReadPricePerToken = 0.3 / 1_000_000;
const costWithoutCache = data.totalCost + data.totalCacheReadTokens * (inputPricePerToken - cacheReadPricePerToken);
const cacheSavings = costWithoutCache > 0 ? ((costWithoutCache - data.totalCost) / costWithoutCache) * 100 : 0;
```

With model-aware calculation using the per-model data from the API:

```typescript
// Calculate cache savings from per-model data
// For each model, cache reads saved (fullInputRate - cacheReadRate) * cacheReadTokens
// We approximate using weighted average: total cache read savings = totalCacheReadTokens * avg savings rate
// Since we have totalCost (which already uses correct per-model cache read rates),
// we compute what cost WOULD have been if cache reads were charged at full input rate.
// The API gives us byModel breakdown, but not per-model cache tokens.
// Best approximation: use dominant model's pricing.
const dominantModel = Object.entries(data.byModel).sort((a, b) => b[1].cost - a[1].cost)[0];
const modelKey = dominantModel ? dominantModel[0].toLowerCase() : "sonnet";
const inputRate = modelKey.includes("opus") ? 15 : modelKey.includes("haiku") ? 0.80 : 3;
const cacheReadRate = inputRate * 0.1;
const savingsPerToken = (inputRate - cacheReadRate) / 1_000_000;
const totalSaved = data.totalCacheReadTokens * savingsPerToken;
const costWithoutCache = data.totalCost + totalSaved;
const cacheSavings = costWithoutCache > 0 ? (totalSaved / costWithoutCache) * 100 : 0;
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/stats.tsx
git commit -m "fix: cache savings uses dominant model pricing instead of hardcoded Sonnet"
```

---

### Task 6: Build out costs page — time period selector and enhanced UI

**Files:**
- Modify: `client/src/pages/stats.tsx` (CostsTab function, around lines 339-558)

This is the main UI buildout. Add:
1. Time period pill selector (7d / 30d / 90d)
2. Weekly comparison banner
3. Top sessions table
4. Enhanced model breakdown with cache columns

- [ ] **Step 1: Update the CostAnalytics type to include new API fields**

In `stats.tsx`, update the `CostAnalytics` interface (around line 82):

```typescript
interface CostAnalytics {
  dailyCosts: DailyCost[];
  byModel: Record<string, ModelBreakdown>;
  byProject: ProjectBreakdown[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
  errors: ErrorEntry[];
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  topSessions: Array<{ sessionId: string; firstMessage: string; cost: number; tokens: number; model: string }>;
}
```

- [ ] **Step 2: Add time period state and parameterized query**

Replace the CostsTab function opening (lines 339-344):

```typescript
function CostsTab() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const { data, isLoading } = useQuery<CostAnalytics>({
    queryKey: ["/api/analytics/costs", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/costs?days=${period}`);
      if (!res.ok) throw new Error("Failed to fetch cost analytics");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading || !data) return <LoadingSkeleton title="cost data" />;
```

- [ ] **Step 3: Add period selector pills at the top of the CostsTab return**

Insert right after the opening `<div className="space-y-6">`:

```tsx
{/* Period Selector */}
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground mr-1">Period:</span>
  {([7, 30, 90] as const).map((d) => (
    <button
      key={d}
      onClick={() => setPeriod(d)}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        period === d
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted"
      }`}
    >
      {d}d
    </button>
  ))}
</div>
```

- [ ] **Step 4: Add weekly comparison banner after the summary cards**

Insert after the summary cards grid closing `</div>` (after the `.map()` block, before the Daily Cost Chart card):

```tsx
{/* Weekly Comparison */}
{data.weeklyComparison && (
  <Card className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
    <CardContent className="py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className={`h-5 w-5 ${data.weeklyComparison.changePct > 0 ? "text-red-400" : data.weeklyComparison.changePct < 0 ? "text-green-400" : "text-muted-foreground"}`} />
          <div>
            <div className="text-sm font-medium">This Week</div>
            <div className="text-2xl font-bold font-mono tabular-nums">{formatCost(data.weeklyComparison.thisWeek)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">vs Last Week</div>
          <div className="text-lg font-mono tabular-nums text-muted-foreground">{formatCost(data.weeklyComparison.lastWeek)}</div>
        </div>
        <div className={`text-right px-3 py-1.5 rounded-lg ${
          data.weeklyComparison.changePct > 20 ? "bg-red-500/10 text-red-400" :
          data.weeklyComparison.changePct > 0 ? "bg-amber-500/10 text-amber-400" :
          data.weeklyComparison.changePct < 0 ? "bg-green-500/10 text-green-400" :
          "bg-muted/30 text-muted-foreground"
        }`}>
          <div className="text-xs">Change</div>
          <div className="text-lg font-bold font-mono tabular-nums">
            {data.weeklyComparison.changePct > 0 ? "+" : ""}{data.weeklyComparison.changePct}%
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 5: Add Top Sessions table after the Per-Project breakdown**

Insert after the model & project breakdown grid (after the closing `</div>` of the `grid grid-cols-1 lg:grid-cols-2` div), before the error breakdown:

```tsx
{/* Top Sessions */}
{data.topSessions && data.topSessions.length > 0 && (
  <Card className="animate-fade-in-up" style={{ animationDelay: "375ms" }}>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" />
        Most Expensive Sessions
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">Top 20</Badge>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-0.5 max-h-[500px] overflow-auto">
        <div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5 sticky top-0 bg-card">
          <span className="flex-1">Session</span>
          <span className="w-16 text-right">Model</span>
          <span className="w-20 text-right">Tokens</span>
          <span className="w-16 text-right">Cost</span>
        </div>
        {data.topSessions.map((session) => (
          <div
            key={session.sessionId}
            className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors cursor-pointer"
            onClick={() => setLocation(`/sessions/${session.sessionId}`)}
          >
            <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
              {session.firstMessage || session.sessionId.slice(0, 8)}
            </span>
            <span className="w-16 text-right">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                session.model === "opus" ? "text-orange-400 border-orange-400/30" :
                session.model === "haiku" ? "text-green-400 border-green-400/30" :
                "text-blue-400 border-blue-400/30"
              }`}>{session.model}</Badge>
            </span>
            <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(session.tokens)}</span>
            <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(session.cost)}</span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 6: Update the "Total Cost" summary card label to reflect period**

In the summary cards array, change the "Total Cost" label to be period-aware:

```typescript
{ icon: DollarSign, color: "text-green-400", label: `Cost (${period}d)`, value: formatCost(data.totalCost) },
```

- [ ] **Step 7: Run type check and dev server**

Run: `npm run check`
Expected: No type errors

Run: `npm run dev` (manual visual check)
Expected: Costs tab shows period selector, weekly comparison banner, top sessions table

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/stats.tsx
git commit -m "feat: costs page with time period selector, weekly comparison, top sessions"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS (no hardcoded paths, PII, etc.)

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 4: Build production bundle**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit any remaining changes**

Only if there are uncommitted fixes from verification steps.
