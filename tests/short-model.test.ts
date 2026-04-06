import { describe, it, expect } from "vitest";
import { shortModel } from "../client/src/lib/utils";

describe("shortModel", () => {
  it("returns Opus 4.6 for claude-opus-4-6", () => {
    expect(shortModel("claude-opus-4-6")).toBe("Opus 4.6");
  });
  it("returns Opus 4.6 for claude-opus-4-6 with context suffix", () => {
    expect(shortModel("claude-opus-4-6[1m]")).toBe("Opus 4.6");
  });
  it("returns Sonnet 4.6 for claude-sonnet-4-6", () => {
    expect(shortModel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
  });
  it("returns Haiku 4.5 for claude-haiku-4-5-20251001", () => {
    expect(shortModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });
  it("returns ? for null", () => {
    expect(shortModel(null)).toBe("?");
  });
  it("handles future versions like claude-opus-5-0", () => {
    expect(shortModel("claude-opus-5-0")).toBe("Opus 5.0");
  });
  it("falls back to truncated string for unknown format", () => {
    expect(shortModel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});
