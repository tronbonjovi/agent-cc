import { describe, it, expect } from "vitest";

describe("board viewport layout", () => {
  it("board root uses h-full and overflow-hidden", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    expect(src).toMatch(/flex flex-col h-full overflow-hidden/);
  });

  it("3-zone row uses min-h-0 to allow height constraint", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    expect(src).toMatch(/min-h-0 flex-1/);
  });

  it("sidebar wrappers use h-full for height constraint", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/board.tsx", "utf-8");
    const hFullSidebarCount = (src.match(/shrink-0 overflow-hidden h-full/g) || []).length;
    expect(hFullSidebarCount).toBeGreaterThanOrEqual(2);
  });
});
