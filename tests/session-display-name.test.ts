import { describe, it, expect } from "vitest";
import { getSessionDisplayName } from "../client/src/lib/session-display-name";

describe("getSessionDisplayName", () => {
  const id = "abc-123-def-456-ghi-789-jkl-012-mno";

  it("prefers custom name over everything", () => {
    expect(getSessionDisplayName(id, {
      customNames: { [id]: "Auth Refactor" },
      slug: "random-slug",
      firstMessage: "Fix the login bug",
    })).toBe("Auth Refactor");
  });

  it("falls back to slug when no custom name", () => {
    expect(getSessionDisplayName(id, {
      slug: "partitioned-bouncing-hickey",
      firstMessage: "Fix the login bug",
    })).toBe("partitioned-bouncing-hickey");
  });

  it("falls back to first message summary when no slug", () => {
    expect(getSessionDisplayName(id, {
      firstMessage: "Fix the login bug in the authentication module please",
    })).toBe("Fix the login bug in...");
  });

  it("falls back to truncated ID when nothing else", () => {
    expect(getSessionDisplayName(id, {})).toBe("abc-123-def-4...");
  });

  it("truncates long custom names", () => {
    const longName = "This is a very long session name that exceeds the maximum character limit";
    const result = getSessionDisplayName(id, { customNames: { [id]: longName }, maxLength: 40 });
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith("…")).toBe(true);
  });
});
