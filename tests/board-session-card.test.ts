import { describe, it, expect } from "vitest";
import {
  formatCost,
  formatCostLabel,
  formatDuration,
  formatTokens,
  statusLightColor,
  statusLightTooltip,
  formatAgentRole,
} from "../client/src/components/board/session-indicators";
import { truncateTitle } from "../client/src/components/board/board-task-card";

describe("session indicator logic", () => {
  it("formats cost as dollars with 2 decimal places", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.345)).toBe("$12.35");
  });

  it("formats duration as human-readable", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("<1m");
    expect(formatDuration(5)).toBe("5m");
    expect(formatDuration(65)).toBe("1h 5m");
    expect(formatDuration(120)).toBe("2h 0m");
  });

  it("formats token counts as compact numbers", () => {
    // These now delegate to the canonical formatTokens in shared/format.ts
    // which uses uppercase "K" and 1-decimal precision across all tiers.
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(50000)).toBe("50.0K");
    expect(formatTokens(1200000)).toBe("1.2M");
  });

  it("picks correct status light color", () => {
    expect(statusLightColor(true, "good")).toBe("bg-emerald-500");
    expect(statusLightColor(true, "fair")).toBe("bg-amber-500");
    expect(statusLightColor(true, "poor")).toBe("bg-red-500");
    expect(statusLightColor(false, "good")).toBe("bg-slate-500");
    expect(statusLightColor(true, null)).toBe("bg-muted-foreground/30");
  });

  it("formatCostLabel returns session-level qualifier", () => {
    expect(formatCostLabel(1.5)).toBe("$1.50 (session)");
    expect(formatCostLabel(0.0042)).toBe("$0.00 (session)");
  });

  it("formatCostLabel returns empty string for zero cost", () => {
    expect(formatCostLabel(0)).toBe("");
  });

  it("returns correct status light tooltip text for all states", () => {
    expect(statusLightTooltip(true, "good")).toBe("Active — healthy");
    expect(statusLightTooltip(true, "fair")).toBe("Active — some issues");
    expect(statusLightTooltip(true, "poor")).toBe("Active — high error rate");
    expect(statusLightTooltip(true, null)).toBe("Active");
    expect(statusLightTooltip(false, "good")).toBe("Session ended");
    expect(statusLightTooltip(false, null)).toBe("Session ended");
    expect(statusLightTooltip(false, "poor")).toBe("Session ended");
  });

  it("formats agent role for display — capitalizes and trims", () => {
    expect(formatAgentRole("general-purpose")).toBe("General Purpose");
    expect(formatAgentRole("Explore")).toBe("Explore");
    expect(formatAgentRole("code-review")).toBe("Code Review");
    expect(formatAgentRole(null)).toBe("");
    expect(formatAgentRole("")).toBe("");
  });
});

describe("truncateTitle", () => {
  it("returns short titles unchanged", () => {
    expect(truncateTitle("Build auth")).toBe("Build auth");
  });

  it("returns titles at exactly the limit unchanged", () => {
    const exact = "A".repeat(60);
    expect(truncateTitle(exact)).toBe(exact);
  });

  it("truncates titles longer than 60 chars with ellipsis", () => {
    const long = "A".repeat(80);
    const result = truncateTitle(long);
    expect(result.length).toBeLessThanOrEqual(61); // 60 chars + ellipsis character
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("respects custom maxLen parameter", () => {
    const title = "This is a moderately long title for testing";
    const result = truncateTitle(title, 20);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("trims trailing whitespace before adding ellipsis", () => {
    // 58 chars + 2 spaces at the cut point
    const title = "A".repeat(58) + "  " + "B".repeat(10);
    const result = truncateTitle(title);
    expect(result).not.toMatch(/\s\u2026$/);
    expect(result.endsWith("\u2026")).toBe(true);
  });
});
