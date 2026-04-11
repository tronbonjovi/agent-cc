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
