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

describe("PageContainer scroll support", () => {
  it("PageContainer renders with h-full and overflow-y-auto by default", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/components/page-container.tsx", "utf-8");
    expect(src).toMatch(/h-full/);
    expect(src).toMatch(/overflow-y-auto/);
  });
});

describe("scroll pages use PageContainer defaults", () => {
  const scrollPages = [
    "client/src/pages/library.tsx",
    "client/src/pages/stats.tsx",
    "client/src/pages/settings.tsx",
  ];

  for (const page of scrollPages) {
    it(`${page} uses PageContainer`, async () => {
      const fs = await import("fs");
      const src = fs.readFileSync(page, "utf-8");
      expect(src).toMatch(/PageContainer/);
    });
  }

  it("sessions.tsx removes hardcoded calc(100vh - 220px) height", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/sessions.tsx", "utf-8");
    expect(src).not.toMatch(/100vh\s*-\s*220px/);
  });
});
