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
      const p = getPricing("claude-sonnet-4-20250514");
      expect(p.input).toBe(3);
    });
  });

  describe("computeCost", () => {
    it("calculates cost with all token types", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      const cost = computeCost(pricing, 1_000_000, 500_000, 2_000_000, 100_000);
      expect(cost).toBeCloseTo(11.475, 3);
    });

    it("handles zero tokens", () => {
      const pricing = getPricing("claude-sonnet-4-20250514");
      expect(computeCost(pricing, 0, 0, 0, 0)).toBe(0);
    });

    it("handles opus pricing correctly", () => {
      const pricing = getPricing("claude-opus-4-20250514");
      const cost = computeCost(pricing, 100_000, 50_000, 0, 0);
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
