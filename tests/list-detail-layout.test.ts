// tests/list-detail-layout.test.ts
import { describe, it, expect } from "vitest";
import { getLayoutMode } from "../client/src/components/analytics/sessions/ListDetailLayout";

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
});
