import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-cache-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));

beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

import { SessionParseCache } from "../server/scanner/session-cache";

describe("SessionParseCache", () => {
  it("returns parsed sessions for valid files", () => {
    const fp = path.join(tmpDir, "sess-1.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const result = cache.getOrParse(fp, "test-key");
    expect(result).not.toBeNull();
    expect(result!.meta.sessionId).toBe("sess-1");
    expect(result!.meta.firstMessage).toBe("hello");
  });

  it("returns cached result on second call without re-reading", () => {
    const fp = path.join(tmpDir, "sess-2.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    const r2 = cache.getOrParse(fp, "test-key");
    // Same reference means cache was used
    expect(r1).toBe(r2);
  });

  it("re-parses when file size changes", () => {
    const fp = path.join(tmpDir, "sess-3.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");

    // Append more data
    fs.appendFileSync(fp, JSON.stringify({
      type: "assistant", timestamp: "2026-01-01T10:00:02Z", sessionId: "s1",
      uuid: "a1", parentUuid: "u1", isSidechain: false, requestId: "r1",
      message: { id: "m1", role: "assistant", model: "test", type: "message",
        stop_reason: "end_turn", content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 10, output_tokens: 5 } },
    }) + "\n");

    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1); // Different reference = re-parsed
    expect(r2!.counts.assistantMessages).toBe(1);
  });

  it("invalidateAll clears all cached entries", () => {
    const fp = path.join(tmpDir, "sess-4.jsonl");
    fs.writeFileSync(fp, JSON.stringify({
      type: "user", timestamp: "2026-01-01T10:00:00Z", sessionId: "s1",
      uuid: "u1", parentUuid: "", isSidechain: false,
      message: { role: "user", content: "hello" },
    }) + "\n");

    const cache = new SessionParseCache();
    const r1 = cache.getOrParse(fp, "test-key");
    cache.invalidateAll();
    const r2 = cache.getOrParse(fp, "test-key");
    expect(r2).not.toBe(r1);
  });

  it("returns null for nonexistent file", () => {
    const cache = new SessionParseCache();
    expect(cache.getOrParse("/nonexistent/file.jsonl", "key")).toBeNull();
  });
});
