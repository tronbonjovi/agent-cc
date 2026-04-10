// tests/health-reasons.test.ts
// Tests for health reason extraction on SessionHealth
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// --- Type tests ---

describe("healthReasons type on SessionHealth", () => {
  const typesPath = path.resolve(__dirname, "../shared/types.ts");
  const src = fs.readFileSync(typesPath, "utf-8");

  it("SessionHealth has healthReasons field", () => {
    expect(src).toMatch(/healthReasons\??\s*:\s*string\[\]/);
  });

  it("healthReasons is on SessionHealth interface (not elsewhere)", () => {
    // Find the SessionHealth interface block and confirm healthReasons is inside it
    const match = src.match(/export interface SessionHealth\s*\{([^}]+)\}/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("healthReasons");
  });
});

// --- Scanner unit tests ---

describe("health reason extraction logic", () => {
  const tmpDir = path.join(os.tmpdir(), "cc-health-reasons-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
  const projectDir = path.join(tmpDir, "projects", "test-proj");

  function writeSession(filename: string, records: object[]): string {
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, filename);
    const content = records.map(r => JSON.stringify(r)).join("\n") + "\n";
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  function makeMsg(role: "user" | "assistant", text: string, ts: string, extras: Record<string, unknown> = {}): object {
    if (role === "user") {
      return {
        type: "user",
        timestamp: ts,
        message: { role: "user", content: text },
        ...extras,
      };
    }
    return {
      type: "assistant",
      timestamp: ts,
      message: {
        role: "assistant",
        model: "claude-sonnet-4-20250514",
        content: [{ type: "text", text }],
        usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        ...extras,
      },
    };
  }

  function makeToolUse(name: string, input: Record<string, unknown>, ts: string): object {
    return {
      type: "assistant",
      timestamp: ts,
      message: {
        role: "assistant",
        model: "claude-sonnet-4-20250514",
        content: [{ type: "tool_use", id: "tool_" + Math.random().toString(36).slice(2), name, input }],
        usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    };
  }

  function makeToolResult(isError: boolean, ts: string): object {
    return {
      type: "user",
      timestamp: ts,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool_" + Math.random().toString(36).slice(2), is_error: isError, content: isError ? "Error: file not found" : "ok" }],
      },
    };
  }

  it("healthy session gets empty reasons array", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5, 0.3, 0.4, 0.2, 0.1, 0.6, 0.3, 0.2, 0.4, 0.5],
    });
    expect(reasons).toEqual([]);
  });

  it("detects high error rate when errors > 10% of messages", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 5,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,     // 5/10 = 50% > 10%
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5],
    });
    expect(reasons).toContain("high error rate");
  });

  it("does NOT flag high error rate at exactly 10%", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 1,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,     // 1/10 = 10% — exactly at threshold, not above
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5],
    });
    expect(reasons).not.toContain("high error rate");
  });

  it("detects excessive retries", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 9,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5],
    });
    expect(reasons).toContain("excessive retries");
  });

  it("detects context overflow when tokens near limit", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 180000,   // 90% of 200000
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5],
    });
    expect(reasons).toContain("context overflow");
  });

  it("does NOT flag context overflow at 79%", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 158000,   // 79% of 200000
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.5],
    });
    expect(reasons).not.toContain("context overflow");
  });

  it("detects long idle gaps (> 5 minutes)", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const base = new Date("2025-01-15T10:00:00Z").getTime();
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [
        new Date(base).toISOString(),
        new Date(base + 60000).toISOString(),           // 1 min gap — fine
        new Date(base + 60000 + 6 * 60000).toISOString(), // 6 min gap — triggers
      ],
      allSessionCosts: [0.5],
    });
    expect(reasons).toContain("long idle gaps");
  });

  it("does NOT flag idle gaps of exactly 5 minutes", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const base = new Date("2025-01-15T10:00:00Z").getTime();
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.5,
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [
        new Date(base).toISOString(),
        new Date(base + 5 * 60000).toISOString(), // exactly 5 min — not above threshold
      ],
      allSessionCosts: [0.5],
    });
    expect(reasons).not.toContain("long idle gaps");
  });

  it("detects high cost (above 90th percentile)", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    // 10 sessions: [0.1, 0.2, ..., 1.0] — 90th percentile = 0.9
    const allCosts = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 1.5,  // well above p90
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: allCosts,
    });
    expect(reasons).toContain("high cost");
  });

  it("does NOT flag cost at 90th percentile exactly", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const allCosts = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 20,
      messageCount: 10,
      estimatedCostUsd: 0.9,  // exactly at p90
      totalTokens: 50000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: allCosts,
    });
    expect(reasons).not.toContain("high cost");
  });

  it("detects short session (fewer than 3 messages)", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 1,
      messageCount: 2,
      estimatedCostUsd: 0.1,
      totalTokens: 5000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.1],
    });
    expect(reasons).toContain("short session");
  });

  it("does NOT flag session with exactly 3 messages as short", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 5,
      messageCount: 3,
      estimatedCostUsd: 0.3,
      totalTokens: 10000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.3],
    });
    expect(reasons).not.toContain("short session");
  });

  it("returns multiple reasons when multiple conditions met", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 5,
      retries: 10,
      totalToolCalls: 20,
      messageCount: 2,       // short session + high error rate (5/2 = 250%)
      estimatedCostUsd: 0.1,
      totalTokens: 5000,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [0.1],
    });
    expect(reasons).toContain("high error rate");
    expect(reasons).toContain("excessive retries");
    expect(reasons).toContain("short session");
    expect(reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("handles zero messages gracefully (no division by zero)", async () => {
    const { computeHealthReasons } = await import("../server/scanner/session-analytics");
    const reasons = computeHealthReasons({
      toolErrors: 0,
      retries: 0,
      totalToolCalls: 0,
      messageCount: 0,
      estimatedCostUsd: 0,
      totalTokens: 0,
      maxContextTokens: 200000,
      messageTimestamps: [],
      allSessionCosts: [],
    });
    // Should at least flag short session
    expect(reasons).toContain("short session");
    // Should not throw
    expect(Array.isArray(reasons)).toBe(true);
  });
});

// --- API response tests ---

describe("healthReasons in API response", () => {
  const analyticsPath = path.resolve(__dirname, "../server/scanner/session-analytics.ts");
  const src = fs.readFileSync(analyticsPath, "utf-8");

  it("analyzeSession produces healthReasons on SessionHealth", () => {
    expect(src).toContain("healthReasons");
  });

  it("computeHealthReasons is exported", () => {
    expect(src).toMatch(/export function computeHealthReasons/);
  });
});
