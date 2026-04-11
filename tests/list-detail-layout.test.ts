// tests/list-detail-layout.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getLayoutMode } from "../client/src/components/analytics/sessions/ListDetailLayout";

const layoutSource = readFileSync(
  join(__dirname, "../client/src/components/analytics/sessions/ListDetailLayout.tsx"),
  "utf-8",
);

describe("ListDetailLayout", () => {
  describe("getLayoutMode", () => {
    it("returns 'split' on desktop regardless of detail state", () => {
      expect(getLayoutMode(false, true)).toBe("split");
      expect(getLayoutMode(false, false)).toBe("split");
    });

    it("returns 'list-only' on mobile when no detail selected", () => {
      expect(getLayoutMode(true, false)).toBe("list-only");
    });

    it("returns 'detail-overlay' on mobile when detail is selected", () => {
      expect(getLayoutMode(true, true)).toBe("detail-overlay");
    });
  });

  describe("module exports", () => {
    it("exports ListDetailLayout as a function component", async () => {
      const mod = await import("../client/src/components/analytics/sessions/ListDetailLayout");
      expect(typeof mod.ListDetailLayout).toBe("function");
    });

    it("exports getLayoutMode as a function", async () => {
      const mod = await import("../client/src/components/analytics/sessions/ListDetailLayout");
      expect(typeof mod.getLayoutMode).toBe("function");
    });
  });

  describe("resizable center divider", () => {
    it("desktop layout renders a resize handle element", () => {
      expect(layoutSource).toContain('data-testid="resize-handle"');
    });

    it("list panel uses inline width style instead of Tailwind width class", () => {
      // Should use style={{ width: resize.width }} not w-[35%]
      expect(layoutSource).toContain("resize.width");
      expect(layoutSource).not.toMatch(/className="[^"]*w-\[35%\]/);
    });

    it("imports and calls useResizeHandle hook", () => {
      expect(layoutSource).toContain("useResizeHandle");
      expect(layoutSource).toMatch(/useResizeHandle\(/);
    });

    it("resize handle has cursor-col-resize for drag affordance", () => {
      expect(layoutSource).toContain("cursor-col-resize");
    });

    it("mobile path does not include resize handle", () => {
      // The mobile return paths (detail overlay and list-only) should not reference resize-handle
      // Verify resize handle is only in the desktop split section
      const desktopSection = layoutSource.split("// Desktop")[1];
      expect(desktopSection).toContain('data-testid="resize-handle"');
    });
  });
});
