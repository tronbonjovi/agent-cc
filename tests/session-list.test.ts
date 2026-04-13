// tests/session-list.test.ts
import { describe, it, expect } from "vitest";

// Test the pure logic functions extracted from session list components

describe("SessionList components", () => {
  describe("SessionRow helpers", () => {
    it("exports formatDuration function", async () => {
      const { formatDuration } = await import("../client/src/components/analytics/sessions/SessionRow");
      expect(typeof formatDuration).toBe("function");
    });

    it("formatDuration handles minutes only", async () => {
      const { formatDuration } = await import("../client/src/components/analytics/sessions/SessionRow");
      expect(formatDuration(23)).toBe("23m");
    });

    it("formatDuration handles hours and minutes", async () => {
      const { formatDuration } = await import("../client/src/components/analytics/sessions/SessionRow");
      expect(formatDuration(134)).toBe("2h 14m");
    });

    it("formatDuration handles zero", async () => {
      const { formatDuration } = await import("../client/src/components/analytics/sessions/SessionRow");
      expect(formatDuration(0)).toBe("0m");
    });

    it("formatDuration handles null", async () => {
      const { formatDuration } = await import("../client/src/components/analytics/sessions/SessionRow");
      expect(formatDuration(null)).toBe("-");
    });

    it("sessionHealthColor maps each score to the canonical Tailwind class", async () => {
      const { sessionHealthColor } = await import("../client/src/lib/session-health");
      expect(sessionHealthColor("good")).toBe("bg-emerald-500");
      expect(sessionHealthColor("fair")).toBe("bg-amber-500");
      expect(sessionHealthColor("poor")).toBe("bg-red-500");
      expect(sessionHealthColor(null)).toBe("bg-muted-foreground/30");
    });
  });

  describe("SessionFilters", () => {
    it("exports SORT_OPTIONS with 7 options", async () => {
      const { SORT_OPTIONS } = await import("../client/src/components/analytics/sessions/SessionFilters");
      expect(SORT_OPTIONS).toHaveLength(7);
    });

    it("each sort option has value and label", async () => {
      const { SORT_OPTIONS } = await import("../client/src/components/analytics/sessions/SessionFilters");
      for (const opt of SORT_OPTIONS) {
        expect(opt).toHaveProperty("value");
        expect(opt).toHaveProperty("label");
        expect(typeof opt.value).toBe("string");
        expect(typeof opt.label).toBe("string");
      }
    });

    it("exports HEALTH_FILTERS", async () => {
      const { HEALTH_FILTERS } = await import("../client/src/components/analytics/sessions/SessionFilters");
      expect(HEALTH_FILTERS).toEqual(["good", "fair", "poor"]);
    });

    it("exports STATUS_FILTERS", async () => {
      const { STATUS_FILTERS } = await import("../client/src/components/analytics/sessions/SessionFilters");
      expect(STATUS_FILTERS).toContain("active");
      expect(STATUS_FILTERS).toContain("inactive");
    });
  });

  describe("SessionList", () => {
    it("exports applyFilters function", async () => {
      const { applyFilters } = await import("../client/src/components/analytics/sessions/SessionList");
      expect(typeof applyFilters).toBe("function");
    });

    it("applyFilters with empty filters returns all sessions", async () => {
      const { applyFilters } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", isActive: true, healthScore: "good" as const, isEmpty: false },
        { id: "2", isActive: false, healthScore: "poor" as const, isEmpty: false },
      ];
      const result = applyFilters(sessions, {});
      expect(result).toHaveLength(2);
    });

    it("applyFilters ignores legacy health filter (passthrough)", async () => {
      const { applyFilters } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", isActive: true, healthScore: "good" as const, isEmpty: false },
        { id: "2", isActive: false, healthScore: "poor" as const, isEmpty: false },
      ];
      // After Task 2.3 strip, applyFilters is a passthrough — health/status dims removed.
      const result = applyFilters(sessions, { health: ["good"] });
      expect(result).toHaveLength(2);
    });

    it("applyFilters ignores legacy status:active filter (passthrough)", async () => {
      const { applyFilters } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", isActive: true, healthScore: null, isEmpty: false },
        { id: "2", isActive: false, healthScore: null, isEmpty: false },
      ];
      const result = applyFilters(sessions, { status: ["active"] });
      expect(result).toHaveLength(2);
    });

    it("applyFilters ignores legacy status:empty filter (passthrough)", async () => {
      const { applyFilters } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", isActive: false, healthScore: null, isEmpty: true },
        { id: "2", isActive: false, healthScore: null, isEmpty: false },
      ];
      const result = applyFilters(sessions, { status: ["empty"] });
      expect(result).toHaveLength(2);
    });

    it("exports applySorting function", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      expect(typeof applySorting).toBe("function");
    });

    it("applySorting sorts by newest first", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: "2026-04-10T10:00:00Z", messageCount: 5, costUsd: 1, healthScore: "good" as const, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: "2026-04-10T12:00:00Z", messageCount: 3, costUsd: 2, healthScore: "poor" as const, durationMinutes: 20, sizeBytes: 200 },
      ];
      const result = applySorting(sessions, "newest");
      expect(result[0].id).toBe("2");
    });

    it("applySorting sorts by most messages", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: null, messageCount: 5, costUsd: 1, healthScore: null, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: null, messageCount: 15, costUsd: 2, healthScore: null, durationMinutes: 20, sizeBytes: 200 },
      ];
      const result = applySorting(sessions, "most-messages");
      expect(result[0].id).toBe("2");
    });

    it("applySorting sorts by highest cost", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: null, messageCount: 5, costUsd: 0.5, healthScore: null, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: null, messageCount: 3, costUsd: 2.5, healthScore: null, durationMinutes: 20, sizeBytes: 200 },
      ];
      const result = applySorting(sessions, "highest-cost");
      expect(result[0].id).toBe("2");
    });

    it("applySorting sorts by oldest first", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: "2026-04-10T12:00:00Z", messageCount: 5, costUsd: 1, healthScore: null, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: "2026-04-10T10:00:00Z", messageCount: 3, costUsd: 2, healthScore: null, durationMinutes: 20, sizeBytes: 200 },
      ];
      const result = applySorting(sessions, "oldest");
      expect(result[0].id).toBe("2");
    });

    it("applySorting sorts by worst health (poor first)", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: null, messageCount: 5, costUsd: 1, healthScore: "good" as const, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: null, messageCount: 3, costUsd: 2, healthScore: "poor" as const, durationMinutes: 20, sizeBytes: 200 },
        { id: "3", lastTs: null, messageCount: 4, costUsd: 1, healthScore: null, durationMinutes: 15, sizeBytes: 150 },
      ];
      const result = applySorting(sessions, "worst-health");
      expect(result[0].id).toBe("2"); // poor first
      // "good" and null both have rank 2, so they share last positions
      expect(["1", "3"]).toContain(result[1].id);
      expect(["1", "3"]).toContain(result[2].id);
    });

    it("applySorting sorts by largest size", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: null, messageCount: 5, costUsd: 1, healthScore: null, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: null, messageCount: 3, costUsd: 2, healthScore: null, durationMinutes: 20, sizeBytes: 5000 },
      ];
      const result = applySorting(sessions, "largest");
      expect(result[0].id).toBe("2");
    });

    it("applySorting sorts by longest duration", async () => {
      const { applySorting } = await import("../client/src/components/analytics/sessions/SessionList");
      const sessions = [
        { id: "1", lastTs: null, messageCount: 5, costUsd: 1, healthScore: null, durationMinutes: 10, sizeBytes: 100 },
        { id: "2", lastTs: null, messageCount: 3, costUsd: 2, healthScore: null, durationMinutes: 120, sizeBytes: 200 },
      ];
      const result = applySorting(sessions, "longest");
      expect(result[0].id).toBe("2");
    });
  });
});
