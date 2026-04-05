# Cost Data Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cost indexer that parses JSONL files once, stores structured cost records with exact model versions and subagent relationships, and serves the costs page from that stored data.

**Architecture:** New `cost-indexer.ts` module parses JSONL files incrementally, stores `CostRecord` objects in `agent-cc.json` via the existing db/storage layer. The `/api/analytics/costs` route is rewritten to query stored records instead of re-parsing JSONL. The costs page is updated with exact model versions, compute/cache cost split, and subagent awareness.

**Tech Stack:** TypeScript, Express, Vitest, existing db.ts/storage.ts persistence layer

## File Structure

```
server/scanner/cost-indexer.ts    — NEW: Incremental JSONL parser + record storage + query API
server/scanner/pricing.ts         — MODIFY: Add getModelFamily() export
shared/types.ts                   — MODIFY: Add CostRecord, CostIndexState, CostSummary, SessionCostDetail
server/db.ts                      — MODIFY: Add costRecords + costIndexState to DBData
server/routes/cost-analytics.ts   — REWRITE: Thin query layer over cost-indexer (no JSONL parsing)
server/scanner/index.ts           — MODIFY: Call indexCosts() after scanAllSessions()
client/src/pages/stats.tsx        — MODIFY: Update CostsTab with exact models, cache split, drill-down
tests/cost-indexer.test.ts        — NEW: Tests for indexer parsing, storage, queries
tests/pricing.test.ts             — MODIFY: Add getModelFamily tests
```

---

### Task 1: Add shared types for cost data model

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add CostRecord interface**

At the end of `shared/types.ts` (after the existing interfaces), add:

```typescript
// --- Cost Data Precision ---

export interface CostPricingSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface CostRecord {
  id: string;                     // hash of sessionId + timestamp + model
  sessionId: string;
  parentSessionId: string | null; // non-null if this is a subagent
  projectKey: string;
  model: string;                  // exact: "claude-opus-4-6"
  modelFamily: string;            // derived: "opus-4-6"
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;                   // USD at time of indexing
  pricingSnapshot: CostPricingSnapshot;
  timestamp: string;              // ISO 8601 from JSONL
  indexedAt: string;
}

export interface CostIndexState {
  files: Record<string, {
    filePath: string;
    lastOffset: number;
    lastTimestamp: string;
    recordCount: number;
    fileSize: number;             // detect truncation/rewrite
  }>;
  totalRecords: number;
  lastIndexAt: string;
  version: number;
}

export interface CostTokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: CostTokenBreakdown;
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  monthlyTotalCost: number;
  byModel: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    sessions: number;
  }>;
  byProject: Array<{
    projectKey: string;
    projectName: string;
    cost: number;
    sessions: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
    computeCost: number;
    cacheCost: number;
  }>;
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    model: string;
    cost: number;
    subagentCount: number;
    subagentCost: number;
    tokens: CostTokenBreakdown;
  }>;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
}

export interface SessionCostDetail {
  sessionId: string;
  firstMessage: string;
  totalCost: number;
  directCost: number;
  directTokens: CostTokenBreakdown;
  directModel: string;
  subagents: Array<{
    sessionId: string;
    model: string;
    cost: number;
    tokens: CostTokenBreakdown;
  }>;
  ratesApplied: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS (new types are not referenced yet)

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add CostRecord, CostSummary, SessionCostDetail types"
```

---

### Task 2: Add getModelFamily to pricing.ts and extend DB schema

**Files:**
- Modify: `server/scanner/pricing.ts`
- Modify: `server/db.ts`
- Modify: `tests/pricing.test.ts`

- [ ] **Step 1: Add getModelFamily export to pricing.ts**

In `server/scanner/pricing.ts`, add after the `getPricing` function:

```typescript
/** Extract model family key from a model string.
 *  "claude-opus-4-6" → "opus-4-6", "claude-sonnet-4-20250514" → "sonnet" */
export function getModelFamily(model: string): string {
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.includes(key)) return key;
  }
  return "sonnet";
}
```

- [ ] **Step 2: Add tests for getModelFamily**

In `tests/pricing.test.ts`, add a new describe block:

```typescript
describe("getModelFamily", () => {
  it("extracts opus-4-6 from full model string", () => {
    expect(getModelFamily("claude-opus-4-6")).toBe("opus-4-6");
  });

  it("extracts opus-4-5 from full model string", () => {
    expect(getModelFamily("claude-opus-4-5-20251001")).toBe("opus-4-5");
  });

  it("extracts opus for old opus models", () => {
    expect(getModelFamily("claude-opus-4-20250514")).toBe("opus");
  });

  it("extracts sonnet for sonnet models", () => {
    expect(getModelFamily("claude-sonnet-4-6")).toBe("sonnet");
  });

  it("extracts haiku-4-5 for haiku 4.5", () => {
    expect(getModelFamily("claude-haiku-4-5-20251001")).toBe("haiku-4-5");
  });

  it("defaults to sonnet for unknown", () => {
    expect(getModelFamily("unknown-model")).toBe("sonnet");
  });
});
```

Update the import at the top of the test file:
```typescript
import { getPricing, computeCost, getMaxTokens, getModelFamily } from "../server/scanner/pricing";
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/pricing.test.ts`
Expected: All PASS

- [ ] **Step 4: Add costRecords and costIndexState to DBData**

In `server/db.ts`, add to the imports:

```typescript
import type { ..., CostRecord, CostIndexState } from "@shared/types";
```

Add two fields to the `DBData` interface:

```typescript
costRecords: Record<string, CostRecord>;
costIndexState: CostIndexState;
```

Add defaults in the `defaultData()` function:

```typescript
costRecords: {},
costIndexState: { files: {}, totalRecords: 0, lastIndexAt: "", version: 1 },
```

Add initialization guards in the try/catch block (around line 100):

```typescript
if (!data.costRecords) data.costRecords = {};
if (!data.costIndexState) data.costIndexState = { files: {}, totalRecords: 0, lastIndexAt: "", version: 1 };
```

- [ ] **Step 5: Run type check and tests**

Run: `npm run check && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/scanner/pricing.ts server/db.ts tests/pricing.test.ts
git commit -m "feat: add getModelFamily, extend DB schema for cost records"
```

---

### Task 3: Build cost-indexer.ts — JSONL parser and record storage

**Files:**
- Create: `server/scanner/cost-indexer.ts`
- Create: `tests/cost-indexer.test.ts`

This is the core module. It incrementally parses JSONL files, creates CostRecords, and stores them.

- [ ] **Step 1: Write tests for cost indexer**

Create `tests/cost-indexer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parseJSONLForCosts, createCostRecordId, extractParentSessionId } from "../server/scanner/cost-indexer";

describe("cost-indexer", () => {
  describe("createCostRecordId", () => {
    it("creates deterministic ID from session + timestamp + model", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      expect(id1).toBe(id2);
    });

    it("creates different IDs for different inputs", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:01Z", "claude-opus-4-6");
      expect(id1).not.toBe(id2);
    });
  });

  describe("extractParentSessionId", () => {
    it("extracts parent session ID from subagent path", () => {
      const fp = "/home/user/.claude/projects/proj-key/abc-123-def/subagents/agent-xyz.jsonl";
      expect(extractParentSessionId(fp)).toBe("abc-123-def");
    });

    it("returns null for non-subagent paths", () => {
      const fp = "/home/user/.claude/projects/proj-key/abc-123-def.jsonl";
      expect(extractParentSessionId(fp)).toBeNull();
    });

    it("returns null for top-level subagents dir", () => {
      // subagents directly in project dir (no parent session)
      const fp = "/home/user/.claude/projects/proj-key/subagents/agent-xyz.jsonl";
      expect(extractParentSessionId(fp)).toBeNull();
    });
  });

  describe("parseJSONLForCosts", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-indexer-test-"));
    });

    it("extracts cost records from assistant messages with usage", () => {
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:00Z",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 10,
              output_tokens: 50,
              cache_read_input_tokens: 5000,
              cache_creation_input_tokens: 200,
            },
          },
        }),
        JSON.stringify({
          type: "user",
          timestamp: "2026-04-05T12:00:01Z",
          message: { content: "hello" },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:02Z",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 5,
              output_tokens: 100,
              cache_read_input_tokens: 5200,
              cache_creation_input_tokens: 0,
            },
          },
        }),
      ].join("\n");

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "test-session", null, "test-project", 0);
      expect(records).toHaveLength(2);

      expect(records[0].model).toBe("claude-opus-4-6");
      expect(records[0].modelFamily).toBe("opus-4-6");
      expect(records[0].inputTokens).toBe(10);
      expect(records[0].outputTokens).toBe(50);
      expect(records[0].cacheReadTokens).toBe(5000);
      expect(records[0].cacheCreationTokens).toBe(200);
      expect(records[0].cost).toBeGreaterThan(0);
      expect(records[0].parentSessionId).toBeNull();
      expect(records[0].pricingSnapshot.input).toBe(5); // Opus 4.6 rate

      expect(records[1].timestamp).toBe("2026-04-05T12:00:02Z");
    });

    it("skips user messages and assistant messages without usage", () => {
      const jsonl = [
        JSON.stringify({ type: "user", message: { content: "hi" } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }),
      ].join("\n");

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(0);
    });

    it("reads from byte offset for incremental parsing", () => {
      const line1 = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      const line2 = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:02Z",
        message: { model: "claude-sonnet-4-6", usage: { input_tokens: 20, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, line1 + "\n" + line2 + "\n");

      const offset = Buffer.byteLength(line1 + "\n");
      const records = parseJSONLForCosts(filePath, "sess", null, "proj", offset);
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe("claude-sonnet-4-6");
    });

    it("handles malformed JSON lines gracefully", () => {
      const jsonl = "not json\n" + JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cost-indexer.test.ts`
Expected: FAIL — module doesn't exist yet

- [ ] **Step 3: Implement cost-indexer.ts**

Create `server/scanner/cost-indexer.ts`:

```typescript
import fs from "fs";
import crypto from "crypto";
import { getDB, save } from "../db";
import { getPricing, computeCost, getModelFamily } from "./pricing";
import { getCachedSessions } from "./session-scanner";
import { encodeProjectKey, decodeProjectKey } from "./utils";
import type { CostRecord, CostIndexState, CostSummary, SessionCostDetail, CostTokenBreakdown } from "@shared/types";

/** Create a deterministic record ID for dedup */
export function createCostRecordId(sessionId: string, timestamp: string, model: string): string {
  return crypto.createHash("md5").update(`${sessionId}:${timestamp}:${model}`).digest("hex").slice(0, 16);
}

/** Extract parent session ID from a subagent file path.
 *  Path pattern: .../projects/{projectKey}/{parentSessionId}/subagents/agent-{id}.jsonl
 *  Returns null if not a subagent or if subagents dir is directly under project. */
export function extractParentSessionId(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/([^/]+)\/subagents\/agent-[^/]+\.jsonl$/);
  if (!match) return null;
  const candidate = match[1];
  // If the candidate looks like a UUID session ID (contains hyphens, not a project key)
  if (candidate.includes("-") && candidate.length > 20) return candidate;
  return null;
}

/** Parse a JSONL file from a byte offset and return CostRecords.
 *  This is the low-level parser — no DB interaction. */
export function parseJSONLForCosts(
  filePath: string,
  sessionId: string,
  parentSessionId: string | null,
  projectKey: string,
  fromOffset: number,
): CostRecord[] {
  const records: CostRecord[] = [];
  const now = new Date().toISOString();

  let content: string;
  try {
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const buf = Buffer.alloc(stat.size - fromOffset);
    fs.readSync(fd, buf, 0, buf.length, fromOffset);
    fs.closeSync(fd);
    content = buf.toString("utf-8");
  } catch {
    return records;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record.type !== "assistant") continue;
      const msg = record.message;
      if (!msg || !msg.usage) continue;

      const u = msg.usage;
      const model = msg.model || "unknown";
      const pricing = getPricing(model);
      const family = getModelFamily(model);

      const inputTokens = u.input_tokens || 0;
      const outputTokens = u.output_tokens || 0;
      const cacheReadTokens = u.cache_read_input_tokens || 0;
      const cacheCreationTokens = u.cache_creation_input_tokens || 0;
      const cost = computeCost(pricing, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
      const timestamp = record.timestamp || "";

      records.push({
        id: createCostRecordId(sessionId, timestamp, model),
        sessionId,
        parentSessionId,
        projectKey,
        model,
        modelFamily: family,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        cost,
        pricingSnapshot: {
          input: pricing.input,
          output: pricing.output,
          cacheRead: pricing.cacheRead,
          cacheCreation: pricing.cacheCreation,
        },
        timestamp,
        indexedAt: now,
      });
    } catch {
      // Malformed line — skip
    }
  }

  return records;
}

/** Run incremental cost indexing across all known session files.
 *  Called after the main session scan cycle. */
export function indexCosts(): void {
  const db = getDB();
  const state = db.costIndexState;
  const sessions = getCachedSessions();
  let newRecords = 0;

  // Build a set of all JSONL files from sessions + their subagent dirs
  const filesToIndex: Array<{
    filePath: string;
    sessionId: string;
    parentSessionId: string | null;
    projectKey: string;
  }> = [];

  for (const session of sessions) {
    // Main session file
    filesToIndex.push({
      filePath: session.filePath,
      sessionId: session.id,
      parentSessionId: null,
      projectKey: session.projectKey,
    });

    // Check for subagents directory
    const sessionDir = session.filePath.replace(/\/[^/]+\.jsonl$/, "");
    const subagentsDir = sessionDir + "/subagents";
    try {
      if (fs.existsSync(subagentsDir)) {
        const files = fs.readdirSync(subagentsDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith(".jsonl")) {
            const subPath = subagentsDir + "/" + f.name;
            const agentId = f.name.replace(/\.jsonl$/, "").replace(/^agent-/, "");
            filesToIndex.push({
              filePath: subPath,
              sessionId: agentId,
              parentSessionId: session.id,
              projectKey: session.projectKey,
            });
          }
        }
      }
    } catch {
      // subagents dir not readable — skip
    }
  }

  for (const file of filesToIndex) {
    try {
      const stat = fs.statSync(file.filePath);
      const fileState = state.files[file.filePath];

      // Skip if file hasn't changed
      if (fileState && fileState.fileSize === stat.size && fileState.lastOffset >= stat.size) {
        continue;
      }

      // If file shrank (truncation/rewrite), re-index from scratch
      let offset = 0;
      if (fileState && stat.size >= fileState.fileSize) {
        offset = fileState.lastOffset;
      } else if (fileState) {
        // File shrank — delete old records for this session and re-index
        for (const id of Object.keys(db.costRecords)) {
          if (db.costRecords[id].sessionId === file.sessionId) {
            delete db.costRecords[id];
          }
        }
      }

      const records = parseJSONLForCosts(
        file.filePath,
        file.sessionId,
        file.parentSessionId,
        file.projectKey,
        offset,
      );

      for (const record of records) {
        if (!db.costRecords[record.id]) {
          db.costRecords[record.id] = record;
          newRecords++;
        }
      }

      state.files[file.filePath] = {
        filePath: file.filePath,
        lastOffset: stat.size,
        lastTimestamp: records.length > 0 ? records[records.length - 1].timestamp : (fileState?.lastTimestamp || ""),
        recordCount: (fileState?.recordCount || 0) + records.length,
        fileSize: stat.size,
      };
    } catch {
      // File unreadable — skip
    }
  }

  state.totalRecords = Object.keys(db.costRecords).length;
  state.lastIndexAt = new Date().toISOString();

  if (newRecords > 0) {
    save();
    console.log(`[cost-indexer] Indexed ${newRecords} new cost records (${state.totalRecords} total)`);
  }
}

/** Query cost records with filters */
export function queryCosts(filter: {
  days?: number;
  projectKey?: string;
  sessionId?: string;
  modelFamily?: string;
}): CostRecord[] {
  const db = getDB();
  let records = Object.values(db.costRecords);

  if (filter.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filter.days);
    const cutoffStr = cutoff.toISOString();
    records = records.filter(r => r.timestamp >= cutoffStr);
  }

  if (filter.projectKey) {
    records = records.filter(r => r.projectKey === filter.projectKey);
  }

  if (filter.sessionId) {
    records = records.filter(r => r.sessionId === filter.sessionId || r.parentSessionId === filter.sessionId);
  }

  if (filter.modelFamily) {
    records = records.filter(r => r.modelFamily === filter.modelFamily);
  }

  return records;
}

function sumTokens(records: CostRecord[]): CostTokenBreakdown {
  let input = 0, output = 0, cacheRead = 0, cacheCreation = 0;
  for (const r of records) {
    input += r.inputTokens;
    output += r.outputTokens;
    cacheRead += r.cacheReadTokens;
    cacheCreation += r.cacheCreationTokens;
  }
  return { input, output, cacheRead, cacheCreation };
}

/** Build a CostSummary for the costs page */
export function getCostSummary(days: number): CostSummary {
  const records = queryCosts({ days });
  const sessions = getCachedSessions();
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  const totalTokens = sumTokens(records);

  // Weekly comparison — always from full data
  const now = new Date();
  const sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const fourteenAgo = new Date(now); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const sevenStr = sevenAgo.toISOString().slice(0, 10);
  const fourteenStr = fourteenAgo.toISOString().slice(0, 10);

  const allRecords = Object.values(getDB().costRecords);
  let thisWeekCost = 0, lastWeekCost = 0;
  for (const r of allRecords) {
    const d = r.timestamp.slice(0, 10);
    if (d >= sevenStr && d < tomorrowStr) thisWeekCost += r.cost;
    if (d >= fourteenStr && d < sevenStr) lastWeekCost += r.cost;
  }
  const changePct = lastWeekCost > 0 ? Math.round((thisWeekCost / lastWeekCost - 1) * 100) : 0;

  // Monthly total (always 30d)
  const thirtyAgo = new Date(now); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toISOString();
  const monthlyTotalCost = allRecords.filter(r => r.timestamp >= thirtyStr).reduce((s, r) => s + r.cost, 0);

  // By model (exact versions)
  const byModel: CostSummary["byModel"] = {};
  const modelSessions: Record<string, Set<string>> = {};
  for (const r of records) {
    const key = r.model;
    if (!byModel[key]) {
      byModel[key] = { cost: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, sessions: 0 };
      modelSessions[key] = new Set();
    }
    byModel[key].cost += r.cost;
    byModel[key].tokens.input += r.inputTokens;
    byModel[key].tokens.output += r.outputTokens;
    byModel[key].tokens.cacheRead += r.cacheReadTokens;
    byModel[key].tokens.cacheCreation += r.cacheCreationTokens;
    modelSessions[key].add(r.sessionId);
  }
  for (const key of Object.keys(byModel)) {
    byModel[key].sessions = modelSessions[key].size;
    byModel[key].cost = Math.round(byModel[key].cost * 1000) / 1000;
  }

  // By project
  const projCost: Record<string, { cost: number; sessions: Set<string> }> = {};
  for (const r of records) {
    if (!projCost[r.projectKey]) projCost[r.projectKey] = { cost: 0, sessions: new Set() };
    projCost[r.projectKey].cost += r.cost;
    projCost[r.projectKey].sessions.add(r.sessionId);
  }
  const byProject = Object.entries(projCost)
    .map(([key, data]) => ({
      projectKey: key,
      projectName: decodeProjectKey(key).split("/").pop() || key,
      cost: Math.round(data.cost * 1000) / 1000,
      sessions: data.sessions.size,
    }))
    .sort((a, b) => b.cost - a.cost);

  // By day
  const dayCost: Record<string, { cost: number; compute: number; cache: number }> = {};
  for (const r of records) {
    const d = r.timestamp.slice(0, 10);
    if (!dayCost[d]) dayCost[d] = { cost: 0, compute: 0, cache: 0 };
    const computePart = (r.inputTokens * r.pricingSnapshot.input + r.outputTokens * r.pricingSnapshot.output) / 1_000_000;
    const cachePart = (r.cacheReadTokens * r.pricingSnapshot.cacheRead + r.cacheCreationTokens * r.pricingSnapshot.cacheCreation) / 1_000_000;
    dayCost[d].cost += r.cost;
    dayCost[d].compute += computePart;
    dayCost[d].cache += cachePart;
  }
  const byDay = Object.entries(dayCost)
    .map(([date, data]) => ({
      date,
      cost: Math.round(data.cost * 1000) / 1000,
      computeCost: Math.round(data.compute * 1000) / 1000,
      cacheCost: Math.round(data.cache * 1000) / 1000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top sessions — group by parent session (or self if no parent)
  const sessionCosts: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    model: string;
    subagentCount: number;
    subagentCost: number;
  }> = {};
  for (const r of records) {
    const rootId = r.parentSessionId || r.sessionId;
    if (!sessionCosts[rootId]) {
      sessionCosts[rootId] = {
        cost: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        model: "",
        subagentCount: 0,
        subagentCost: 0,
      };
    }
    const sc = sessionCosts[rootId];
    sc.cost += r.cost;
    sc.tokens.input += r.inputTokens;
    sc.tokens.output += r.outputTokens;
    sc.tokens.cacheRead += r.cacheReadTokens;
    sc.tokens.cacheCreation += r.cacheCreationTokens;
    if (r.parentSessionId) {
      sc.subagentCost += r.cost;
      // Count unique subagent sessions
    } else {
      if (!sc.model) sc.model = r.model;
    }
  }
  // Count unique subagents per root session
  const subagentSessions: Record<string, Set<string>> = {};
  for (const r of records) {
    if (r.parentSessionId) {
      const rootId = r.parentSessionId;
      if (!subagentSessions[rootId]) subagentSessions[rootId] = new Set();
      subagentSessions[rootId].add(r.sessionId);
    }
  }
  const topSessions = Object.entries(sessionCosts)
    .map(([sessionId, data]) => {
      const sess = sessionMap.get(sessionId);
      return {
        sessionId,
        firstMessage: (sess?.firstMessage || "").slice(0, 100),
        model: data.model || "unknown",
        cost: Math.round(data.cost * 1000) / 1000,
        subagentCount: subagentSessions[sessionId]?.size || 0,
        subagentCost: Math.round(data.subagentCost * 1000) / 1000,
        tokens: data.tokens,
      };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  return {
    totalCost: Math.round(totalCost * 1000) / 1000,
    totalTokens,
    weeklyComparison: {
      thisWeek: Math.round(thisWeekCost * 100) / 100,
      lastWeek: Math.round(lastWeekCost * 100) / 100,
      changePct,
    },
    monthlyTotalCost: Math.round(monthlyTotalCost * 1000) / 1000,
    byModel,
    byProject,
    byDay,
    topSessions,
    planLimits: {
      pro: { limit: 0, label: "Pro (usage-based)" },
      max5x: { limit: 100, label: "Max $100/mo" },
      max20x: { limit: 200, label: "Max $200/mo" },
    },
  };
}

/** Get detailed cost breakdown for a single session (including subagents) */
export function getSessionCostDetail(sessionId: string): SessionCostDetail | null {
  const records = queryCosts({ sessionId });
  if (records.length === 0) return null;

  const sessions = getCachedSessions();
  const sess = sessions.find(s => s.id === sessionId);

  const directRecords = records.filter(r => r.parentSessionId === null || r.sessionId === sessionId);
  const subagentRecords = records.filter(r => r.parentSessionId === sessionId);

  const directTokens = sumTokens(directRecords);
  const directCost = directRecords.reduce((s, r) => s + r.cost, 0);
  const directModel = directRecords.find(r => r.model)?.model || "unknown";
  const pricing = getPricing(directModel);

  // Group subagent records by subagent session
  const subagentMap: Record<string, CostRecord[]> = {};
  for (const r of subagentRecords) {
    if (!subagentMap[r.sessionId]) subagentMap[r.sessionId] = [];
    subagentMap[r.sessionId].push(r);
  }

  const subagents = Object.entries(subagentMap).map(([sid, recs]) => ({
    sessionId: sid,
    model: recs[0]?.model || "unknown",
    cost: Math.round(recs.reduce((s, r) => s + r.cost, 0) * 1000) / 1000,
    tokens: sumTokens(recs),
  }));

  return {
    sessionId,
    firstMessage: (sess?.firstMessage || "").slice(0, 200),
    totalCost: Math.round(records.reduce((s, r) => s + r.cost, 0) * 1000) / 1000,
    directCost: Math.round(directCost * 1000) / 1000,
    directTokens,
    directModel,
    subagents,
    ratesApplied: {
      model: directModel,
      input: pricing.input,
      output: pricing.output,
      cacheRead: pricing.cacheRead,
      cacheCreation: pricing.cacheCreation,
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/cost-indexer.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add server/scanner/cost-indexer.ts tests/cost-indexer.test.ts
git commit -m "feat: cost-indexer with incremental JSONL parsing, record storage, query API"
```

---

### Task 4: Wire cost indexer into scan cycle

**Files:**
- Modify: `server/scanner/index.ts:66-70`

- [ ] **Step 1: Add import and call indexCosts after session scan**

In `server/scanner/index.ts`, add import:

```typescript
import { indexCosts } from "./cost-indexer";
```

After `scanAgentExecutions()` (around line 70), add:

```typescript
// Cost indexing — incremental parse of session JSONL files
indexCosts();
```

- [ ] **Step 2: Run full suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add server/scanner/index.ts
git commit -m "feat: wire cost indexer into scan cycle"
```

---

### Task 5: Rewrite cost-analytics route to use cost-indexer

**Files:**
- Rewrite: `server/routes/cost-analytics.ts`

Replace the JSONL-parsing route with a thin query layer over cost-indexer.

- [ ] **Step 1: Rewrite cost-analytics.ts**

Replace the entire file content:

```typescript
import { Router } from "express";
import { getCostSummary, getSessionCostDetail } from "../scanner/cost-indexer";

const router = Router();

/** GET /api/analytics/costs?days=30 — Cost summary from indexed records */
router.get("/api/analytics/costs", (_req, res) => {
  try {
    const rawDays = parseInt(_req.query.days as string, 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const summary = getCostSummary(days);
    res.json(summary);
  } catch (err) {
    console.error("[cost-analytics] Failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to build cost analytics", error: (err as Error).message });
  }
});

/** GET /api/analytics/costs/session/:id — Detailed cost breakdown for one session */
router.get("/api/analytics/costs/session/:id", (req, res) => {
  try {
    const detail = getSessionCostDetail(req.params.id);
    if (!detail) return res.status(404).json({ message: "Session not found or has no cost data" });
    res.json(detail);
  } catch (err) {
    console.error("[cost-analytics] Session detail failed:", (err as Error).message);
    res.status(500).json({ message: "Failed to get session cost detail", error: (err as Error).message });
  }
});

export default router;
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: All PASS (existing route tests may need adjustment — the response shape changed. If `tests/cost-analytics-route.test.ts` exists and fails, update it to match the new `CostSummary` shape: replace `dailyCosts` assertions with `byDay`, etc.)

- [ ] **Step 4: Commit**

```bash
git add server/routes/cost-analytics.ts
git commit -m "refactor: cost-analytics route queries cost-indexer instead of parsing JSONL"
```

---

### Task 6: Update costs page for exact models and cache split

**Files:**
- Modify: `client/src/pages/stats.tsx`

Update the CostsTab to use the new CostSummary shape: exact model versions in the breakdown, compute/cache cost split in the daily chart, and subagent indicators in top sessions.

- [ ] **Step 1: Update CostAnalytics type to match CostSummary**

Replace the existing `CostAnalytics` interface and related types in stats.tsx with:

```typescript
interface CostTokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

interface CostAnalytics {
  totalCost: number;
  totalTokens: CostTokenBreakdown;
  weeklyComparison: { thisWeek: number; lastWeek: number; changePct: number };
  monthlyTotalCost: number;
  byModel: Record<string, {
    cost: number;
    tokens: CostTokenBreakdown;
    sessions: number;
  }>;
  byProject: Array<{
    projectKey: string;
    projectName: string;
    cost: number;
    sessions: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
    computeCost: number;
    cacheCost: number;
  }>;
  topSessions: Array<{
    sessionId: string;
    firstMessage: string;
    model: string;
    cost: number;
    subagentCount: number;
    subagentCost: number;
    tokens: CostTokenBreakdown;
  }>;
  planLimits: {
    pro: { limit: number; label: string };
    max5x: { limit: number; label: string };
    max20x: { limit: number; label: string };
  };
}
```

Remove the old `DailyCost`, `ModelBreakdown`, `ProjectBreakdown`, `ErrorEntry` interfaces that are no longer needed by CostsTab.

- [ ] **Step 2: Update summary cards**

Replace the cache savings calculation with a compute/cache split using the `totalTokens` field:

```typescript
const computeCost = (data.totalTokens.input + data.totalTokens.output); // token count for display
const cacheCost = (data.totalTokens.cacheRead + data.totalTokens.cacheCreation); // token count for display
```

Update summary cards to show:
```typescript
{ icon: DollarSign, color: "text-green-400", label: `Cost (${period}d)`, value: formatCost(data.totalCost) },
{ icon: TrendingUp, color: "text-blue-400", label: "Compute Tokens", value: formatTokens(data.totalTokens.input + data.totalTokens.output) },
{ icon: Zap, color: "text-amber-400", label: "Cache Tokens", value: formatTokens(data.totalTokens.cacheRead + data.totalTokens.cacheCreation) },
{ icon: Shield, color: "text-purple-400", label: "Sessions", value: Object.values(data.byModel).reduce((s, m) => s + m.sessions, 0).toString() },
```

- [ ] **Step 3: Update daily chart to show compute/cache split**

Replace the single bar with stacked bars. Each day has `computeCost` and `cacheCost`:

```tsx
{data.byDay.map((day) => {
  const totalHeight = maxDayCost > 0 ? (day.cost / maxDayCost) * 100 : 0;
  const cacheHeight = maxDayCost > 0 ? (day.cacheCost / maxDayCost) * 100 : 0;
  const computeHeight = totalHeight - cacheHeight;
  const today = isToday(day.date);
  return (
    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
      <span className={`text-[9px] font-mono tabular-nums transition-opacity ${day.cost > 0 ? "opacity-0 group-hover:opacity-100" : "opacity-0"} ${today ? "text-green-400 font-semibold" : "text-muted-foreground"}`}>
        ${day.cost.toFixed(2)}
      </span>
      <div className="w-full flex-1 flex items-end">
        <div className="w-full flex flex-col items-stretch">
          <div
            className={`w-full rounded-t-sm ${today ? "bg-blue-400" : "bg-blue-400/50 group-hover:bg-blue-400/70"}`}
            style={{ height: `${Math.max(computeHeight, 0)}%` }}
            title={`Compute: $${day.computeCost.toFixed(2)}`}
          />
          <div
            className={`w-full ${today ? "bg-green-500" : "bg-green-500/50 group-hover:bg-green-500/70"}`}
            style={{ height: `${Math.max(cacheHeight, day.cost > 0 ? 2 : 0)}%` }}
            title={`Cache: $${day.cacheCost.toFixed(2)}`}
          />
        </div>
      </div>
      <span className={`text-[8px] whitespace-nowrap ${today ? "text-green-400 font-semibold" : "text-muted-foreground/60"}`}>
        {formatDayLabel(day.date)}
      </span>
    </div>
  );
})}
```

Add a legend below the chart:
```tsx
<div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-400" />Compute (input + output)</span>
  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500" />Cache (read + write)</span>
</div>
```

- [ ] **Step 4: Update model breakdown to show exact versions**

The `byModel` keys are now full model strings like `claude-opus-4-6`. Update the model breakdown table to show these directly. Update columns to show the token breakdown:

```tsx
<div className="flex items-center text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2 py-1.5">
  <span className="flex-1">Model</span>
  <span className="w-16 text-right">In</span>
  <span className="w-16 text-right">Out</span>
  <span className="w-20 text-right">Cache Rd</span>
  <span className="w-20 text-right">Cache Wr</span>
  <span className="w-16 text-right">Cost</span>
</div>
{modelEntries.map(([model, md]) => (
  <div key={model} className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors">
    <span className="flex-1 flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${getModelColor(model)}`} />
      <span className="text-muted-foreground text-xs font-mono">{model}</span>
    </span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.input)}</span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.output)}</span>
    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.cacheRead)}</span>
    <span className="w-20 text-right font-mono tabular-nums text-xs text-muted-foreground">{formatTokens(md.tokens.cacheCreation)}</span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(md.cost)}</span>
  </div>
))}
```

- [ ] **Step 5: Update project breakdown**

Project entries now have `projectName` instead of `project`. Update:

```tsx
{data.byProject.map((project) => (
  <div key={project.projectKey} ...>
    <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
      {project.projectName}
    </span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(project.cost)}</span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-muted-foreground">{project.sessions}</span>
  </div>
))}
```

- [ ] **Step 6: Update top sessions to show subagent info**

Add subagent count and cost to each session row:

```tsx
{data.topSessions.map((session) => (
  <div key={session.sessionId} className="flex items-center w-full text-sm px-2 py-2 rounded-md hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setLocation(`/sessions/${session.sessionId}`)}>
    <span className="flex-1 truncate text-muted-foreground hover:text-foreground transition-colors">
      {session.firstMessage || session.sessionId.slice(0, 8)}
      {session.subagentCount > 0 && (
        <span className="ml-2 text-[10px] text-purple-400">
          {session.subagentCount} agent{session.subagentCount > 1 ? "s" : ""} (+{formatCost(session.subagentCost)})
        </span>
      )}
    </span>
    <span className="w-24 text-right">
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
        session.model.includes("opus") ? "text-orange-400 border-orange-400/30" :
        session.model.includes("haiku") ? "text-green-400 border-green-400/30" :
        "text-blue-400 border-blue-400/30"
      }`}>{session.model.replace("claude-", "")}</Badge>
    </span>
    <span className="w-16 text-right font-mono tabular-nums text-xs text-amber-400/80">{formatCost(session.cost)}</span>
  </div>
))}
```

- [ ] **Step 7: Update plan comparison to use monthlyTotalCost**

```typescript
const currentSpend = data.monthlyTotalCost;
```

- [ ] **Step 8: Remove error breakdown section**

The error breakdown was part of the old cost-analytics response and is not part of CostSummary. Remove the `{data.errors.length > 0 && (...)}` block. Error tracking belongs in session health, not cost analytics.

- [ ] **Step 9: Run type check and dev server**

Run: `npm run check`
Expected: PASS

Run: `npm run dev` (manual visual check)
Expected: Costs tab shows exact model versions, compute/cache split chart, subagent counts

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/stats.tsx
git commit -m "feat: costs page shows exact models, compute/cache split, subagent awareness"
```

---

### Task 7: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run safety tests**

Run: `npx vitest run tests/new-user-safety.test.ts`
Expected: PASS

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: No errors

- [ ] **Step 4: Build production bundle**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Update tests/cost-analytics-route.test.ts if it exists**

If the route test file from the earlier work exists, update it to match the new response shape. The key changes:
- `dailyCosts` → `byDay` (with `computeCost` and `cacheCost`)
- `byModel` values now have `tokens: CostTokenBreakdown` instead of flat `inputTokens`/`outputTokens`
- `byProject` entries have `projectKey` + `projectName` instead of `project`
- New fields: `totalTokens`, `monthlyTotalCost`
- Removed: `errors`, `totalInputTokens`, `totalOutputTokens`, `totalCacheReadTokens`, `totalCacheWriteTokens`

- [ ] **Step 6: Commit any remaining fixes**

Only if there are uncommitted changes from verification steps.
