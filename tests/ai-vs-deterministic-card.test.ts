/**
 * Tests for the AI vs Deterministic dashboard card (scanner-ingester
 * task006).
 *
 * Strategy: per the project's `reference_vitest_client_excluded.md`
 * memory, vitest excludes `client/` so React Testing Library renders
 * placed in `client/src/` would never run. Instead we use:
 *
 *   1. Source-text guardrails — read the component file as a string,
 *      grep for forbidden patterns (gradients, scale animations, the
 *      stale endpoint name) and required patterns (the real endpoint).
 *   2. Pure-logic tests — the savings math is extracted into the
 *      exported `computeAiVsDeterministic(summary)` helper so the test
 *      can call it directly without rendering React.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  computeAiVsDeterministic,
  AI_SOURCES,
  DETERMINISTIC_SOURCES,
} from "../client/src/components/dashboard/ai-vs-deterministic-card";
import type { CostSummary } from "../shared/types";
import { ALL_INTERACTION_SOURCES, emptyBySource as _typeShim } from "../shared/types";

void _typeShim; // silence unused if the helper is not re-exported

const ROOT = path.resolve(__dirname, "..");
const CARD_PATH = path.join(
  ROOT,
  "client/src/components/dashboard/ai-vs-deterministic-card.tsx",
);

function emptyBySourceLocal(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ALL_INTERACTION_SOURCES) out[k] = 0;
  return out;
}

function makeSummary(opts: {
  aiCost?: number;
  scannerJsonlCount?: number;
  chatAiCount?: number;
  chatSlashCount?: number;
  chatHookCount?: number;
  chatWorkflowCount?: number;
}): CostSummary {
  const bySource = emptyBySourceLocal() as CostSummary["bySource"];
  const countBySource = emptyBySourceLocal() as CostSummary["countBySource"];
  // The card sums `bySource` across AI_SOURCES — split the requested aiCost
  // arbitrarily under chat-ai for simplicity.
  bySource["chat-ai"] = opts.aiCost ?? 0;
  countBySource["scanner-jsonl"] = opts.scannerJsonlCount ?? 0;
  countBySource["chat-ai"] = opts.chatAiCount ?? 0;
  countBySource["chat-slash"] = opts.chatSlashCount ?? 0;
  countBySource["chat-hook"] = opts.chatHookCount ?? 0;
  countBySource["chat-workflow"] = opts.chatWorkflowCount ?? 0;
  return {
    totalCost: bySource["chat-ai"],
    totalTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    bySource,
    countBySource,
    weeklyComparison: { thisWeek: 0, lastWeek: 0, changePct: 0 },
    monthlyTotalCost: 0,
    byModel: {},
    byProject: [],
    byDay: [],
    topSessions: [],
    planLimits: {
      pro: { limit: 0, label: "Pro" },
      max5x: { limit: 100, label: "Max $100/mo" },
      max20x: { limit: 200, label: "Max $200/mo" },
    },
  };
}

describe("AI vs Deterministic card — source-text guardrails", () => {
  let source: string;
  it("the component file exists at the expected dashboard path", () => {
    expect(fs.existsSync(CARD_PATH)).toBe(true);
    source = fs.readFileSync(CARD_PATH, "utf-8");
    expect(source.length).toBeGreaterThan(0);
  });

  it("uses no gradient classes (memory: feedback_no_gradients)", () => {
    const text = fs.readFileSync(CARD_PATH, "utf-8");
    expect(text).not.toMatch(/bg-gradient/);
    expect(text).not.toMatch(/from-[a-z]/);
    expect(text).not.toMatch(/\bvia-[a-z]/);
    // `to-` is too generic (matches `transition-` etc) so we anchor on the
    // tailwind gradient color form `to-<color>-<shade>`.
    expect(text).not.toMatch(/\bto-[a-z]+-\d/);
  });

  it("uses no bounce or scale animations (memory: feedback_no_bounce_animations)", () => {
    const text = fs.readFileSync(CARD_PATH, "utf-8");
    expect(text).not.toMatch(/animate-bounce/);
    expect(text).not.toMatch(/hover:scale-/);
    expect(text).not.toMatch(/active:scale-/);
  });

  it("fetches the real /api/analytics/costs endpoint, not the stale name", () => {
    const text = fs.readFileSync(CARD_PATH, "utf-8");
    expect(text).toMatch(/\/api\/analytics\/costs/);
    expect(text).not.toMatch(/\/api\/costs\/summary/);
  });

  it("does not use bg-primary/* fill classes for the data accents", () => {
    // Memory: reference_dark_theme_primary — primary is near-white in dark
    // theme, so distinctive accents should use explicit color families
    // (text-emerald-*, text-amber-*, etc), not bg-primary/*.
    const text = fs.readFileSync(CARD_PATH, "utf-8");
    expect(text).not.toMatch(/bg-primary\/[1-9]/);
  });
});

describe("computeAiVsDeterministic — pure savings math", () => {
  it("savings percentage is detCount / (aiCount + detCount)", () => {
    // 20 AI calls + 30 deterministic calls = 50 total. Det share = 60%.
    const summary = makeSummary({
      aiCost: 20.0,
      chatAiCount: 20,
      chatSlashCount: 30,
    });
    const r = computeAiVsDeterministic(summary);
    expect(r.aiCount).toBe(20);
    expect(r.detCount).toBe(30);
    expect(r.savingsPct).toBeCloseTo(60, 5);
  });

  it("estimated savings = detCount * avgAiCost", () => {
    // 10 AI calls @ $1.00 avg = $10 total. 30 det calls. Avg=1.0.
    // Estimated savings = 30 * 1.0 = $30.
    const summary = makeSummary({
      aiCost: 10.0,
      chatAiCount: 10,
      chatSlashCount: 20,
      chatHookCount: 5,
      chatWorkflowCount: 5,
    });
    const r = computeAiVsDeterministic(summary);
    expect(r.aiCount).toBe(10);
    expect(r.detCount).toBe(30);
    expect(r.aiCost).toBeCloseTo(10.0, 5);
    expect(r.estimatedSavings).toBeCloseTo(30.0, 5);
  });

  it("zero AI calls: avgAiCost=0, estimatedSavings=0, no NaN", () => {
    const summary = makeSummary({
      aiCost: 0,
      chatAiCount: 0,
      chatSlashCount: 5,
    });
    const r = computeAiVsDeterministic(summary);
    expect(r.aiCount).toBe(0);
    expect(r.detCount).toBe(5);
    expect(r.aiCost).toBe(0);
    expect(r.estimatedSavings).toBe(0);
    // Det-only -> 100% deterministic share, no NaN
    expect(r.savingsPct).toBeCloseTo(100, 5);
    expect(Number.isNaN(r.savingsPct)).toBe(false);
  });

  it("zero AI and zero deterministic: savingsPct=0, no divide-by-zero", () => {
    const summary = makeSummary({});
    const r = computeAiVsDeterministic(summary);
    expect(r.aiCount).toBe(0);
    expect(r.detCount).toBe(0);
    expect(r.savingsPct).toBe(0);
    expect(r.estimatedSavings).toBe(0);
    expect(Number.isNaN(r.savingsPct)).toBe(false);
  });

  it("AI sources include both chat-ai and scanner-jsonl", () => {
    expect(AI_SOURCES).toContain("chat-ai");
    expect(AI_SOURCES).toContain("scanner-jsonl");
  });

  it("deterministic sources cover slash/hook/workflow", () => {
    expect(DETERMINISTIC_SOURCES).toContain("chat-slash");
    expect(DETERMINISTIC_SOURCES).toContain("chat-hook");
    expect(DETERMINISTIC_SOURCES).toContain("chat-workflow");
  });
});
