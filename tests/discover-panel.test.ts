// tests/discover-panel.test.ts
import { describe, it, expect } from "vitest";
import { SAFETY_DISCLAIMER, VIRUSTOTAL_URL } from "../client/src/components/library/discover-panel";

describe("discover-panel safety disclaimer", () => {
  it("safety disclaimer text is correct", () => {
    expect(SAFETY_DISCLAIMER).toContain("caution");
    expect(SAFETY_DISCLAIMER).toContain("Review files");
  });

  it("VirusTotal URL is correct", () => {
    expect(VIRUSTOTAL_URL).toBe("https://www.virustotal.com/");
  });
});
