import { describe, it, expect } from "vitest";
import { getPricing, computeCost, getMaxTokens } from "../server/scanner/pricing";

describe("pricing", () => {
  describe("getPricing", () => {
    // Opus 4.0/4.1 — old pricing $15/$75
    it("matches opus 4.0 model strings at old pricing", () => {
      const p = getPricing("claude-opus-4-20250514");
      expect(p.input).toBe(15);
      expect(p.output).toBe(75);
    });

    // Opus 4.5/4.6 — new pricing $5/$25
    it("matches opus 4.5 at new pricing", () => {
      const p = getPricing("claude-opus-4-5-20251001");
      expect(p.input).toBe(5);
      expect(p.output).toBe(25);
      expect(p.cacheRead).toBe(0.50);
      expect(p.cacheCreation).toBe(6.25);
    });

    it("matches opus 4.6 at new pricing", () => {
      const p = getPricing("claude-opus-4-6");
      expect(p.input).toBe(5);
      expect(p.output).toBe(25);
      expect(p.cacheRead).toBe(0.50);
      expect(p.cacheCreation).toBe(6.25);
    });

    it("matches sonnet model strings", () => {
      const p = getPricing("claude-sonnet-4-20250514");
      expect(p.input).toBe(3);
      expect(p.output).toBe(15);
    });

    it("matches sonnet 4.6", () => {
      const p = getPricing("claude-sonnet-4-6");
      expect(p.input).toBe(3);
      expect(p.output).toBe(15);
    });

    // Haiku 4.5 — $1/$5
    it("matches haiku 4.5 at new pricing", () => {
      const p = getPricing("claude-haiku-4-5-20251001");
      expect(p.input).toBe(1);
      expect(p.output).toBe(5);
      expect(p.cacheRead).toBe(0.10);
      expect(p.cacheCreation).toBe(1.25);
    });

    // Haiku 3.5 — $0.80/$4
    it("matches haiku 3.5 at old pricing", () => {
      const p = getPricing("claude-haiku-3.5-20251001");
      expect(p.input).toBe(0.80);
      expect(p.output).toBe(4);
    });

    it("defaults to sonnet for unknown models", () => {
      const p = getPricing("unknown-model-v9");
      expect(p.input).toBe(3);
      expect(p.output).toBe(15);
    });
  });

  describe("computeCost", () => {
    it("calculates cost with all token types (sonnet)", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      const cost = computeCost(pricing, 1_000_000, 500_000, 2_000_000, 100_000);
      expect(cost).toBeCloseTo(11.475, 3);
    });

    it("handles zero tokens", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      expect(computeCost(pricing, 0, 0, 0, 0)).toBe(0);
    });

    it("calculates opus 4.0 pricing correctly", () => {
      const pricing = getPricing("claude-opus-4-20250514");
      // 100K input @ $15, 50K output @ $75
      const cost = computeCost(pricing, 100_000, 50_000, 0, 0);
      expect(cost).toBeCloseTo(5.25, 3);
    });

    it("calculates opus 4.6 pricing correctly", () => {
      const pricing = getPricing("claude-opus-4-6");
      // 100K input @ $5, 50K output @ $25
      // = (100000*5 + 50000*25) / 1M = (500000 + 1250000) / 1M = 1.75
      const cost = computeCost(pricing, 100_000, 50_000, 0, 0);
      expect(cost).toBeCloseTo(1.75, 3);
    });

    it("opus 4.6 is 3x cheaper than opus 4.0", () => {
      const old = getPricing("claude-opus-4-20250514");
      const new46 = getPricing("claude-opus-4-6");
      const tokens = { input: 1_000_000, output: 500_000, cr: 0, cc: 0 };
      const oldCost = computeCost(old, tokens.input, tokens.output, tokens.cr, tokens.cc);
      const newCost = computeCost(new46, tokens.input, tokens.output, tokens.cr, tokens.cc);
      expect(oldCost / newCost).toBeCloseTo(3, 1);
    });
  });

  describe("getMaxTokens", () => {
    it("returns 1M for opus", () => {
      expect(getMaxTokens("claude-opus-4-6")).toBe(1_000_000);
    });

    it("returns 200K for non-opus", () => {
      expect(getMaxTokens("claude-sonnet-4-20250514")).toBe(200_000);
    });
  });

  describe("live-scanner cost estimate correctness", () => {
    it("cache read tokens should cost 10% of input rate", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      const cost = computeCost(pricing, 50_000, 20_000, 500_000, 10_000);
      expect(cost).toBeCloseTo(0.6375, 4);

      const oldWay = (560_000 / 1_000_000 * 0.3) + (20_000 / 1_000_000 * 15);
      expect(oldWay).toBeCloseTo(0.468, 3);
      expect(cost).toBeGreaterThan(oldWay);
    });
  });
});
