import { describe, it, expect } from "vitest";

describe("dashboard viewport layout", () => {
  it("dashboard PageContainer uses overflow-hidden to prevent double scroll", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    expect(src).toMatch(/PageContainer[\s\S]*?overflow-hidden/);
  });

  it("active sessions area is centered", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    expect(src).toMatch(/mx-auto/);
  });

  it("active sessions area has its own scroll", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/dashboard.tsx", "utf-8");
    expect(src).toMatch(/overflow-y-auto/);
  });
});
