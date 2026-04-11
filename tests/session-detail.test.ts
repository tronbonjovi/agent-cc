// tests/session-detail.test.ts
import { describe, it, expect } from "vitest";

describe("SessionDetail components", () => {
  describe("SessionOverview helpers", () => {
    it("exports formatMetric function", async () => {
      const { formatMetric } = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(typeof formatMetric).toBe("function");
    });

    it("formatMetric handles tokens", async () => {
      const { formatMetric } = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(formatMetric(1500000, "tokens")).toBe("1.5M");
      expect(formatMetric(15000, "tokens")).toBe("15.0K");
      expect(formatMetric(500, "tokens")).toBe("500");
    });

    it("formatMetric handles cost", async () => {
      const { formatMetric } = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(formatMetric(2.5, "cost")).toBe("$2.50");
      expect(formatMetric(0.05, "cost")).toBe("$0.050");
      expect(formatMetric(0.001, "cost")).toBe("$0.0010");
    });

    it("formatMetric handles percentage", async () => {
      const { formatMetric } = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(formatMetric(0.85, "percent")).toBe("85%");
      expect(formatMetric(0, "percent")).toBe("0%");
      expect(formatMetric(null, "percent")).toBe("-");
    });

    it("formatMetric handles duration", async () => {
      const { formatMetric } = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(formatMetric(90, "duration")).toBe("1h 30m");
      expect(formatMetric(5, "duration")).toBe("5m");
      expect(formatMetric(null, "duration")).toBe("-");
    });
  });

  describe("SessionDetail exports", () => {
    it("exports SessionDetail component", async () => {
      const mod = await import("../client/src/components/analytics/sessions/SessionDetail");
      expect(typeof mod.SessionDetail).toBe("function");
    });
  });

  describe("SessionOverview exports", () => {
    it("exports SessionOverview component", async () => {
      const mod = await import("../client/src/components/analytics/sessions/SessionOverview");
      expect(typeof mod.SessionOverview).toBe("function");
    });
  });
});
