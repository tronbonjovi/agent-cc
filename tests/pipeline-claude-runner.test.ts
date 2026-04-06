import { describe, it, expect, vi } from "vitest";
import { buildClaudeArgs, buildClaudeEnv } from "../server/scanner/claude-runner";

describe("buildClaudeArgs", () => {
  it("includes standard pipeline flags", () => {
    const args = buildClaudeArgs({ model: "sonnet", maxTurns: 10 });
    expect(args).toContain("-p");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--max-turns");
    expect(args).toContain("10");
    expect(args).toContain("--no-session-persistence");
  });

  it("uses defaults when no options given", () => {
    const args = buildClaudeArgs({});
    expect(args).toContain("haiku");
    expect(args).toContain("1");
  });
});

describe("buildClaudeEnv", () => {
  it("removes CLAUDECODE from env", () => {
    const env = buildClaudeEnv();
    expect(env.CLAUDECODE).toBeUndefined();
  });
});
