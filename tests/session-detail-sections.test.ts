// tests/session-detail-sections.test.ts
import { describe, it, expect } from "vitest";

describe("ToolTimeline", () => {
  it("exports durationColor function", async () => {
    const { durationColor } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(typeof durationColor).toBe("function");
  });

  it("durationColor returns green for < 1s", async () => {
    const { durationColor } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(durationColor(500)).toBe("text-emerald-500");
    expect(durationColor(0)).toBe("text-emerald-500");
  });

  it("durationColor returns amber for 1-5s", async () => {
    const { durationColor } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(durationColor(1500)).toBe("text-amber-500");
    expect(durationColor(4999)).toBe("text-amber-500");
  });

  it("durationColor returns red for > 5s", async () => {
    const { durationColor } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(durationColor(5000)).toBe("text-red-500");
    expect(durationColor(30000)).toBe("text-red-500");
  });

  it("durationColor handles null", async () => {
    const { durationColor } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(durationColor(null)).toBe("text-muted-foreground");
  });

  it("exports formatDurationMs function", async () => {
    const { formatDurationMs } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(formatDurationMs(500)).toBe("0.5s");
    expect(formatDurationMs(1500)).toBe("1.5s");
    expect(formatDurationMs(65000)).toBe("65.0s");
    expect(formatDurationMs(null)).toBe("-");
  });

  it("exports filterTools function", async () => {
    const { filterTools } = await import("../client/src/components/analytics/sessions/ToolTimeline");
    const tools = [
      { callId: "1", name: "Read", filePath: "a.ts", command: null, pattern: null, timestamp: "", resultTimestamp: "", durationMs: 100, isError: false, isSidechain: false },
      { callId: "2", name: "Bash", filePath: null, command: "ls", pattern: null, timestamp: "", resultTimestamp: "", durationMs: 200, isError: true, isSidechain: false },
      { callId: "3", name: "Edit", filePath: "b.ts", command: null, pattern: null, timestamp: "", resultTimestamp: "", durationMs: 300, isError: false, isSidechain: false },
    ];

    // No filter returns all
    expect(filterTools(tools, {})).toHaveLength(3);

    // Filter by tool type
    expect(filterTools(tools, { toolTypes: ["Read"] })).toHaveLength(1);

    // Errors only
    expect(filterTools(tools, { errorsOnly: true })).toHaveLength(1);
    expect(filterTools(tools, { errorsOnly: true })[0].name).toBe("Bash");

    // Combined
    expect(filterTools(tools, { toolTypes: ["Read"], errorsOnly: true })).toHaveLength(0);
  });

  it("exports ToolTimeline component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/ToolTimeline");
    expect(typeof mod.ToolTimeline).toBe("function");
  });
});

describe("TokenBreakdown", () => {
  it("exports TokenBreakdown component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/TokenBreakdown");
    expect(typeof mod.TokenBreakdown).toBe("function");
  });

  it("exports buildTokenRows function", async () => {
    const { buildTokenRows } = await import("../client/src/components/analytics/sessions/TokenBreakdown");
    expect(typeof buildTokenRows).toBe("function");
  });

  it("buildTokenRows computes cumulative totals", async () => {
    // Wave2 task003 reshaped buildTokenRows to take (assistantMessages, userMessages)
    // — the same signature its sibling buildTokenRowsFromTree uses. Cumulative
    // math is unchanged: running sum of inputTokens + outputTokens.
    const { buildTokenRows } = await import("../client/src/components/analytics/sessions/TokenBreakdown");
    const baseUsage = {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      serviceTier: "standard",
      inferenceGeo: "us",
      speed: "fast",
      serverToolUse: { webSearchRequests: 0, webFetchRequests: 0 },
    };
    const baseMsg = {
      parentUuid: "",
      requestId: "",
      isSidechain: false,
      stopReason: "end_turn",
      toolCalls: [],
      hasThinking: false,
      textPreview: "",
    };
    const assistantMessages = [
      {
        ...baseMsg,
        uuid: "u1",
        timestamp: "2026-04-12T00:00:01.000Z",
        model: "claude",
        usage: { inputTokens: 100, outputTokens: 0, ...baseUsage },
      },
      {
        ...baseMsg,
        uuid: "u2",
        timestamp: "2026-04-12T00:00:02.000Z",
        model: "claude",
        usage: { inputTokens: 200, outputTokens: 150, ...baseUsage },
      },
    ];
    const rows = buildTokenRows(assistantMessages, []);
    expect(rows).toHaveLength(2);
    expect(rows[0].cumulativeTotal).toBe(100);
    expect(rows[1].cumulativeTotal).toBe(450); // 100 + 200 + 150
  });
});

describe("FileImpact", () => {
  it("exports FileImpact component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/FileImpact");
    expect(typeof mod.FileImpact).toBe("function");
  });

  it("exports groupByDirectory function", async () => {
    const { groupByDirectory } = await import("../client/src/components/analytics/sessions/FileImpact");
    expect(typeof groupByDirectory).toBe("function");
  });

  it("groupByDirectory groups files correctly", async () => {
    const { groupByDirectory } = await import("../client/src/components/analytics/sessions/FileImpact");
    const tools = [
      { callId: "1", name: "Read", filePath: "server/routes/api.ts", command: null, pattern: null, timestamp: "2026-04-10T12:00:00Z", resultTimestamp: "", durationMs: 100, isError: false, isSidechain: false },
      { callId: "2", name: "Edit", filePath: "server/routes/api.ts", command: null, pattern: null, timestamp: "2026-04-10T12:05:00Z", resultTimestamp: "", durationMs: 100, isError: false, isSidechain: false },
      { callId: "3", name: "Read", filePath: "server/db.ts", command: null, pattern: null, timestamp: "2026-04-10T12:01:00Z", resultTimestamp: "", durationMs: 100, isError: false, isSidechain: false },
    ];
    const groups = groupByDirectory(tools);
    expect(groups.has("server/routes")).toBe(true);
    expect(groups.has("server")).toBe(true);

    const routesFiles = groups.get("server/routes")!;
    expect(routesFiles).toHaveLength(1);
    expect(routesFiles[0].reads).toBe(1);
    expect(routesFiles[0].edits).toBe(1);
  });
});

describe("HealthDetails", () => {
  it("exports HealthDetails component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/HealthDetails");
    expect(typeof mod.HealthDetails).toBe("function");
  });
});

describe("LifecycleEvents", () => {
  it("exports LifecycleEvents component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/LifecycleEvents");
    expect(typeof mod.LifecycleEvents).toBe("function");
  });
});
