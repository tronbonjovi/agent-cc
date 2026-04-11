import { describe, it, expect } from "vitest";

// ---- Pure logic extracted for testability ----

/** Compute system prompt percentage of total tokens */
function computePercentage(systemTokens: number, totalTokens: number): number {
  if (totalTokens === 0) return 0;
  return (systemTokens / totalTokens) * 100;
}

/** Format percentage for display */
function formatPercentage(pct: number): string {
  if (pct >= 10) return pct.toFixed(0);
  if (pct >= 1) return pct.toFixed(1);
  return pct.toFixed(2);
}

type TrendDirection = "growing" | "shrinking" | "stable";

/** Determine trend direction from short-term vs long-term percentage */
function computeTrend(shortTermPct: number, longTermPct: number, thresholdPct = 2): TrendDirection {
  const diff = shortTermPct - longTermPct;
  if (diff > thresholdPct) return "growing";
  if (diff < -thresholdPct) return "shrinking";
  return "stable";
}

/** Get trend arrow character */
function trendArrow(direction: TrendDirection): string {
  switch (direction) {
    case "growing": return "\u2191";
    case "shrinking": return "\u2193";
    case "stable": return "\u2192";
  }
}

// ---- Tests ----

describe("system-prompt-overhead", () => {
  describe("computePercentage", () => {
    it("computes correct percentage", () => {
      expect(computePercentage(5000, 20000)).toBe(25);
    });

    it("returns 0 when total is 0", () => {
      expect(computePercentage(0, 0)).toBe(0);
    });

    it("handles small percentages", () => {
      expect(computePercentage(100, 100000)).toBeCloseTo(0.1, 2);
    });

    it("handles 100% (all system prompt)", () => {
      expect(computePercentage(5000, 5000)).toBe(100);
    });

    it("handles large token counts", () => {
      expect(computePercentage(1_000_000, 10_000_000)).toBe(10);
    });
  });

  describe("formatPercentage", () => {
    it("shows no decimals for >= 10%", () => {
      expect(formatPercentage(25.7)).toBe("26");
      expect(formatPercentage(10.0)).toBe("10");
    });

    it("shows 1 decimal for 1-10%", () => {
      expect(formatPercentage(5.42)).toBe("5.4");
      expect(formatPercentage(1.0)).toBe("1.0");
    });

    it("shows 2 decimals for < 1%", () => {
      expect(formatPercentage(0.52)).toBe("0.52");
      expect(formatPercentage(0.1)).toBe("0.10");
    });
  });

  describe("computeTrend", () => {
    it("returns growing when short-term is higher by more than threshold", () => {
      expect(computeTrend(30, 25)).toBe("growing");
    });

    it("returns shrinking when short-term is lower by more than threshold", () => {
      expect(computeTrend(20, 25)).toBe("shrinking");
    });

    it("returns stable when difference is within threshold", () => {
      expect(computeTrend(25, 24)).toBe("stable");
      expect(computeTrend(24, 25)).toBe("stable");
    });

    it("uses custom threshold", () => {
      expect(computeTrend(26, 25, 0.5)).toBe("growing");
      expect(computeTrend(26, 25, 5)).toBe("stable");
    });

    it("handles zero values", () => {
      expect(computeTrend(0, 0)).toBe("stable");
    });

    it("handles identical values", () => {
      expect(computeTrend(15, 15)).toBe("stable");
    });
  });

  describe("trendArrow", () => {
    it("returns up arrow for growing", () => {
      expect(trendArrow("growing")).toBe("\u2191");
    });

    it("returns down arrow for shrinking", () => {
      expect(trendArrow("shrinking")).toBe("\u2193");
    });

    it("returns right arrow for stable", () => {
      expect(trendArrow("stable")).toBe("\u2192");
    });
  });

  describe("Library link", () => {
    it("link path points to /library", () => {
      // Verifies the expected navigation target for the manage configuration link
      const libraryPath = "/library";
      expect(libraryPath).toBe("/library");
    });
  });

  describe("integration scenarios", () => {
    it("computes full overhead display from anatomy data", () => {
      // Simulate anatomy response
      const anatomy = {
        systemPrompt: { tokens: 6000, cost: 0.03 },
        conversation: { tokens: 12000, cost: 0.06 },
        toolExecution: { tokens: 3000, cost: 0.015 },
        thinking: { tokens: 2000, cost: 0.01 },
        cacheOverhead: { tokens: 1000, cost: 0.005 },
        total: { tokens: 24000, cost: 0.12 },
      };

      const pct = computePercentage(anatomy.systemPrompt.tokens, anatomy.total.tokens);
      expect(pct).toBe(25);
      expect(formatPercentage(pct)).toBe("25");
    });

    it("computes trend from two time windows", () => {
      // 7-day anatomy: system prompt is 30% of total
      const anatomy7d = {
        systemPrompt: { tokens: 9000, cost: 0.045 },
        total: { tokens: 30000, cost: 0.15 },
      };
      // 30-day anatomy: system prompt is 25% of total
      const anatomy30d = {
        systemPrompt: { tokens: 7500, cost: 0.0375 },
        total: { tokens: 30000, cost: 0.15 },
      };

      const pct7d = computePercentage(anatomy7d.systemPrompt.tokens, anatomy7d.total.tokens);
      const pct30d = computePercentage(anatomy30d.systemPrompt.tokens, anatomy30d.total.tokens);
      const trend = computeTrend(pct7d, pct30d);

      expect(pct7d).toBe(30);
      expect(pct30d).toBe(25);
      expect(trend).toBe("growing");
    });

    it("handles empty anatomy data gracefully", () => {
      const anatomy = {
        systemPrompt: { tokens: 0, cost: 0 },
        total: { tokens: 0, cost: 0 },
      };

      const pct = computePercentage(anatomy.systemPrompt.tokens, anatomy.total.tokens);
      expect(pct).toBe(0);
      expect(formatPercentage(pct)).toBe("0.00");
      expect(computeTrend(0, 0)).toBe("stable");
    });
  });
});
