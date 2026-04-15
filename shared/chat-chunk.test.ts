// shared/chat-chunk.test.ts
//
// Pure-logic tests for the wire-format parser shared by the chat server and
// the chat-panel live renderer. Fixtures are copied verbatim from the
// 2026-04-15 wire probe captured against prod (see
// .claude/roadmap/drafts/2026-04-15-chat-live-streaming-client-fix.md) — if
// these ever stop matching what the CLI emits, the client and server both
// need updating at the same time.

import { describe, it, expect } from "vitest";
import { extractChunkText, getContentBlocks } from "./chat-chunk";

describe("extractChunkText", () => {
  it("pulls text out of a canonical assistant text chunk (real wire shape)", () => {
    const chunk = {
      type: "text",
      raw: {
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          id: "msg_abc",
          content: [{ type: "text", text: "What should I probe?" }],
        },
      },
    };
    expect(extractChunkText(chunk)).toBe("What should I probe?");
  });

  it("concatenates multiple text blocks on the same envelope", () => {
    const chunk = {
      type: "text",
      raw: {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
      },
    };
    expect(extractChunkText(chunk)).toBe("Hello world");
  });

  it("ignores non-text blocks on a text chunk envelope", () => {
    const chunk = {
      type: "text",
      raw: {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "start" },
            { type: "tool_use", id: "t_1", name: "Read", input: {} },
            { type: "text", text: " end" },
          ],
        },
      },
    };
    expect(extractChunkText(chunk)).toBe("start end");
  });

  it("returns '' for the legacy wrong-path shape (chunk.raw.text)", () => {
    // Regression: the pre-fix client read `chunk.raw.text` directly. If
    // someone ever reintroduces that shape (or a mock that mimics it), the
    // shared helper must refuse to produce text — forcing the caller to fix
    // the shape instead of silently matching the old bug.
    const chunk = { type: "text", raw: { text: "this should not resolve" } };
    expect(extractChunkText(chunk)).toBe("");
  });

  it("returns '' for non-text chunks", () => {
    expect(
      extractChunkText({
        type: "system",
        raw: { type: "system", subtype: "init" },
      }),
    ).toBe("");
    expect(extractChunkText({ type: "done", raw: null })).toBe("");
    expect(
      extractChunkText({
        type: "thinking",
        raw: {
          type: "assistant",
          message: {
            content: [{ type: "thinking", thinking: "secret plan" }],
          },
        },
      }),
    ).toBe("");
  });

  it("returns '' on malformed or missing envelopes", () => {
    expect(extractChunkText({ type: "text", raw: null })).toBe("");
    expect(extractChunkText({ type: "text", raw: undefined })).toBe("");
    expect(extractChunkText({ type: "text", raw: 42 as any })).toBe("");
    expect(extractChunkText({ type: "text", raw: { message: null } })).toBe(
      "",
    );
    expect(
      extractChunkText({ type: "text", raw: { message: { content: "oops" } } }),
    ).toBe("");
    expect(extractChunkText(null)).toBe("");
    expect(extractChunkText(undefined)).toBe("");
  });
});

describe("getContentBlocks", () => {
  it("returns the content array for a well-formed envelope", () => {
    const blocks = getContentBlocks({
      type: "assistant",
      message: { content: [{ type: "text", text: "hi" }] },
    });
    expect(blocks).toEqual([{ type: "text", text: "hi" }]);
  });

  it("returns null for junk inputs", () => {
    expect(getContentBlocks(null)).toBeNull();
    expect(getContentBlocks(undefined)).toBeNull();
    expect(getContentBlocks(42)).toBeNull();
    expect(getContentBlocks({})).toBeNull();
    expect(getContentBlocks({ message: null })).toBeNull();
    expect(getContentBlocks({ message: {} })).toBeNull();
    expect(getContentBlocks({ message: { content: "not-an-array" } })).toBeNull();
  });
});
