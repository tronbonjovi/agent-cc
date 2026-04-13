import { describe, it, expect } from "vitest";
import { applyFilters, applySorting } from "@/components/analytics/sessions/SessionList";

describe("SessionList — health/status filters removed", () => {
  it("applyFilters is a passthrough (no health/status branches)", () => {
    const sessions = [
      { id: "1", isActive: true, healthScore: "good" as const, isEmpty: false },
      { id: "2", isActive: false, healthScore: "poor" as const, isEmpty: false },
    ];
    // After the strip, applyFilters is a passthrough — filter argument is ignored.
    const result = applyFilters(sessions, {});
    expect(result).toEqual(sessions);
  });

  it("applyFilters ignores legacy health filter keys", () => {
    const sessions = [
      { id: "1", healthScore: "good" as const },
      { id: "2", healthScore: "poor" as const },
    ];
    // Legacy callers that still pass { health: [...] } should get every session back.
    const result = applyFilters(sessions, { health: ["good"] });
    expect(result).toEqual(sessions);
  });

  it("applyFilters ignores legacy status filter keys", () => {
    const sessions = [
      { id: "1", isActive: true, isEmpty: false },
      { id: "2", isActive: false, isEmpty: true },
    ];
    const result = applyFilters(sessions, { status: ["active"] });
    expect(result).toEqual(sessions);
  });

  it("applySorting still works for newest / highest-cost", () => {
    const sessions = [
      { id: "a", lastTs: "2026-04-10T00:00:00Z", messageCount: 5, costUsd: 1.0, healthScore: "good" as const, durationMinutes: 10, sizeBytes: 1000 },
      { id: "b", lastTs: "2026-04-12T00:00:00Z", messageCount: 20, costUsd: 5.0, healthScore: "fair" as const, durationMinutes: 30, sizeBytes: 5000 },
      { id: "c", lastTs: "2026-04-11T00:00:00Z", messageCount: 10, costUsd: 3.0, healthScore: "poor" as const, durationMinutes: 20, sizeBytes: 2500 },
    ];
    const newest = applySorting(sessions, "newest");
    expect(newest.map(s => s.id)).toEqual(["b", "c", "a"]);

    const highestCost = applySorting(sessions, "highest-cost");
    expect(highestCost.map(s => s.id)).toEqual(["b", "c", "a"]);
  });
});
