// tests/session-sidebar.test.ts
//
// Tests for the Messages tab SessionSidebar component.
//
// Matches the convention used by session-list.test.ts: we import pure helper
// functions from the component module and test them directly. The React tree
// itself is verified implicitly through the rendered component once it lands
// in the messages tab wiring (task005).

import { describe, it, expect } from "vitest";

describe("SessionSidebar", () => {
  describe("module exports", () => {
    it("exports SessionSidebar component", async () => {
      const mod = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(typeof mod.SessionSidebar).toBe("function");
    });

    it("exports filterSessionsBySearch helper", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(typeof filterSessionsBySearch).toBe("function");
    });

    it("exports sortByNewest helper", async () => {
      const { sortByNewest } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(typeof sortByNewest).toBe("function");
    });

    it("exports readSelectedSessionFromUrl helper", async () => {
      const { readSelectedSessionFromUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(typeof readSelectedSessionFromUrl).toBe("function");
    });

    it("exports writeSelectedSessionToUrl helper", async () => {
      const { writeSelectedSessionToUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(typeof writeSelectedSessionToUrl).toBe("function");
    });
  });

  describe("filterSessionsBySearch", () => {
    const sample = [
      {
        id: "abc12345",
        slug: "fix-login-bug",
        firstMessage: "Help me fix the login bug",
        displayName: undefined,
      },
      {
        id: "def67890",
        slug: "refactor-api",
        firstMessage: "Refactor the API routes",
        displayName: "API Cleanup",
      },
      {
        id: "ghi11121",
        slug: "tests",
        firstMessage: "Write more unit tests",
        displayName: undefined,
      },
    ];

    it("returns all sessions when search is empty", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(filterSessionsBySearch(sample, "")).toHaveLength(3);
      expect(filterSessionsBySearch(sample, undefined)).toHaveLength(3);
    });

    it("filters by firstMessage text", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const result = filterSessionsBySearch(sample, "login");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("abc12345");
    });

    it("filters by displayName text", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const result = filterSessionsBySearch(sample, "cleanup");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("def67890");
    });

    it("filters by slug text", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const result = filterSessionsBySearch(sample, "refactor");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("def67890");
    });

    it("filters by session id prefix", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const result = filterSessionsBySearch(sample, "ghi");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ghi11121");
    });

    it("search is case-insensitive", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const result = filterSessionsBySearch(sample, "LOGIN");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("abc12345");
    });

    it("returns empty array when nothing matches", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(filterSessionsBySearch(sample, "zzz-nothing")).toHaveLength(0);
    });

    it("tolerates missing optional fields", async () => {
      const { filterSessionsBySearch } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const minimal = [
        { id: "one", slug: "", firstMessage: "", displayName: undefined },
        { id: "two", slug: "", firstMessage: "", displayName: undefined },
      ];
      expect(filterSessionsBySearch(minimal, "one")).toHaveLength(1);
    });
  });

  describe("sortByNewest", () => {
    it("sorts sessions newest first by lastTs", async () => {
      const { sortByNewest } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const sessions = [
        { id: "1", lastTs: "2026-04-10T10:00:00Z" },
        { id: "2", lastTs: "2026-04-10T12:00:00Z" },
        { id: "3", lastTs: "2026-04-09T08:00:00Z" },
      ];
      const result = sortByNewest(sessions);
      expect(result[0].id).toBe("2");
      expect(result[1].id).toBe("1");
      expect(result[2].id).toBe("3");
    });

    it("handles null lastTs (pushes to end)", async () => {
      const { sortByNewest } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const sessions = [
        { id: "1", lastTs: null },
        { id: "2", lastTs: "2026-04-10T12:00:00Z" },
      ];
      const result = sortByNewest(sessions);
      expect(result[0].id).toBe("2");
      expect(result[1].id).toBe("1");
    });

    it("is stable on ties (does not mutate input)", async () => {
      const { sortByNewest } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const input = [
        { id: "1", lastTs: "2026-04-10T10:00:00Z" },
        { id: "2", lastTs: "2026-04-10T10:00:00Z" },
      ];
      const originalOrder = input.map((s) => s.id).join(",");
      sortByNewest(input);
      // Input should not be mutated
      expect(input.map((s) => s.id).join(",")).toBe(originalOrder);
    });
  });

  describe("URL param sync", () => {
    it("readSelectedSessionFromUrl returns ?id= value", async () => {
      const { readSelectedSessionFromUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(readSelectedSessionFromUrl("?id=abc123")).toBe("abc123");
      expect(readSelectedSessionFromUrl("?foo=bar&id=xyz")).toBe("xyz");
    });

    it("readSelectedSessionFromUrl returns null when missing", async () => {
      const { readSelectedSessionFromUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      expect(readSelectedSessionFromUrl("")).toBeNull();
      expect(readSelectedSessionFromUrl("?foo=bar")).toBeNull();
    });

    it("writeSelectedSessionToUrl sets id param", async () => {
      const { writeSelectedSessionToUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const next = writeSelectedSessionToUrl("?foo=bar", "abc123");
      const params = new URLSearchParams(next);
      expect(params.get("id")).toBe("abc123");
      expect(params.get("foo")).toBe("bar");
    });

    it("writeSelectedSessionToUrl removes id param when cleared", async () => {
      const { writeSelectedSessionToUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const next = writeSelectedSessionToUrl("?foo=bar&id=old", null);
      const params = new URLSearchParams(next);
      expect(params.get("id")).toBeNull();
      expect(params.get("foo")).toBe("bar");
    });

    it("writeSelectedSessionToUrl preserves existing params", async () => {
      const { writeSelectedSessionToUrl } = await import(
        "../client/src/components/analytics/messages/SessionSidebar"
      );
      const next = writeSelectedSessionToUrl("?atab=messages&tab=sessions", "sess42");
      const params = new URLSearchParams(next);
      expect(params.get("atab")).toBe("messages");
      expect(params.get("tab")).toBe("sessions");
      expect(params.get("id")).toBe("sess42");
    });

    it("uses the same ?id= key as the Sessions tab", async () => {
      // Guardrail: if the Sessions tab ever switches to a different param,
      // this test documents that the sidebar must match.
      const { writeSelectedSessionToUrl, readSelectedSessionFromUrl } =
        await import(
          "../client/src/components/analytics/messages/SessionSidebar"
        );
      const written = writeSelectedSessionToUrl("", "sess42");
      expect(readSelectedSessionFromUrl(written)).toBe("sess42");
      // The param name is explicitly "id", not "session" — matching SessionsTab
      expect(written).toContain("id=sess42");
    });
  });
});
