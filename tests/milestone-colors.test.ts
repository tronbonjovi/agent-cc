// tests/milestone-colors.test.ts
import { describe, it, expect } from "vitest";
import { getMilestoneColor, MILESTONE_PALETTE } from "../shared/milestone-colors";

describe("getMilestoneColor", () => {
  it("returns the same color for the same milestone ID", () => {
    const color1 = getMilestoneColor("board-visual-identity");
    const color2 = getMilestoneColor("board-visual-identity");
    expect(color1).toBe(color2);
  });

  it("returns a color from the palette", () => {
    const color = getMilestoneColor("some-milestone");
    expect(MILESTONE_PALETTE).toContain(color);
  });

  it("different IDs generally produce different colors", () => {
    // With 10 palette colors and 5 distinct IDs, at least 2 should differ
    const ids = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const colors = ids.map(id => getMilestoneColor(id));
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("handles null gracefully — returns first palette color", () => {
    const color = getMilestoneColor(null);
    expect(color).toBe(MILESTONE_PALETTE[0]);
  });

  it("handles undefined gracefully — returns first palette color", () => {
    const color = getMilestoneColor(undefined);
    expect(color).toBe(MILESTONE_PALETTE[0]);
  });

  it("handles empty string — returns first palette color", () => {
    const color = getMilestoneColor("");
    expect(color).toBe(MILESTONE_PALETTE[0]);
  });

  it("accepts a custom palette", () => {
    const custom = ["#ff0000", "#00ff00"];
    const color = getMilestoneColor("test-id", custom);
    expect(custom).toContain(color);
  });

  it("returns fallback gray when palette is empty", () => {
    const color = getMilestoneColor("test-id", []);
    expect(color).toBe("#6b7280");
  });

  it("is consistent across many calls (stability check)", () => {
    const id = "workspace-integration-task003";
    const first = getMilestoneColor(id);
    for (let i = 0; i < 100; i++) {
      expect(getMilestoneColor(id)).toBe(first);
    }
  });
});
