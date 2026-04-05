import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parseJSONLForCosts, createCostRecordId, extractParentSessionId } from "../server/scanner/cost-indexer";

describe("cost-indexer", () => {
  describe("createCostRecordId", () => {
    it("creates deterministic ID from session + timestamp + model", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      expect(id1).toBe(id2);
    });

    it("creates different IDs for different inputs", () => {
      const id1 = createCostRecordId("sess-1", "2026-04-05T12:00:00Z", "claude-opus-4-6");
      const id2 = createCostRecordId("sess-1", "2026-04-05T12:00:01Z", "claude-opus-4-6");
      expect(id1).not.toBe(id2);
    });
  });

  describe("extractParentSessionId", () => {
    it("extracts parent session ID from subagent path", () => {
      const fp = "/home/user/.claude/projects/proj-key/abc-123-def/subagents/agent-xyz.jsonl";
      expect(extractParentSessionId(fp)).toBe("abc-123-def");
    });

    it("returns null for non-subagent paths", () => {
      const fp = "/home/user/.claude/projects/proj-key/abc-123-def.jsonl";
      expect(extractParentSessionId(fp)).toBeNull();
    });

    it("returns null for top-level subagents dir", () => {
      const fp = "/home/user/.claude/projects/proj-key/subagents/agent-xyz.jsonl";
      expect(extractParentSessionId(fp)).toBeNull();
    });
  });

  describe("parseJSONLForCosts", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-indexer-test-"));
    });

    it("extracts cost records from assistant messages with usage", () => {
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:00Z",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 10,
              output_tokens: 50,
              cache_read_input_tokens: 5000,
              cache_creation_input_tokens: 200,
            },
          },
        }),
        JSON.stringify({
          type: "user",
          timestamp: "2026-04-05T12:00:01Z",
          message: { content: "hello" },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-04-05T12:00:02Z",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 5,
              output_tokens: 100,
              cache_read_input_tokens: 5200,
              cache_creation_input_tokens: 0,
            },
          },
        }),
      ].join("\n");

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "test-session", null, "test-project", 0);
      expect(records).toHaveLength(2);

      expect(records[0].model).toBe("claude-opus-4-6");
      expect(records[0].modelFamily).toBe("opus-4-6");
      expect(records[0].inputTokens).toBe(10);
      expect(records[0].outputTokens).toBe(50);
      expect(records[0].cacheReadTokens).toBe(5000);
      expect(records[0].cacheCreationTokens).toBe(200);
      expect(records[0].cost).toBeGreaterThan(0);
      expect(records[0].parentSessionId).toBeNull();
      expect(records[0].pricingSnapshot.input).toBe(5); // Opus 4.6 rate

      expect(records[1].timestamp).toBe("2026-04-05T12:00:02Z");
    });

    it("skips user messages and assistant messages without usage", () => {
      const jsonl = [
        JSON.stringify({ type: "user", message: { content: "hi" } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }),
      ].join("\n");

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(0);
    });

    it("reads from byte offset for incremental parsing", () => {
      const line1 = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });
      const line2 = JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:02Z",
        message: { model: "claude-sonnet-4-6", usage: { input_tokens: 20, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, line1 + "\n" + line2 + "\n");

      const offset = Buffer.byteLength(line1 + "\n");
      const records = parseJSONLForCosts(filePath, "sess", null, "proj", offset);
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe("claude-sonnet-4-6");
    });

    it("handles malformed JSON lines gracefully", () => {
      const jsonl = "not json\n" + JSON.stringify({
        type: "assistant",
        timestamp: "2026-04-05T12:00:00Z",
        message: { model: "claude-opus-4-6", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      });

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, jsonl);

      const records = parseJSONLForCosts(filePath, "sess", null, "proj", 0);
      expect(records).toHaveLength(1);
    });
  });
});
