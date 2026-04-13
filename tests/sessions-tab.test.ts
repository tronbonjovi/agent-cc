// tests/sessions-tab.test.ts
import { describe, it, expect } from "vitest";

describe("SessionsTab", () => {
  it("exports SessionsTab component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/SessionsTab");
    expect(typeof mod.SessionsTab).toBe("function");
  });
});

describe("LinkedTask", () => {
  it("exports LinkedTask component", async () => {
    const mod = await import("../client/src/components/analytics/sessions/LinkedTask");
    expect(typeof mod.LinkedTask).toBe("function");
  });
});

describe("SessionDetail wiring", () => {
  it("imports all section components", async () => {
    // Verify SessionDetail can import all wired sections without errors
    const detail = await import("../client/src/components/analytics/sessions/SessionDetail");
    expect(typeof detail.SessionDetail).toBe("function");
  });
});

describe("SessionsTab passes enrichment props to SessionDetail", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/analytics/sessions/SessionsTab.tsx"),
    "utf-8",
  );

  it("looks up selected session from enriched array", () => {
    // SessionsTab must find the selected session in the enriched list
    expect(src).toMatch(/enriched\.find\(\s*s\s*=>\s*s\.id\s*===\s*selectedId\s*\)/);
  });

  it("passes durationMinutes to SessionDetail", () => {
    // SessionDetail should receive durationMinutes from enrichment
    expect(src).toMatch(/durationMinutes=\{selectedSession\?\.durationMinutes\}/);
  });

  it("passes healthScore to SessionDetail", () => {
    expect(src).toMatch(/healthScore=\{selectedSession\?\.healthScore\}/);
  });

  it("passes healthReasons to SessionDetail", () => {
    expect(src).toMatch(/healthReasons=\{selectedSession\?\.healthReasons\}/);
  });
});
