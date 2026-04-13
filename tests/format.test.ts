import { describe, it, expect } from "vitest";
import { formatUsd, formatCost, formatTokens, formatDate } from "../shared/format";

describe("formatUsd", () => {
  it("formats values >= 0.01 with 2 decimals", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0.05)).toBe("$0.05");
  });
  it("formats tiny values with 4 decimals", () => {
    expect(formatUsd(0.0005)).toBe("$0.0005");
  });
  it("returns sentinel for sub-0.0001 positive values", () => {
    expect(formatUsd(0.00001)).toBe("<$0.0001");
  });
  it("formats zero as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatCost", () => {
  it("always uses 2 decimals", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(125.7)).toBe("$125.70");
  });
});

describe("formatTokens", () => {
  it("abbreviates millions with 1 decimal", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
  it("abbreviates thousands with 1 decimal", () => {
    expect(formatTokens(2_500)).toBe("2.5K");
  });
  it("returns raw count below 1000", () => {
    expect(formatTokens(500)).toBe("500");
  });
});

describe("formatDate", () => {
  it("formats ISO date as 'MMM DD'", () => {
    // Timezone tolerant — UTC midnight can render as prior day in negative offsets
    expect(formatDate("2026-04-13")).toMatch(/Apr 1[23]/);
  });
});
