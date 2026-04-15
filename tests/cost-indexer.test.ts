import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parseJSONLForCosts, createCostRecordId, extractParentSessionId } from "../server/scanner/cost-indexer";
import { reduceCostSummary, emptyBySource } from "../server/scanner/event-reductions";
import { ALL_INTERACTION_SOURCES } from "../shared/types";
import type { InteractionEvent, InteractionSource } from "../shared/types";

describe("cost-indexer", () => {
  describe("createCostRecordId", () => {
    it("creates deterministic ID from session + timestamp + model + lineIndex", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6", 1);
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6", 1);
      expect(id1).toBe(id2);
    });

    it("creates different IDs for different timestamps", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6", 1);
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:01Z", "claude-opus-4-6", 1);
      expect(id1).not.toBe(id2);
    });

    it("creates different IDs for same timestamp but different line index", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6", 1);
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6", 2);
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
      ].join("\n") + "\n";

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const { records } = parseJSONLForCosts(filePath, "test-session", null, "test-project", 0);
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
      ].join("\n") + "\n";

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const { records } = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
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
      const { records } = parseJSONLForCosts(filePath, "sess", null, "proj", offset);
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe("claude-sonnet-4-6");
    });

    it("handles malformed JSON lines gracefully", () => {
      const jsonl = "not json\n" + JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      }) + "\n";

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const { records } = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(1);
    });

    it("does not consume partial trailing lines (prevents data loss on active files)", () => {
      const completeLine = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      // Simulate a partial write — no trailing newline on the second line
      const partialLine = '{"type":"assistant","timestamp":"2026-04-05T12:00:02Z","message":{"model":"claude-opus-4-6"';

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, completeLine + "\n" + partialLine);

      const { records, bytesConsumed } = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(1); // Only the complete line
      expect(bytesConsumed).toBe(Buffer.byteLength(completeLine + "\n"));
    });

    it("produces unique IDs for same-second records with same model", () => {
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:00Z",
          message: { model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:00Z",
          message: { model: "claude-opus-4-6", usage: { input_tokens: 20, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
        }),
      ].join("\n") + "\n";

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const { records } = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
    });
  });

  // -------------------------------------------------------------------------
  // Cost summary bySource dimension — task005
  //
  // `reduceCostSummary` is the shared reducer both the store backend and the
  // legacy cost-indexer normalize their rollups through for bySource. These
  // tests exercise the reducer directly with a synthetic `InteractionEvent[]`
  // fixture so we can assert the new dimension without standing up the full
  // ingester / JSONL / SQLite pipeline. The parity test
  // (`scanner-backend-parity.test.ts`) still asserts the legacy cost-indexer
  // path produces the same shape end-to-end when both backends read the
  // same JSONL.
  // -------------------------------------------------------------------------

  describe("reduceCostSummary — bySource dimension", () => {
    // Today in the fixtures is deliberately inside the default `days` window
    // that reduceCostSummary uses internally (7/14/30-day lookbacks start
    // from `new Date()`). Using "today" keeps the fixtures in every window.
    const today = new Date();
    const isoAt = (hour: number): string => {
      const d = new Date(today);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const isoDaysAgo = (daysAgo: number, hour = 10): string => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    function aiEvent(
      id: string,
      source: InteractionSource,
      usd: number,
      ts: string,
      sessionId = `sess-${id}`,
    ): InteractionEvent {
      return {
        id,
        conversationId: sessionId,
        timestamp: ts,
        source,
        role: "assistant",
        content: { type: "text", text: `text-${id}` },
        cost: {
          usd,
          tokensIn: 100,
          tokensOut: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
          model: "claude-opus-4-6",
        },
      };
    }

    function deterministicEvent(
      id: string,
      source: InteractionSource,
      ts: string,
    ): InteractionEvent {
      return {
        id,
        conversationId: `sess-${id}`,
        timestamp: ts,
        source,
        role: "system",
        content: { type: "system", subtype: "info", text: `det-${id}` },
        cost: null,
      };
    }

    it("emptyBySource returns every InteractionSource key with value 0", () => {
      const empty = emptyBySource();
      for (const key of ALL_INTERACTION_SOURCES) {
        expect(empty[key]).toBe(0);
      }
      expect(Object.keys(empty).sort()).toEqual([...ALL_INTERACTION_SOURCES].sort());
    });

    it("totalCost sums every cost-bearing event regardless of source", () => {
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 0.5, isoAt(1)),
        aiEvent("e2", "chat-ai", 1.25, isoAt(2)),
        aiEvent("e3", "chat-workflow", 0.75, isoAt(3)),
      ];
      const summary = reduceCostSummary(events, events);
      expect(summary.totalCost).toBeCloseTo(2.5, 3);
    });

    it("bySource groups costs by event source and is fully keyed", () => {
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 1.0, isoAt(1)),
        aiEvent("e2", "scanner-jsonl", 0.5, isoAt(2)),
        aiEvent("e3", "chat-ai", 2.0, isoAt(3)),
        aiEvent("e4", "github-issue", 0.25, isoAt(4)),
      ];
      const summary = reduceCostSummary(events, events);

      // Every InteractionSource key must be present — clients can assume shape
      for (const key of ALL_INTERACTION_SOURCES) {
        expect(summary.bySource[key]).toBeDefined();
      }
      expect(summary.bySource["scanner-jsonl"]).toBeCloseTo(1.5, 3);
      expect(summary.bySource["chat-ai"]).toBeCloseTo(2.0, 3);
      expect(summary.bySource["github-issue"]).toBeCloseTo(0.25, 3);
      // Sources with no events stay at 0
      expect(summary.bySource["chat-slash"]).toBe(0);
      expect(summary.bySource["chat-hook"]).toBe(0);
      expect(summary.bySource["telegram"]).toBe(0);
      expect(summary.bySource["discord"]).toBe(0);
      expect(summary.bySource["imessage"]).toBe(0);

      // Sum of the per-source breakdown must equal totalCost
      const bySourceSum = Object.values(summary.bySource).reduce((s, v) => s + v, 0);
      expect(bySourceSum).toBeCloseTo(summary.totalCost, 3);
    });

    it("byDay splits per-day entries and each entry carries its own bySource", () => {
      // Two days — the reducer's window reads "today" as ISO UTC day, so
      // pick explicit days-ago offsets that land in two distinct UTC dates.
      const day0 = isoDaysAgo(0, 10);
      const day1 = isoDaysAgo(1, 10);
      const day0Key = day0.slice(0, 10);
      const day1Key = day1.slice(0, 10);
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 1.0, day1),
        aiEvent("e2", "chat-ai", 0.5, day1),
        aiEvent("e3", "scanner-jsonl", 2.0, day0),
      ];
      const summary = reduceCostSummary(events, events);

      const byDate = Object.fromEntries(summary.byDay.map((d) => [d.date, d]));
      expect(Object.keys(byDate)).toHaveLength(2);

      const d0 = byDate[day0Key];
      const d1 = byDate[day1Key];
      expect(d0.cost).toBeCloseTo(2.0, 3);
      expect(d1.cost).toBeCloseTo(1.5, 3);

      // Each day entry must carry a fully-keyed bySource record
      for (const key of ALL_INTERACTION_SOURCES) {
        expect(d0.bySource[key]).toBeDefined();
        expect(d1.bySource[key]).toBeDefined();
      }
      expect(d0.bySource["scanner-jsonl"]).toBeCloseTo(2.0, 3);
      expect(d0.bySource["chat-ai"]).toBe(0);
      expect(d1.bySource["scanner-jsonl"]).toBeCloseTo(1.0, 3);
      expect(d1.bySource["chat-ai"]).toBeCloseTo(0.5, 3);
    });

    it("events with null cost (deterministic sources) contribute 0 to every sum", () => {
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 1.0, isoAt(1)),
        // Deterministic events — no usd cost, should contribute nothing
        deterministicEvent("d1", "chat-slash", isoAt(2)),
        deterministicEvent("d2", "chat-hook", isoAt(3)),
        deterministicEvent("d3", "chat-workflow", isoAt(4)),
      ];
      const summary = reduceCostSummary(events, events);
      expect(summary.totalCost).toBeCloseTo(1.0, 3);
      expect(summary.bySource["scanner-jsonl"]).toBeCloseTo(1.0, 3);
      // None of the deterministic sources should have accrued cost
      expect(summary.bySource["chat-slash"]).toBe(0);
      expect(summary.bySource["chat-hook"]).toBe(0);
      expect(summary.bySource["chat-workflow"]).toBe(0);
    });

    it("legacy-style single-source fixture yields a degenerate bySource (all scanner-jsonl)", () => {
      // Legacy `cost-indexer.getCostSummary` feeds records tagged (implicitly)
      // as scanner-jsonl. The same shape via the reducer must land the entire
      // total under `scanner-jsonl` with every other key at 0 — which is what
      // the legacy backend returns in the degenerate single-source case.
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 0.3, isoAt(1)),
        aiEvent("e2", "scanner-jsonl", 0.7, isoAt(2)),
        aiEvent("e3", "scanner-jsonl", 0.5, isoAt(3)),
      ];
      const summary = reduceCostSummary(events, events);

      expect(summary.totalCost).toBeCloseTo(1.5, 3);
      expect(summary.bySource["scanner-jsonl"]).toBeCloseTo(1.5, 3);
      for (const key of ALL_INTERACTION_SOURCES) {
        if (key === "scanner-jsonl") continue;
        expect(summary.bySource[key]).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cost summary countBySource dimension — task006
  //
  // Same reducer, new field. countBySource is the asymmetric counterpart of
  // bySource: it includes every event regardless of cost (so deterministic
  // null-cost events still increment counts), and it must be filled in the
  // SAME single iteration as costs — no second event walk.
  // -------------------------------------------------------------------------

  describe("reduceCostSummary — countBySource dimension", () => {
    const today = new Date();
    const isoAt = (hour: number): string => {
      const d = new Date(today);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const isoDaysAgo = (daysAgo: number, hour = 10): string => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    function aiEvent(
      id: string,
      source: InteractionSource,
      usd: number,
      ts: string,
    ): InteractionEvent {
      return {
        id,
        conversationId: `sess-${id}`,
        timestamp: ts,
        source,
        role: "assistant",
        content: { type: "text", text: `text-${id}` },
        cost: {
          usd,
          tokensIn: 100,
          tokensOut: 50,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          durationMs: 0,
          model: "claude-opus-4-6",
        },
      };
    }

    function deterministicEvent(
      id: string,
      source: InteractionSource,
      ts: string,
    ): InteractionEvent {
      return {
        id,
        conversationId: `sess-${id}`,
        timestamp: ts,
        source,
        role: "system",
        content: { type: "system", subtype: "info", text: `det-${id}` },
        cost: null,
      };
    }

    it("countBySource sums event counts per source and is fully keyed", () => {
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 1.0, isoAt(1)),
        aiEvent("e2", "scanner-jsonl", 0.5, isoAt(2)),
        aiEvent("e3", "chat-ai", 2.0, isoAt(3)),
        aiEvent("e4", "github-issue", 0.25, isoAt(4)),
      ];
      const summary = reduceCostSummary(events, events);

      // Every InteractionSource key must be present
      for (const key of ALL_INTERACTION_SOURCES) {
        expect(summary.countBySource[key]).toBeDefined();
      }
      expect(summary.countBySource["scanner-jsonl"]).toBe(2);
      expect(summary.countBySource["chat-ai"]).toBe(1);
      expect(summary.countBySource["github-issue"]).toBe(1);
      // Sources with no events stay at 0
      expect(summary.countBySource["chat-slash"]).toBe(0);
      expect(summary.countBySource["chat-hook"]).toBe(0);
      expect(summary.countBySource["chat-workflow"]).toBe(0);
    });

    it("countBySource INCLUDES null-cost deterministic events (asymmetry vs bySource)", () => {
      // The whole point of countBySource: deterministic events have no
      // cost, so bySource leaves them at 0, but the count reflects them.
      const events: InteractionEvent[] = [
        aiEvent("e1", "chat-ai", 1.0, isoAt(1)),
        deterministicEvent("d1", "chat-slash", isoAt(2)),
        deterministicEvent("d2", "chat-slash", isoAt(3)),
        deterministicEvent("d3", "chat-hook", isoAt(4)),
        deterministicEvent("d4", "chat-workflow", isoAt(5)),
      ];
      const summary = reduceCostSummary(events, events);

      // Costs: only the AI event contributes — deterministic stays at 0
      expect(summary.bySource["chat-ai"]).toBeCloseTo(1.0, 3);
      expect(summary.bySource["chat-slash"]).toBe(0);
      expect(summary.bySource["chat-hook"]).toBe(0);
      expect(summary.bySource["chat-workflow"]).toBe(0);

      // Counts: every event contributes regardless of cost
      expect(summary.countBySource["chat-ai"]).toBe(1);
      expect(summary.countBySource["chat-slash"]).toBe(2);
      expect(summary.countBySource["chat-hook"]).toBe(1);
      expect(summary.countBySource["chat-workflow"]).toBe(1);
    });

    it("byDay.countBySource splits per day with the same null-cost-included rule", () => {
      const day0 = isoDaysAgo(0, 10);
      const day1 = isoDaysAgo(1, 10);
      const day0Key = day0.slice(0, 10);
      const day1Key = day1.slice(0, 10);
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 1.0, day1),
        aiEvent("e2", "chat-ai", 0.5, day1),
        deterministicEvent("d1", "chat-slash", day1),
        aiEvent("e3", "scanner-jsonl", 2.0, day0),
        deterministicEvent("d2", "chat-hook", day0),
        deterministicEvent("d3", "chat-workflow", day0),
      ];
      const summary = reduceCostSummary(events, events);

      const byDate = Object.fromEntries(summary.byDay.map((d) => [d.date, d]));
      const d0 = byDate[day0Key];
      const d1 = byDate[day1Key];

      // Each day entry must carry a fully-keyed countBySource
      for (const key of ALL_INTERACTION_SOURCES) {
        expect(d0.countBySource[key]).toBeDefined();
        expect(d1.countBySource[key]).toBeDefined();
      }

      // Day 1: 1 scanner-jsonl + 1 chat-ai + 1 chat-slash
      expect(d1.countBySource["scanner-jsonl"]).toBe(1);
      expect(d1.countBySource["chat-ai"]).toBe(1);
      expect(d1.countBySource["chat-slash"]).toBe(1);
      expect(d1.countBySource["chat-hook"]).toBe(0);

      // Day 0: 1 scanner-jsonl + 1 chat-hook + 1 chat-workflow
      expect(d0.countBySource["scanner-jsonl"]).toBe(1);
      expect(d0.countBySource["chat-hook"]).toBe(1);
      expect(d0.countBySource["chat-workflow"]).toBe(1);
      expect(d0.countBySource["chat-ai"]).toBe(0);
    });

    it("legacy-style single-source fixture yields a degenerate countBySource (all scanner-jsonl)", () => {
      // Mirrors the bySource degenerate case — every event is scanner-jsonl,
      // every other key is 0.
      const events: InteractionEvent[] = [
        aiEvent("e1", "scanner-jsonl", 0.3, isoAt(1)),
        aiEvent("e2", "scanner-jsonl", 0.7, isoAt(2)),
        aiEvent("e3", "scanner-jsonl", 0.5, isoAt(3)),
      ];
      const summary = reduceCostSummary(events, events);

      expect(summary.countBySource["scanner-jsonl"]).toBe(3);
      for (const key of ALL_INTERACTION_SOURCES) {
        if (key === "scanner-jsonl") continue;
        expect(summary.countBySource[key]).toBe(0);
      }
    });
  });
});
