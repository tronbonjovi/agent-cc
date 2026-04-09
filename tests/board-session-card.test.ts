import { describe, it, expect } from "vitest";
import {
  formatCost,
  formatCostLabel,
  formatDuration,
  formatTokens,
  statusLightColor,
  statusLightTooltip,
  shortenModel,
  formatAgentRole,
} from "../client/src/components/board/session-indicators";

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
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(50000)).toBe("50k");
    expect(formatTokens(1200000)).toBe("1.2M");
  });

  it("picks correct status light color", () => {
    expect(statusLightColor(true, "good")).toBe("bg-green-500");
    expect(statusLightColor(true, "fair")).toBe("bg-amber-500");
    expect(statusLightColor(true, "poor")).toBe("bg-red-500");
    expect(statusLightColor(false, "good")).toBe("bg-slate-500");
    expect(statusLightColor(true, null)).toBe("bg-green-500");
  });

  it("shortens model name for badge display", () => {
    expect(shortenModel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(shortenModel("claude-opus-4-6")).toBe("Opus 4.6");
    expect(shortenModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(shortenModel(null)).toBe("");
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
    expect(statusLightTooltip(true, "fair")).toBe("Active — moderate issues");
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
