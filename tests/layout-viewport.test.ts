import { describe, it, expect } from "vitest";

describe("layout viewport contract", () => {
  it("content wrapper uses overflow-hidden not overflow-y-auto", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/layout.tsx", "utf-8");
    const mainContentMatch = src.match(/className="flex-1\s+([^"]+)"/g) || [];
    const contentWrappers = mainContentMatch.filter(m => m.includes("flex-1"));
    const hasScrollWrapper = contentWrappers.some(m => m.includes("overflow-y-auto"));
    expect(hasScrollWrapper, "layout.tsx should not have overflow-y-auto on the content wrapper").toBe(false);
  });

  it("page-enter wrapper passes height to children", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/layout.tsx", "utf-8");
    expect(src).toContain("page-enter h-full");
  });
});
